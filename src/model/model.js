const { config } = require('../../constants');
const mailer = require('../config/mailer');
const { prepareSubscriberCreateRequest, prepareSubscriberRemoveRequest, prepareResponseSubmissionRequest } = require('../resources/govdelResources');
const { getUsers } = require('../connectors/vdsConnector');
const mongoConnector = require('../connectors/mongoConnector');
const request = require('request');
const logger = require('winston');
const fs = require('fs');

global.report = '';

let callbacks = 0;

const test = async () => {
    console.log('starting test');

    setTimeout(() => {
        callback();
    }, 1000);

    const callback = () => {
        console.log('callback in test');
    };

    console.log('at end of test');
};


const logToReport = (str) => {
    global.report += '<p>' + str + '</p>';
};

const removeAllSubscribers = async () => {

    return new Promise(async (resolve, reject) => {
        const ops = [];

        logger.info('Requesting local DB connection');
        const connection = await mongoConnector.getConnection();
        logger.info(`Connecting to ${config.db.users_collection} collection`);
        const collection = connection.collection(config.db.users_collection);

        logger.info('Get all subscribers');
        const allUsers = await collection.find().toArray() || [];

        allUsers.forEach(user => {
            ops.push({
                deleteOne:
                    {
                        filter: { uniqueidentifier: user.uniqueidentifier }
                    }
            });
        });

        logger.info('Delete all subscribers from local DB');
        if (ops.length > 0) {
            await collection.bulkWrite(ops);
        }
        logger.info('Releasing local DB connection');
        await mongoConnector.releaseConnection();

        logger.info('Starting to delete remote subscribers');
        for (let user of allUsers) {
            // Use throttle to send up to 100 requests in parallel.
            await throttle(100);
            logger.info(`making request to delete ${user.email}`);
            try {
                request.delete(prepareSubscriberRemoveRequest(user.email), callback);
            } catch (error) {
                logToReport(error);
                logger.error(error);
                reject(error);
            }
        }
        // make sure all remote requests are completed before resolving
        await waitForCallbacks();
        logger.info('Subscriber removal completed');
        resolve();
    });

};

const reloadLocalSubscriberBaseOnly = async () => {
    const connection = await mongoConnector.getConnection();
    logger.info(`Connecting to ${config.db.users_collection} collection`);
    const collection = connection.collection(config.db.users_collection);

    const usersFromCurrentVds = await getUsers('nci');

    try {
        await collection.remove({});
        await collection.insertMany(usersFromCurrentVds);
        mongoConnector.releaseConnection();
    } catch (error) {
        logger.error(error);
    }

};

const compareSubscriberLists = (leftList, rightList) => {

    const toAdd = [];
    const toUpdate = [];
    const toRemove = [];

    let left = leftList.shift();
    let right = rightList.shift();
    let counter = 0;
    while (left || right) {
        // console.log(`${++counter}: ${left.email} - ${right.email}`);
        if (left && right && left.email === right.email) {
            // Check for changes in any of the record fields
            if (left.status !== right.status || left.division !== right.division || left.building !== right.building) {
                toUpdate.push(left); // actual
                // toRemove.push(left);
            }
            left = leftList.shift();
            right = rightList.shift();
        } else if (right && (!left || left.email > right.email)) {
            // subscriber has to be removed
            toRemove.push(right);
            right = rightList.shift();
        } else if (left && (!right || left.email < right.email)) {
            // subscriber has to be added
            toAdd.push(left); // actual
            // toRemove.push(left);
            left = leftList.shift();
        } else {
            console.log(`${JSON.stringify(left)} and ${JSON.stringify(right)}`);
        }
    }

    return [toAdd, toUpdate, toRemove];
};

const reloadAllSubscribers = async () => {

    logToReport('Reloading all subscribers');
    try {
        logToReport('1. Remove all subscribers ');
        logger.info('Removing all subscribers');
        try {
            await removeAllSubscribers();
        } catch (error) {
            logger.error(`Failed to remove all subscribers: ${error}`);
        }


        logToReport('2. Load all subscribers in local database');
        logger.info('Starting load of all subscribers in local DB');
        logger.info('Requesting local DB connection');

        const connection = await mongoConnector.getConnection();

        logger.info(`Connecting to ${config.db.users_collection} collection`);
        const collection = connection.collection(config.db.users_collection);

        logger.info('Getting all subscribers from source');
        const usersFromCurrentVds = await getUsers('nci');
        let ops = [];
        usersFromCurrentVds.forEach(user => {
            if (validEntry(user)) {
                ops.push({
                    insertOne:
                        {
                            document: user
                        }
                });
            } else {
                logger.error(`user ${user.email} has invalid entries among ${getAnswers(user)}`);
                logToReport(`user ${user.email} has invalid entries among ${getAnswers(user)}`);
            }
        });

        logger.info('Storing all subscribers to local DB');
        if (ops.length > 0) {
            await collection.bulkWrite(ops);
        }
        logger.info('Releasing local DB connection');
        await mongoConnector.releaseConnection();

        logToReport('3. Load all subscribers into remote database');
        logger.info('Loading all subscribers into remote DB');
        for (const user of usersFromCurrentVds) {
            if (validEntry(user)) {
                logger.info(`adding ${user.email}`);
                try {
                    // Use throttle to send up to 100 requests in parallel.
                    await throttle(100);
                    const subCreateRequest = prepareSubscriberCreateRequest(user.email);
                    request.post(subCreateRequest, ((error, response, body) => {
                        if (!error && response.statusCode === 200) {
                            request.put(prepareResponseSubmissionRequest(user), callback);
                        } else {
                            logger.error(`Failed to add ${user.email} in GovDelivery. error  ${error}, code: ${response ? response.statusCode : 'N/A'}, body: ${body || ''}`);
                            logToReport(`Failed to add ${user.email} in GovDelivery. error  ${error}, code: ${response ? response.statusCode : 'N/A'}, body: ${body || ''}`);
                            releaseCallback();
                        }
                    })
                    );
                } catch (error) {
                    logger.error(`Failed at update of ${user.email}`);
                    logToReport(`Failed at update of ${user.email}`);
                    await mailer.sendReport();
                    process.exit(1);
                }
            }
        }

    } catch (error) {
        logger.error(error);
    }
};

/**
 * Compares local and remote subscriber records to find missing records on the remote
 */
const findMissingSubscribersInRemote = () => {

};

const updateSubscribers = async () => {
    logToReport('Starting subscriber update on ' + Date().toLocaleString());

    const connection = await mongoConnector.getConnection();
    logger.info(`Connecting to ${config.db.users_collection} collection`);
    const collection = connection.collection(config.db.users_collection);

    logger.info('Retrieving users from VDS');
    // const usersFromCurrentVds = await getUsers('nci');        
    const usersFromCurrentVds = await getUsers('nci');
    logger.info('Retrieving user set from previous update');
    const usersFromPreviousUpdate = await collection.find().sort({ email: 1 }).toArray() || [];

    logger.info('Comparing subscriber lists');
    const [toAdd, toUpdate, toRemove] = compareSubscriberLists(usersFromCurrentVds, usersFromPreviousUpdate);

    logToReport(toAdd.length + ' users to add.');
    logToReport(toUpdate.length + ' users to update.');
    logToReport(toRemove.length + ' users to remove.');

    logger.info(toAdd.length + ' to add');
    logger.info(toUpdate.length + ' to update');
    // console.log(toAdd.join('\n'));
    logger.info(toRemove.length + ' to remove');
    // console.log(toRemove.join('\n'));
    // });

    if (toRemove.lenght > 0) {
        logger.info('Start removal of subscribers');
    }
    for (const user of toRemove) {
        logger.info(`removing ${user.email}`);
        try {
            await lock();
            await collection.deleteOne(
                {
                    uniqueidentifier: user.uniqueidentifier
                });
            request.delete(prepareSubscriberRemoveRequest(user.email), callback);
        } catch (error) {
            logger.error(`Failed at removal of ${user.email}`);
            logToReport(`Failed at removal of ${user.email}`);
            await mailer.sendReport();
            process.exit(1);
        }
    }

    if (toUpdate.length > 0) {
        logger.info('Start update of subscribers');
    }
    for (const user of toUpdate) {
        if (validEntry(user)) {
            logger.info(`updating ${user.email}`);
            try {
                await lock();
                await collection.replaceOne(
                    { uniqueidentifier: user.uniqueidentifier },
                    user,
                    { upsert: true }
                );
                request.put(prepareResponseSubmissionRequest(user), callback);

            } catch (error) {
                logger.error(`Failed at update of ${user.email}`);
                logToReport(`Failed at update of ${user.email}`);
                await mailer.sendReport();
                process.exit(1);
            }
        }
    }

    if (toAdd.length > 0) {
        logger.info('Start addition of subscribers');
    }
    for (const user of toAdd) {
        if (validEntry(user)) {
            logger.info(`adding ${user.email}`);
            try {
                await lock();
                await collection.insertOne(user);
                const subCreateRequest = prepareSubscriberCreateRequest(user.email);
                request.post(subCreateRequest, ((error, response, body) => {
                    if (!error && response.statusCode === 200) {
                        request.put(prepareResponseSubmissionRequest(user), callback);
                    } else {
                        logger.error(`Failed to add ${user.email} in GovDelivery. error  ${error}, code: ${response ? response.statusCode : 'N/A'}, body: ${body || ''}`);
                        logToReport(`Failed to add ${user.email} in GovDelivery. error  ${error}, code: ${response ? response.statusCode : 'N/A'}, body: ${body || ''}`);
                        releaseCallback();
                    }
                })
                );
            } catch (error) {
                logger.error(`Failed at update of ${user.email}`);
                logToReport(`Failed at update of ${user.email}`);
                await mailer.sendReport();
                process.exit(1);
            }
        }
    }

    await mongoConnector.releaseConnection();
};

const getAnswers = (user) => {
    return `Status: ${user.status}, Division: ${user.division}, Building: ${user.building}`;
};

/**
 * Waits until outstanding callbacks fall under a specified number and then reserves a callback.
 * This can be used in situations when the number of parallel requests should be limited to avoid overload of the remote.
 */
const throttle = (maxCallbacks) => {
    return new Promise(resolve => {
        (function wait() {
            if (callbacks < maxCallbacks) {
                callbacks++;
                resolve();
            } else {
                console.log('waiting for throttled resources');
                setTimeout(wait, maxCallbacks);
            }
        })();
    });
};

/**
 * Waits until all outstanding callbacks have been called and then reserves a callback.
 * This can be used in situations when requests have to be made one at a time.
 */
const lock = () => {
    return new Promise(resolve => {
        (function wait() {
            if (callbacks === 0) {
                callbacks++;
                resolve();
            } else {
                console.log('waiting for lock');
                setTimeout(wait, 100);
            }
        })();
    });
};

const releaseCallback = () => {
    callbacks--;
};

/**
 * Waits until all outstanding callbacks have been called.
 */
const waitForCallbacks = () => {
    return new Promise(resolve => {
        (function wait() {
            if (callbacks === 0) {
                resolve();
            } else {
                console.log('waiting for completion');
                setTimeout(wait, 100);
            }
        })();
    });
};


const validEntry = (user) => {
    if (!config.govdel.status_answers[user.status]) {
        console.log(config.govdel.status_answers);
        logger.error(`config.govdel.status_answers[${user.status}] has a problem for ${user.email}`);
        process.exit(2);
    }
    if (!config.govdel.division_answers[user.division]) {
        logger.error(`config.govdel.division_answers[${user.division}] has a problem for ${user.email}`);
        process.exit(2);
    }
    if (!config.govdel.building_answers[user.building]) {
        logger.error(`config.govdel.building_answers[${user.building}] has a problem for ${user.email}`);
        process.exit(2);
    }

    return config.govdel.status_answers[user.status] &&
        config.govdel.division_answers[user.division] &&
        config.govdel.building_answers[user.building];
};

const callback = (error, response, body) => {

    releaseCallback();
    console.log(`callback! ... ${callbacks} callbacks outstanding.`);
    if (error || response.statusCode !== 200) {
        logger.error(`error  ${error}, code: ${response ? response.statusCode : 'N/A'}, body: ${body || ''}`);
        logToReport(`error  ${error}, code: ${response ? response.statusCode : 'N/A'}, body: ${body || ''}`);
    }
};

module.exports = { reloadAllSubscribers, updateSubscribers, removeAllSubscribers, reloadLocalSubscriberBaseOnly, test };
const { config, sendReport } = require('../../constants');
const { prepareSubscriberCreateRequest, prepareSubscriberRemoveRequest, prepareResponseSubmissionRequest } = require('../resources/govdelResources');
const { getUsers } = require('../connectors/vdsConnector');
const mongoConnector = require('../connectors/mongoConnector');
const request = require('request');
//const rp = require('request-promise');
const logger = require('winston');
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

    const ops = [];

    const connection = await mongoConnector.getConnection();
    logger.info(`Connecting to ${config.db.users_collection} collection`);
    const collection = connection.collection(config.db.users_collection);

    const allUsers = await collection.find().toArray() || [];

    allUsers.forEach(user => {
        ops.push({
            deleteOne:
                {
                    filter: { uniqueidentifier: user.uniqueidentifier }
                }
        });
    });

    if (ops.length > 0) {
        await collection.bulkWrite(ops);
    }
    await mongoConnector.releaseConnection();

    for (let user of allUsers) {
        await throttle();
        console.log('making request now');
        try {
            request.delete(prepareSubscriberRemoveRequest(user.email), callback);
            // callbacks++;
        } catch (error) {
            logToReport(error);
            console.log(error);
        }
    }

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
        right = right.document;
        console.log(`${++counter}: ${left.email} - ${right.email}`);
        if (left && right && left.email === right.email) {
            // Check for changes in any of the record fields
            if (left.status !== right.status || left.division !== right.division || left.building !== right.building) {
                toUpdate.push(left); // actual
                // toRemove.push(left);
            }
            console.log('here1');
            left = leftList.shift();
            right = rightList.shift();
        } else if (right && (!left || left.email > right.email)) {
            console.log('here2');
            // subscriber has to be removed
            toRemove.push(right);
            right = rightList.shift();
        } else if (left && (!right || left.email < right.email)) {
            console.log('here3');
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
        // await removeAllSubscribers();

        logToReport('2. Load all subscribers in local database');
        const connection = await mongoConnector.getConnection();
        logger.info(`Connecting to ${config.db.users_collection} collection`);
        const collection = connection.collection(config.db.users_collection);

        const usersFromCurrentVds = await getUsers('nci');
        let ops = [];
        usersFromCurrentVds.forEach(user => {
            if (validEntry(user)) {
                ops.push({
                    insertOne:
                        {
                            user
                        }
                });
            } else {
                logger.error(`user ${user.email} has invalid entries among ${getAnswers(user)}`);
                logToReport(`user ${user.email} has invalid entries among ${getAnswers(user)}`);
            }
        });

        if (ops.length > 0) {
            await collection.bulkWrite(ops);
        }
        await mongoConnector.releaseConnection();

        logToReport('3. Load all subscribers into remote database');
        for (const user of usersFromCurrentVds) {
            if (validEntry(user)) {
                logger.info(`adding ${user.email}`);
                try {
                    await throttle();
                    const subCreateRequest = prepareSubscriberCreateRequest(user.email);
                    request.post(subCreateRequest, ((error, response, body) => {
                        if (!error) {
                            request.put(prepareResponseSubmissionRequest(user), callback);
                        } else {
                            logger.error(`Failed to add ${user.email} in GovDelivery.`);
                            logToReport(`Failed to add ${user.email} in GovDelivery`);
                            unlock();
                        }
                    })
                    );
                } catch (error) {
                    logger.error(`Failed at update of ${user.email}`);
                    logToReport(`Failed at update of ${user.email}`);
                    await sendReport();
                    process.exit(1);
                }
            }
        }

    } catch (error) {
        logger.error(error);
    }
};

const updateSubscribers = async () => {
    logToReport('Starting subscriber update on ' + Date().toLocaleString());

    // const toAdd = [];
    // const toUpdate = [];
    // const toRemove = [];

    const connection = await mongoConnector.getConnection();
    logger.info(`Connecting to ${config.db.users_collection} collection`);
    const collection = connection.collection(config.db.users_collection);

    logger.info('Retrieving users from VDS');
    // const usersFromCurrentVds = await getUsers('nci');        
    const usersFromCurrentVds = await getUsers('nci');
    logger.info('Retrieving user set from previous update');
    const usersFromPreviousUpdate = await collection.find().sort({ email: 1 }).toArray() || [];

    // let left = usersFromCurrentVds.shift();
    // let right = usersFromPreviousUpdate.shift();
    logger.info('Comparing subscriber lists');
    const [toAdd, toUpdate, toRemove] = compareSubscriberLists(usersFromCurrentVds, usersFromPreviousUpdate);

    // while (left || right) {
    //     if (left && right && left.email === right.email) {
    //         // Check for changes in any of the record fields
    //         if (left.status !== right.status || left.division !== right.division || left.building !== right.building) {
    //             toUpdate.push(left); // actual
    //             // toRemove.push(left);
    //         }
    //         left = usersFromCurrentVds.shift();
    //         right = usersFromPreviousUpdate.shift();
    //     } else if (right && (!left || left.email > right.email)) {
    //         // subscriber has to be removed
    //         toRemove.push(right);
    //         right = usersFromPreviousUpdate.shift();
    //     } else if (left && (!right || left.email < right.email)) {
    //         // subscriber has to be added
    //         toAdd.push(left); // actual
    //         // toRemove.push(left);
    //         left = usersFromCurrentVds.shift();
    //     }
    // }
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
            // await throttle();
            await lock();
            await collection.deleteOne(
                {
                    filter: { uniqueidentifier: user.uniqueidentifier }
                });
            // callbacks++;
            request.delete(prepareSubscriberRemoveRequest(user.email), callback);
        } catch (error) {
            logger.error(`Failed at removal of ${user.email}`);
            logToReport(`Failed at removal of ${user.email}`);
            await sendReport();
            process.exit(1);
        }
    }

    // const ops = [];

    // toRemove.forEach(user => {
    //     ops.push({
    //         deleteOne:
    //             {
    //                 filter: { uniqueidentifier: user.uniqueidentifier }
    //             }
    //     });
    // });

    if (toUpdate.length > 0) {
        logger.info('Start update of subscribers');
    }
    for (const user of toUpdate) {
        if (validEntry(user)) {
            logger.info(`updating ${user.email}`);
            try {
                await lock();
                await collection.replaceOne(
                    {
                        filter: { uniqueidentifier: user.uniqueidentifier },
                        replacement: user,
                        upsert: true
                    });
                // callbacks++;
                request.put(prepareResponseSubmissionRequest(user), callback);

            } catch (error) {
                logger.error(`Failed at update of ${user.email}`);
                logToReport(`Failed at update of ${user.email}`);
                await sendReport();
                process.exit(1);
            }
        }
    }

    // toUpdate.forEach(user => {
    //     if (validEntry(user)) {
    //         ops.push({
    //             replaceOne:
    //                 {
    //                     filter: { uniqueidentifier: user.uniqueidentifier },
    //                     replacement: user,
    //                     upsert: true
    //                 }
    //         });
    //     } else {
    //         logger.error(`user ${user.email} has invalid entries among ${getAnswers(user)}`);
    //         logToReport(`user ${user.email} has invalid entries among ${getAnswers(user)}`);
    //     }
    // });

    if (toAdd.length > 0) {
        logger.info('Start addition of subscribers');
    }
    for (const user of toAdd) {
        if (validEntry(user)) {
            logger.info(`adding ${user.email}`);
            try {
                await lock();
                await collection.insertOne(
                    {
                        user
                    }
                );
                const subCreateRequest = prepareSubscriberCreateRequest(user.email);
                request.post(subCreateRequest, ((error, response, body) => {
                    if (response.statusCode === 200) {
                        request.put(prepareResponseSubmissionRequest(user), callback);
                    } else {
                        logger.error(`Failed to add ${user.email} in GovDelivery.`);
                        logToReport(`Failed to add ${user.email} in GovDelivery`);
                        unlock();
                    }
                })
                );
            } catch (error) {
                logger.error(`Failed at update of ${user.email}`);
                logToReport(`Failed at update of ${user.email}`);
                await sendReport();
                process.exit(1);
            }
        }
    }

    // toAdd.forEach(user => {
    //     if (validEntry(user)) {
    //         ops.push({
    //             insertOne:
    //                 {
    //                     document: user
    //                 }
    //         });
    //     } else {
    //         logger.error(`user ${user.email} has invalid entries among ${getAnswers(user)}`);
    //         logToReport(`user ${user.email} has invalid entries among ${getAnswers(user)}`);
    //     }
    // });

    // if (ops.length > 0) {
    //     await collection.bulkWrite(ops);
    // }
    await mongoConnector.releaseConnection();

    // for (let user of toAdd) {
    //     if (validEntry(user)) {
    //         // await delayFor(10);
    //         try {
    //             const subCreateRequest = prepareSubscriberCreateRequest(user.email);
    //             await throttle();
    //             callbacks++;
    //             logger.info(`Sending a new subscriber request for ${user.email}, callbacks: ${callbacks}`);
    //             const response = await request.post(subCreateRequest);
    //             callbacks--;
    //             if (response.statusCode === 200) {
    //                 await throttle();
    //                 callbacks++;
    //                 logger.info(`Sending responses for subscriber ${user.email}, callbacks: ${callbacks}`);
    //                 request.put(prepareResponseSubmissionRequest(user), callback);
    //             }
    //         } catch (error) {
    //             logToReport(error);
    //             logger.error(error);
    //         }
    //     }
    // }

    // An update to a subscriber can only be a change in the question responses. Hence, we call the response submission API. 
    // for (let user of toUpdate) {
    //     if (validEntry(user)) {
    //         // await delayFor(10);
    //         try {
    //             await throttle();
    //             callbacks++;
    //             request.put(prepareResponseSubmissionRequest(user), callback);
    //         } catch (error) {
    //             logToReport(error);
    //             logger.error(error);
    //         }
    //     }
    // }

    //     for (let user of toRemove) {
    //         // await delayFor(2000);
    //         console.log(`removing user ${user.email}`);
    //         try {
    //             await throttle();
    //             callbacks++;
    //             request.delete(prepareSubscriberRemoveRequest(user.email), callback);
    //         } catch (error) {
    //             logToReport(error);
    //             console.log(error);
    //         }
    //     }

    // } catch (error) {
    //     logger.error('FATAL ERROR: ' + error);
    //     logToReport(error);
    //     process.exitCode = 1;
    // }

};

const getAnswers = (user) => {
    return `Status: ${user.status}, Division: ${user.division}, Building: ${user.building}`;
};

// const delayFor = time => new Promise((resolve, reject) =>
//     setTimeout(() => resolve(true), time)
// );

const throttle = () => {
    return new Promise(resolve => {
        (function waitForCallbacks() {
            if (callbacks < 100) {
                callbacks++;
                return resolve();
            } else {
                console.log('wait more');
                setTimeout(waitForCallbacks, 100);
            }
        })();
    });
};

const lock = () => {
    return new Promise(resolve => {
        (function waitForCallbacks() {
            if (callbacks === 0) {
                callbacks++;
                return resolve();
            } else {
                console.log('wait more');
                setTimeout(waitForCallbacks, 100);
            }
        })();
    });
};

const unlock = () => {
    callbacks--;
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

    unlock();
    console.log(`callback! ... ${callbacks} callbacks outstanding.`);
    // console.log('unlocking');
    // unlock();
    if (error || response.statusCode !== 200) {
        logger.error(`error  ${error}, code: ${response && response.statusCode || 'N/A'}, ${response && response.body || ''}`);

        logToReport(`error  ${error}, code: ${response && response.statusCode || 'N/A'}, ${response && response.body || ''}`);
    }
};

module.exports = { reloadAllSubscribers, updateSubscribers, removeAllSubscribers, reloadLocalSubscriberBaseOnly, test };
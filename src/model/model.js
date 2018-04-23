'use strict';
const { config } = require('../../constants');
const mailer = require('../config/mailer');
const { prepareSubscriberCreateRequest, prepareSubscriberRemoveRequest, prepareSubscriberReadRequest, prepareResponseSubmissionRequest, prepareSubscriberTopicsReadRequest } = require('../resources/govdelResources');
const { getUsers } = require('../connectors/userInfoConnector');
const mongoConnector = require('../connectors/mongoConnector');
const request = require('request');
const rp = require('request-promise');
const logger = require('winston');
const parser = require('xml2json');

global.report = '';

let callbacks = 0;

const logToReport = (str) => {
    global.report += str + '<br/>';
};

const test = async () => {

    const email = 'svetoslav.yankov@gmail.gov';

    // Use throttle to send up to 100 requests in parallel.
    // await throttle(100);
    try {

        logger.info(`Getting user details for ${email}`);
        const subscriber = await getSubscriberIfExists(email);
        if (subscriber) {
            logger.info('Subscriber exists');
            // console.log(subscriber);
            logger.info('Get the subscriber\'s topics');
            const topicsResult = await rp.get(prepareSubscriberTopicsReadRequest(email));
            const topics = parseTopics(topicsResult);

            const [subscribedToAllStaffTopic, subscriberToOtherTopics] = checkTopicSubscriptions(topics);

            console.log(`NCI all staff: ${subscribedToAllStaffTopic}`);
            console.log(`Other topics:  ${subscriberToOtherTopics}`);


        } else {
            logger.info('Subscriber doesn\'t exist');
            logger.info(`Creating subscriber ${email}`);
            const subscriber = await rp.post(prepareSubscriberCreateRequest(email));
            console.log(subscriber);
        }

    } catch (error) {
        logger.error(error);
    }
};

const parseTopics = (topicsXmlResult) => {
    let topics = JSON.parse(parser.toJson(topicsXmlResult)).topics.topic;

    if (!(topics instanceof Array)) {
        topics = [topics];
    }

    return topics;
};

const checkTopicSubscriptions = (topics) => {
    let subscribedToAllStaffTopic = false;
    let subscribedToOtherTopics = false;
    topics.forEach(topic => {
        if (topic['to-param'] === config.govdel.nciAllTopicCode) {
            subscribedToAllStaffTopic = true;
        } else {
            subscribedToOtherTopics = true;
        }
    });

    return [subscribedToAllStaffTopic, subscribedToOtherTopics];
};

const getSubscriberIfExists = async (email) => {
    return new Promise(async (resolve, reject) => {
        try {
            const subscriber = await rp.get(prepareSubscriberReadRequest(email));
            resolve(subscriber);
        } catch (error) {
            // Subscriber not found returns 404 and error GD-15002
            if (error.statusCode === 404 && error.message.includes('GD-15002')) {
                resolve(false);
            } else {
                reject(error);
            }
        }
    });
};

const removeAllSubscribersNew = async () => {

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
                        filter: { ned_id: user.ned_id }
                    }
            });
        });

        logger.info('Starting to delete remote subscribers');
        for (let user of allUsers) {
            // Use throttle to send up to 100 requests in parallel.
            // await throttle(100);
            logger.info(`making request to delete ${user.email}`);
            try {

                // WORK HERE
                // Get the user from GovDelivery 
                // const subscriber = await rp.get(prepare)
                // Get subscriptions of user. Delete only if user has only NCI All Staff subscription

                request.delete(prepareSubscriberRemoveRequest(user.email), callback);
                // Otherwise only remove user from NCI All Staff topic

                // delete from local database
                await collection.deleteOne(
                    {
                        ned_id: user.ned_id
                    });


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
                        filter: { ned_id: user.ned_id }
                    }
            });
        });

        logger.info('Delete all subscribers from local DB');
        if (ops.length > 0) {
            // await collection.bulkWrite(ops);
        }
        logger.info('Releasing local DB connection');
        await mongoConnector.releaseConnection();

        logger.info('Starting to delete remote subscribers');
        for (let user of allUsers) {
            // Use throttle to send up to 100 requests in parallel.
            await throttle(100);
            logger.info(`making request to delete ${user.email}`);
            try {

                // WORK HERE

                // Get subscriptions of user. Delete only if user has only NCI All Staff subscription
                request.delete(prepareSubscriberRemoveRequest(user.email), callback);
                // Otherwise only remove user from NCI All Staff topic


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

    try {
        const usersFromCurrentVds = await getUsers('nci');
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
        if (left && right && left.email === right.email) {
            // Check for changes in any of the record fields
            if (left.status !== right.status || left.division !== right.division || left.sac !== right.sac || left.building !== right.building) {
                toUpdate.push(left); // actual
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
                    // Use throttle to send up to n requests in parallel.
                    await throttle(25);

                    // Check if subscriber exists remotely
                    // If subscriber exists, add them to the NCI All Staff topic
                    // Otherwise create subscriber record and add them to NCI All Staff topic

                    const subCreateRequest = prepareSubscriberCreateRequest(user.email);

                    request.post(subCreateRequest, (error, response, body) => {
                        if (!error && response.statusCode === 200) {
                            request.put(prepareResponseSubmissionRequest(user), callback);
                        } else {
                            logger.error(`Failed to add ${user.email} in GovDelivery | ${error} | body: ${body} | response: ${response}`);
                            logToReport(`Failed to add ${user.email} in GovDelivery | ${error} | body: ${body} | response: ${response}`);
                            releaseCallback();
                        }
                    });
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

const updateSubscribers = async () => {
    logToReport('Starting subscriber update on ' + Date().toLocaleString());

    const connection = await mongoConnector.getConnection();
    logger.info(`Connecting to ${config.db.users_collection} collection`);
    const collection = connection.collection(config.db.users_collection);

    logger.info('Retrieving users from UserInfo');
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
    logger.info(toRemove.length + ' to remove');

    if (toRemove.length > 0) {
        logger.info('Start removal of subscribers');
        logToReport('<p><strong>Removing the following subscribers:</strong></p>');
    }
    for (const user of toRemove) {
        logger.info(`removing ${user.email}`);
        try {
            await lock();
            await collection.deleteOne(
                {
                    ned_id: user.ned_id
                });
            logToReport(user.email);

            // Check if subscriber is member of only NCI All staff
            // If ember of multiple topics, only remove from NCI All staff topic
            // Else remove subscriber completely
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
        logToReport('<p><strong>Updating the following subscribers:</strong></p>');
    }
    for (const user of toUpdate) {
        if (validEntry(user)) {
            logger.info(`updating ${user.email}`);
            try {
                await lock();
                await collection.replaceOne(
                    { ned_id: user.ned_id },
                    user,
                    { upsert: true }
                );
                logToReport(user.email);
                // Respond to subscriber NCI all staff questions
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
        logToReport('<p><strong>Adding the following subscribers:</strong></p>');
    }
    for (const user of toAdd) {
        if (validEntry(user)) {
            logger.info(`adding ${user.email}, `);
            try {
                await lock();
                await collection.insertOne(user);
                // Check if subscriber exists remotely. In that case, add them to NCI All staff and answer questions. 
                // If it does exist, only add them to NCI All Staff topic and answer questions
                const subCreateRequest = prepareSubscriberCreateRequest(user.email);
                request.post(subCreateRequest, (error, response, body) => {
                    if (!error && response.statusCode === 200) {
                        logToReport(user.email);
                        request.put(prepareResponseSubmissionRequest(user), callback);
                    } else {
                        logger.error(`Failed to add ${user.email} in GovDelivery. | ${error}`);
                        logToReport(`Failed to add ${user.email} in GovDelivery. | ${error}`);
                        releaseCallback();
                    }
                });
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
    return `Status: ${user.status}, Division: ${user.division}, SAC: ${user.sac}, Building: ${user.building}`;
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
                setTimeout(wait, 100);
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
                // console.log('waiting for lock');
                setTimeout(wait, 100);
            }
        })();
    });
};

const releaseCallback = () => {
    callbacks--;
    console.log(`callback released! ...${callbacks} callbacks outstanding.`);
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
        logger.error(`config.govdel.status_answers[${user.status}]has a problem for ${user.email}`);
        process.exit(2);
    }
    if (!config.govdel.division_answers[user.division]) {
        logger.error(`config.govdel.division_answers[${user.division}]has a problem for ${user.email}`);
        process.exit(2);
    }
    if (!config.govdel.building_answers[user.building]) {
        logger.error(`config.govdel.building_answers[${user.building}]has a problem for ${user.email}`);
        process.exit(2);
    }
    if (!config.govdel.sac_answers[user.sac]) {
        logger.error(`config.govdel.sac_answers[${user.sac}]has a problem for ${user.email}`);
        process.exit(2);
    }

    return config.govdel.status_answers[user.status] &&
        config.govdel.division_answers[user.division] &&
        config.govdel.building_answers[user.building] &&
        config.govdel.sac_answers[user.sac];
};

const callback = (error, response, body) => {

    releaseCallback();
    if (error || response.statusCode !== 200) {
        logger.error(`${error} | body: ${body} | response: ${response}`);
        logToReport(`${error} | body: ${body} | response: ${response}`);
    }
};

module.exports = { reloadAllSubscribers, updateSubscribers, removeAllSubscribers, reloadLocalSubscriberBaseOnly, test };
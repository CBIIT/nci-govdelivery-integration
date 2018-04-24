'use strict';
const { config } = require('../../constants');
const mailer = require('../config/mailer');
const { prepareSubscriberCreateRequest, prepareSubscriberRemoveRequest, prepareSubscriberReadRequest, prepareResponseSubmissionRequest, prepareSubscriberTopicsReadRequest, prepareTopicSubmissionRequest } = require('../resources/govdelResources');
const { getUsers } = require('../connectors/userInfoConnector');
const mongoConnector = require('../connectors/mongoConnector');
const rp = require('request-promise');
const logger = require('winston');
const { util } = require('./util');

global.report = '';

const logToReport = (str) => {
    global.report += str + '<br/>';
};

const test = async () => {

    const email = 'svetoslav.yankov@gmail.gov';

    try {

        logger.info(`Getting user details for ${email}`);
        const subscriber = await getSubscriberIfExists(email);
        if (subscriber) {
            logger.info('Subscriber exists');
            logger.info('Get the subscriber\'s topics');
            const topicsResult = await rp.get(prepareSubscriberTopicsReadRequest(email));
            const topics = util.parseTopics(topicsResult);

            const [subscribedToAllStaffTopic, subscriberToOtherTopics] = util.checkTopicSubscriptions(topics);

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

/**
 * Gets a subscriber record from GovDelivery. If such subscriber is nto found it returns false.
 * @param {string} email 
 */
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

/**
 * Removes a subscriber from GovDelivery:
 * 1. If the subscriber is not found the request is ignored silently.
 * 2. If the subscriber is subscribed to more topics than All Staff, it is not removed, but only the NCI All staff subscription is removed.
 * 3. If the subscriber is subscribed only to All Staff it is removed completely.
 * @param {string} email 
 */
const removeGovDeliverySubscriber = async (email) => {
    return new Promise(async (resolve, reject) => {

        try {
            const subscriber = await getSubscriberIfExists(email);
            if (subscriber) {
                logger.info(`${email} exists. Getting topics...`);
                const topicsResult = await rp.get(prepareSubscriberTopicsReadRequest(email));
                const topics = util.parseTopics(topicsResult);

                const [subscribedToAllStaffTopic, subscribedToOtherTopics] = util.checkTopicSubscriptions(topics);

                if (!subscribedToAllStaffTopic) {
                    logger.info(`${email} is not subscribed to NCI All Staff, ignore.`);
                    resolve();
                }

                if (subscribedToOtherTopics) {
                    logger.info(`${email} is subscribed to other topics, only removing All Staff subscription.`);

                    await rp.put(prepareTopicSubmissionRequest(email, topics.filter(topic => topic !== config.govdel.nciAllTopicCode)));
                    resolve();
                    // Remove from NCIAllStaff topic
                } else {
                    logger.info(`${email} is only subscribed to NCI All Staff, removing subscriber completely.`);
                    await rp.delete(prepareSubscriberRemoveRequest(email));
                    resolve();
                }
            } else {
                logger.info(`${email} not found in GovDelivery, ignore.`);
                resolve();
            }

        } catch (error) {
            logger.error(`Failed to remove ${email} from GovDelivery. | ${error}`);
            logToReport(`Failed to add ${email} from GovDelivery. | ${error}`);
            reject(new Error(error));
        }
    });
};

const addGovDeliverySubscriber = async (user) => {
    return new Promise(async (resolve, reject) => {
        try {
            const subscriber = await getSubscriberIfExists(user.email);
            if (subscriber) {
                logger.info(`${user.email} exists. Getting topics...`);
                const topicsResult = await rp.get(prepareSubscriberTopicsReadRequest(user.email));
                const topics = util.parseTopics(topicsResult);

                const [subscribedToAllStaffTopic, subscribedToOtherTopics] = util.checkTopicSubscriptions(topics);
                if (!subscribedToAllStaffTopic) {
                    logger.info(`${user.email} is not subscribed to All Staff, subscribing now...`);
                    topics.add(config.govdel.nciAllTopicCode);
                    await rp.put(prepareTopicSubmissionRequest(user.email, topics));
                } else {
                    logger.info(`${user.email} is already subscribed to All Staff, skipping...`);
                }
                resolve();
            } else {
                // add a new subscriber record.
                await rp.post(prepareSubscriberCreateRequest(user.email));
                logToReport(user.email);
                await rp.put(prepareResponseSubmissionRequest(user));
                resolve();
            }
        } catch (error) {
            logger.error(`Failed to add ${user.email} in GovDelivery. | ${error}`);
            logToReport(`Failed to add ${user.email} in GovDelivery. | ${error}`);
            reject(new Error(error));
        }
    });
};

/**
 * Removes all subscribers one-by-one from the local and remote data store.
 */
const removeAllSubscribers = async () => {

    return new Promise(async (resolve, reject) => {

        logger.info('Starting process to remove all local and remote subscribers.');
        const connection = await mongoConnector.getConnection();
        logger.info(`Connecting to ${config.db.users_collection} collection`);
        const collection = connection.collection(config.db.users_collection);

        logger.info('Get all local subscribers');
        const allUsers = await collection.find().toArray() || [];

        for (let user of allUsers) {
            try {

                logger.info(`Removing ${user.email}`);
                await removeGovDeliverySubscriber(user.email);

                // delete from local database
                await collection.deleteOne(
                    {
                        ned_id: user.ned_id
                    });


            } catch (error) {
                logger.error(`Failed to remove ${user.email} from GovDelivery. | ${error}`);
                logToReport(`Failed to add ${user.email} from GovDelivery. | ${error}`);
                reject(error);
            }
        }

        logger.info('Releasing local DB connection');
        await mongoConnector.releaseConnection();

        logger.info('Subscriber removal completed');
        resolve();

    });

};

/**
 * Reloads the local subscriber base.
 */
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

/**
 * 
 * Updates the local and remote subscriber base.
 */
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
    const [toAdd, toUpdate, toRemove] = util.compareSubscriberLists(usersFromCurrentVds, usersFromPreviousUpdate);

    logToReport(toAdd.length + ' users to add.');
    logToReport(toUpdate.length + ' users to update.');
    logToReport(toRemove.length + ' users to remove.');

    logger.info(toAdd.length + ' to add');
    logger.info(toUpdate.length + ' to update');
    logger.info(toRemove.length + ' to remove');

    // Removals
    if (toRemove.length > 0) {
        logger.info('Start removal of subscribers');
        logToReport('<p><strong>Removing the following subscribers:</strong></p>');
    }
    for (const user of toRemove) {
        logger.info(`removing ${user.email}`);
        try {

            await removeGovDeliverySubscriber(user.email);

            await collection.deleteOne(
                {
                    ned_id: user.ned_id
                });
            logToReport(user.email);

        } catch (error) {
            logger.error(`Failed to remove ${user.email}`);
            logToReport(`Failed to remove of ${user.email}`);
            await mailer.sendReport();
            process.exit(1);
        }
    }

    // Updates
    if (toUpdate.length > 0) {
        logger.info('Start update of subscribers');
        logToReport('<p><strong>Updating the following subscribers:</strong></p>');
    }
    for (const user of toUpdate) {
        if (validEntry(user)) {
            logger.info(`updating ${user.email}`);
            try {

                // Respond to subscriber NCI all staff questions
                await rp.put(prepareResponseSubmissionRequest(user));

                await collection.replaceOne(
                    { ned_id: user.ned_id },
                    user,
                    { upsert: true }
                );
                logToReport(user.email);


            } catch (error) {
                logger.error(`Failed to update ${user.email}`);
                logToReport(`Failed to update ${user.email}`);
                await mailer.sendReport();
                process.exit(1);
            }
        }
    }

    // Additions
    if (toAdd.length > 0) {
        logger.info('Start addition of subscribers');
        logToReport('<p><strong>Adding the following subscribers:</strong></p>');
    }
    for (const user of toAdd) {
        if (validEntry(user)) {
            logger.info(`adding ${user.email}, `);
            try {

                // Add remotely
                await addGovDeliverySubscriber(user);
                await rp.put(prepareResponseSubmissionRequest(user));
                // Add locally
                await collection.insertOne(user);
                logToReport(user.email);

            } catch (error) {
                logger.error(`Failed to add ${user.email}`);
                logToReport(`Failed to add ${user.email}`);
                await mailer.sendReport();
                process.exit(1);
            }
        }
    }
    await mongoConnector.releaseConnection();

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

module.exports = { updateSubscribers, removeAllSubscribers, reloadLocalSubscriberBaseOnly, test };
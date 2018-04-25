'use strict';
const { config } = require('../../constants');
const mailer = require('../config/mailer');
const { getUsers } = require('../connectors/userInfoConnector');
const mongoConnector = require('../connectors/mongoConnector');
const gdConnector = require('../connectors/gdConnector');
const logger = require('winston');
const { util } = require('../resources/util');

global.report = '';

const logToReport = (str) => {
    global.report += str + '<br/>';
};

/**
 * Removes all subscribers one-by-one from the local and remote user base.
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
                await gdConnector.removeGovDeliverySubscriber(user.email);

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

            await gdConnector.removeGovDeliverySubscriber(user.email);

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
                await gdConnector.submitUserReponses(user);
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
            logger.info(`adding ${user.email} `);
            try {

                // Add remotely
                await gdConnector.addGovDeliverySubscriber(user);
                await gdConnector.submitUserResponses(user);

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

module.exports = { updateSubscribers, removeAllSubscribers, reloadLocalSubscriberBaseOnly };
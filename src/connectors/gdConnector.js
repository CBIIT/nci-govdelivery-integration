
'use strict';
const { prepareSubscriptionRequest, prepareSubscriberReadRequest, prepareResponseSubmissionRequest } = require('../resources/govdelResources');
const rp = require('request-promise');
const logger = require('winston');


/**
 * Gets a subscriber record from GovDelivery. If such subscriber is not found it returns false.
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
 * Removes a subscriber from GovDelivery.
 * @param {string} email 
 */
const removeGovDeliverySubscriber = async (email) => {
    return new Promise(async (resolve, reject) => {

        try {
            // Fetch the subscriber from GD
            const subscriber = await getSubscriberIfExists(email);
            if (subscriber) {
                await rp.delete(prepareSubscriptionRequest(email));
            } else {
                logger.info(`${email} not found in GovDelivery, ignore.`);
            }

            resolve();
        } catch (error) {
            logger.error(`Failed to remove ${email} from GovDelivery. | ${error}`);
            reject(new Error(error));
        }
    });
};

/**
 * Adds a subscriber to GovDelivery
 * 
 */
const addGovDeliverySubscriber = async (user) => {
    return new Promise(async (resolve, reject) => {
        try {
            await rp.post(prepareSubscriptionRequest(user.email));
            await rp.put(prepareResponseSubmissionRequest(user));
            resolve();

        } catch (error) {
            logger.error(`Failed to add ${user.email} in GovDelivery. | ${error}`);
            reject(new Error(error));
        }
    });
};

const submitUserResponses = async (user) => {
    return new Promise(async (resolve, reject) => {
        try {
            await rp.put(prepareResponseSubmissionRequest(user));
            resolve();
        } catch (error) {
            reject(error);
        }
    });
};

module.exports = { getSubscriberIfExists, addGovDeliverySubscriber, removeGovDeliverySubscriber, submitUserResponses };



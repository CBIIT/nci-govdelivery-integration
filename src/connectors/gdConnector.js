
'use strict';
const { prepareSubscriberCreateRequest, prepareSubscriberRemoveRequest, prepareSubscriberReadRequest, prepareResponseSubmissionRequest, prepareSubscriberTopicsReadRequest, prepareTopicSubmissionRequest } = require('../resources/govdelResources');
const { config } = require('../../constants');
const rp = require('request-promise');
const { util } = require('../resources/util');
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
 * Removes a subscriber from GovDelivery:
 * 1. If the subscriber is not found the request is ignored silently.
 * 2. If the subscriber is subscribed to more topics than All Staff, it is not removed, but only the NCI All staff subscription is removed.
 * 3. If the subscriber is subscribed only to All Staff it is removed completely.
 * @param {string} email 
 */
const removeGovDeliverySubscriber = async (email) => {
    return new Promise(async (resolve, reject) => {

        try {
            // 1. Fetch the subscriber from GD
            const subscriber = await getSubscriberIfExists(email);
            if (subscriber) {
                logger.info(`${email} exists. Getting topics...`);

                /* 2. Fetch the subscribers current topic subscriptions.
                      Remove the All Staff subscription, if it exists, and leave all other subscriptions in place.
                */
                const topicsResult = await rp.get(prepareSubscriberTopicsReadRequest(email));
                const topics = util.parseTopics(topicsResult);
                const [subscribedToAllStaffTopic, subscribedToOtherTopics] = util.checkTopicSubscriptions(topics);

                if (!subscribedToAllStaffTopic) {
                    logger.info(`${email} is not subscribed to All Staff, ignore.`);
                    resolve();
                }

                if (subscribedToOtherTopics) {
                    logger.info(`${email} is subscribed to other topics, only removing All Staff subscription and answers.`);

                    // Remove All Staff subscription
                    await rp.put(prepareTopicSubmissionRequest(email, topics.filter(topic => topic !== config.govdel.nciAllTopicCode)));

                    // 3. Erase all responses, we don't have a user on this side at this point so we will use a new user record with just an email field.
                    await rp.put(prepareResponseSubmissionRequest({ email }));
                    resolve();

                } else {
                    // Subscriber is only subscribed to All Staff, remove record completely.
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
            // logToReport(`Failed to add ${email} from GovDelivery. | ${error}`);
            reject(new Error(error));
        }
    });
};

const addGovDeliverySubscriber = async (user) => {
    return new Promise(async (resolve, reject) => {
        try {
            // 1. Fetch the subscriber if it exists
            const subscriber = await getSubscriberIfExists(user.email);
            if (subscriber) {
                // 2. Check the subscriber's topics and subscribe to All Staff, if necessary.
                logger.info(`${user.email} exists. Getting topics...`);
                const topicsResult = await rp.get(prepareSubscriberTopicsReadRequest(user.email));
                const topics = util.parseTopics(topicsResult);

                const [subscribedToAllStaffTopic, subscribedToOtherTopics] = util.checkTopicSubscriptions(topics);
                if (!subscribedToAllStaffTopic) {
                    logger.info(`${user.email} is not subscribed to All Staff, subscribing now...`);
                    topics.push(config.govdel.nciAllTopicCode);
                    await rp.put(prepareTopicSubmissionRequest(user.email, topics));
                } else {
                    logger.info(`${user.email} is already subscribed to All Staff, skipping...`);
                }
                resolve();
            } else {
                // Subscriber doesn't exist (the usual case) - add a new subscriber record.
                await rp.post(prepareSubscriberCreateRequest(user.email));
                // logToReport(user.email);
                await rp.put(prepareResponseSubmissionRequest(user));
                resolve();
            }
        } catch (error) {
            logger.error(`Failed to add ${user.email} in GovDelivery. | ${error}`);
            // logToReport(`Failed to add ${user.email} in GovDelivery. | ${error}`);
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



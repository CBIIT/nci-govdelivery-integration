'use strict';
const { config } = require('../../constants');

const getDefaultTopicCode = () => {
    return config.govdel.nciAllTopicCode;
};

const getAccountCode = () => {
    return config.govdel.accountCode;
};

const getBaseUrl = () => {
    return config.govdel.baseUrl;
};

const encodeSubscriberId = (email) => {
    return Buffer.from(email).toString('base64');
};

const getSubscriptionResource = () => {
    return config.govdel.subscriptionResource;
};

const getSubscriberResource = () => {
    return config.govdel.subscriberResource;
};

const getResponseResource = () => {
    return config.govdel.responseResource;
};

/**
 * @return Returns the URL of an API which can be used to POST or DELETE subscription topics to/from a subscriber.
 *         If topic subscriptions are posted for non-existing subscribers, a new subscriber record is created.
 */
const getSubscriptionUrl = () => {
    const baseUrl = getBaseUrl();
    const accountCode = getAccountCode();
    const resource = getSubscriptionResource();
    return baseUrl + accountCode + resource + '.xml';
};

/**
 * 
 * @param {string} email
 * @return Returns the URL of an API which can be used to GET, PUT or DELETE a subscriber record
 * 
 */
const getSubscriberUrl = (email) => {
    const baseUrl = getBaseUrl();
    const accountCode = getAccountCode();
    const resource = getSubscriberResource();
    const encodedSubscriberId = encodeSubscriberId(email);
    return baseUrl + accountCode + resource + encodedSubscriberId + '.xml?send_notifications=false';

};

/**
 * 
 * @param {string} email
 * @return Returns the URL of an API which can be used to PUT responses to questions for the subscriber specified by email
 */
const getResponseSubmissionUrl = (email) => {
    const baseUrl = getBaseUrl();
    const accountCode = getAccountCode();
    const subscriberResource = getSubscriberResource();
    const responseResource = getResponseResource();
    const encodedSubscriberId = encodeSubscriberId(email);

    return baseUrl + accountCode + subscriberResource + encodedSubscriberId + responseResource + '.xml?send_notifications=false';
};

const getAuthenticationObject = () => ({
    user: config.govdel.user,
    pass: config.govdel.pass
});

const getTopics = () => `
<topic>
    <code>${getDefaultTopicCode()}</code>
</topic>
`;

const composeSubscriber = (email) => `
<subscriber>
    <email>${email}</email>
    <send-notifications type="boolean">false</send-notifications>
    <topics type="array">${getTopics()}</topics>
</subscriber>
`;

const composeResponses = (user) => {

    let response = `
            <responses type='array'>
    `;
    if (user.status) {
        response += `
        <response>
            <question-id>${config.govdel.questions['status']}</question-id>
            <answer-id>${config.govdel.status_answers[user.status]}</answer-id>
        </response>
        `;
    }

    if (user.division) {
        response += `
        <response>
            <question-id>${config.govdel.questions['division']}</question-id>
            <answer-id>${config.govdel.division_answers[user.division]}</answer-id>
        </response>
        `;
    }

    if (user.building) {
        response += `
        <response>
            <question-id>${config.govdel.questions['building']}</question-id>
            <answer-id>${config.govdel.building_answers[user.building]}</answer-id>
        </response>
        `;
    }

    if (user.sac) {
        response += `
        <response>
            <question-id>${config.govdel.questions['sac']}</question-id>
            <answer-id>${config.govdel.building_answers[user.sac]}</answer-id>
        </response>
        `;

        response += '</responses>';
        return response;
    };

    const prepareSubscriptionRequest = (email) => {
        // Create a subscriber with the default subscriptions attached.
        const subscriber = composeSubscriber(email);
        const url = getSubscriptionUrl();
        const auth = getAuthenticationObject();

        return {
            url: url,
            body: subscriber,
            headers: { 'Content-Type': 'application/xml' },
            auth: auth,
            timeout: 60000
        };
    };

    const prepareResponseSubmissionRequest = (user) => {
        const url = getResponseSubmissionUrl(user.email);
        const auth = getAuthenticationObject();
        const responses = composeResponses(user);

        return {
            url: url,
            body: responses,
            headers: { 'Content-Type': 'application/xml' },
            auth: auth,
            timeout: 60000
        };

    };

    const prepareSubscriberReadRequest = (email) => ({
        url: getSubscriberUrl(email),
        auth: getAuthenticationObject(),
        timeout: 60000
    });

    module.exports = { prepareSubscriptionRequest, prepareSubscriberReadRequest, prepareResponseSubmissionRequest };
'use strict';
const { config } = require('../../constants');
const logger = require('winston');

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
    // console.log('URL1: ' + baseUrl + accountCode + resource);
    return baseUrl + accountCode + resource + '.xml';
};

/**
 * 
 * @param {string} email
 * @return Returns the URL of an API which can be used to GET, PUT or DELETE a subscriber record
 * 
 */
const getSubscriberModificationUrl = (email) => {
    const baseUrl = getBaseUrl();
    const accountCode = getAccountCode();
    const resource = getSubscriberResource();
    const encodedSubscriberId = encodeSubscriberId(email);
    // console.log('URL 2: ' + baseUrl + accountCode + resource + encodedSubscriberId + '.xml?send_notifications=false');
    return baseUrl + accountCode + resource + encodedSubscriberId + '.xml?send_notifications=false';

};


/**
 * @return Returns the URL of an API which can be used to POST new subscriber records.
 */
const getSubscriberCreationUrl = () => {
    const baseUrl = getBaseUrl();
    const accountCode = getAccountCode();
    const resource = getSubscriberResource();
    return baseUrl + accountCode + resource + '.xml';
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
    // console.log('URL3: ' + baseUrl + accountCode + subscriberResource + encodedSubscriberId + responseResource);

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

const composeResponses = (user) => `
<responses type="array">
    <response>
        <question-id>${config.govdel.questions['status']}</question-id>
        <answer-id>${config.govdel.status_answers[user.status]}</answer-id>
    </response>
    <response>
        <question-id>${config.govdel.questions['division']}</question-id>
        <answer-id>${config.govdel.division_answers[user.division]}</answer-id>
    </response>
    <response>
        <question-id>${config.govdel.questions['sac']}</question-id>
        <answer-id>${config.govdel.sac_answers[user.sac]}</answer-id>
    </response>
    <response>
        <question-id>${config.govdel.questions['building']}</question-id>
        <answer-id>${config.govdel.building_answers[user.building]}</answer-id>
    </response>
</responses>
`;

const prepareSubscriberRemoveRequest = (email) => ({
    url: getSubscriberModificationUrl(email),
    auth: getAuthenticationObject(),
    timeout: 60000
});

const prepareSubscriberCreateRequest = (email) => {
    const subscriber = composeSubscriber(email);
    // Create subscriber and add a default subscription at the same time
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

module.exports = { prepareSubscriberCreateRequest, prepareSubscriberRemoveRequest, prepareResponseSubmissionRequest};
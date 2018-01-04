const config = require(process.env.NODE_CONFIG_FILE_GOVDEL);

const getTopicCode = () => {
    return config.govdel.nciAllTopicCode;
};

const getAccountCode = () => {
    return config.govdel.accountCode;
};

const getBaseUrl = () => {
    return config.govdel.baseUrl;
};

const base64Encode = (value) => {
    return Buffer.from(value).toString('base64');
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

const getFullSubscriptionUrl = () => {
    const baseUrl = getBaseUrl();
    const accountCode = getAccountCode();
    const resource = getSubscriptionResource();
    console.log('URL1: ' + baseUrl + accountCode + resource);
    return baseUrl + accountCode + resource;
};

const getFullSubscriberUrl = (email) => {
    const baseUrl = getBaseUrl();
    const accountCode = getAccountCode();
    const resource = getSubscriberResource();
    const encodedSubscriberId = encodeSubscriberId(email);
    console.log('URL 2: ' + baseUrl + accountCode + resource + encodedSubscriberId + '.xml');
    return baseUrl + accountCode + resource + encodedSubscriberId + '.xml';
};

const getFullResponseSubmissionUrl = (email) => {
    const baseUrl = getBaseUrl();
    const accountCode = getAccountCode();
    const subscriberResource = getSubscriberResource();
    const responseResource = getResponseResource();
    const encodedSubscriberId = encodeSubscriberId(email);
    console.log('URL3: ' + baseUrl + accountCode + subscriberResource + encodedSubscriberId + responseResource);

    return baseUrl + accountCode + subscriberResource + encodedSubscriberId + responseResource;
};

const getAuthenticationObject = () => ({
    user: config.govdel.user,
    pass: config.govdel.pass
});

const getTopics = () => `
<topic>
    <code>${getTopicCode()}</code>
</topic>
`;

const composeSubscriber = (email) => `
<subscriber>
    <email>${email}</email>
    <send-notifications type="boolean">false</send-notifications>
    <topics type="array">${getTopics()}</topics>
</subscriber>
`;

const composeResponses_ = (user) => `
<responses type="array">
    <response>
        <question-id>${base64Encode('21137')}</question-id>
        <answer-id>${base64Encode(user.status)}</answer-id>
    </response>
    <response>
        <question-id>${base64Encode('21217')}</question-id>
        <answer-id>${base64Encode(user.division)}</answer-id>
    </response>
    <response>
        <question-id>${base64Encode('21237')}</question-id>
        <answer-id>${base64Encode(user.building)}</answer-id>
    </response>
</responses>
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
        <question-id>${config.govdel.questions['building']}</question-id>
        <answer-id>${config.govdel.building_answers[user.building]}</answer-id>
    </response>
</responses>
`;

const prepareSubscriberRemoveRequest = (email) => ({
    url: getFullSubscriberUrl(email),
    auth: getAuthenticationObject()
});


const prepareSubscriberCreateRequest = (email) => {
    const subscriber = composeSubscriber(email);
    const url = getFullSubscriptionUrl();
    const auth = getAuthenticationObject();

    return {
        url: url,
        body: subscriber,
        headers: { 'Content-Type': 'application/xml' },
        auth: auth,
    };
};

const prepareResponseSubmissionRequest = (user) => {
    const url = getFullResponseSubmissionUrl(user.email);
    const auth = getAuthenticationObject();
    const responses = composeResponses(user);

    return {
        url: url,
        body: responses,
        headers: { 'Content-Type': 'application/xml' },
        auth: auth,
    };

};

module.exports = { prepareSubscriberCreateRequest, prepareSubscriberRemoveRequest, prepareResponseSubmissionRequest };
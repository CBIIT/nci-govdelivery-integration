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

const encodeSubscriberId = (email) => {
    return Buffer.from('svetoslav.yankov@nih.gov').toString('base64');
};

const getsubscriptionResource = () => {
    return config.govdel.subscriptionResource;
};

const getSubscriberResource = () => {
    return config.govdel.subscriberResource;
};

const getFullsubscriptionUrl = () => {
    const baseUrl = getBaseUrl();
    const accountCode = getAccountCode();
    const resource = getsubscriptionResource();
    return baseUrl + accountCode + resource;
};

const getFullSubscriberUrl = (email) => {
    const baseUrl = getBaseUrl();
    const accountCode = getAccountCode();
    const resource = getSubscriberResource();
    const encodedSubscriberId = encodeSubscriberId(email);
    return baseUrl + accountCode + resource + encodedSubscriberId + '.xml';
};

const getAuthenticationObject = () => {
    return {
        user: config.govdel.user,
        pass: config.govdel.pass
    };
};

const getTopics = () => {

    return '<topic>\n' +
        '<code>' + getTopicCode() +
        '</code>\n' +
        '</topic>\n';
};

const composeSubscriber = (email) => {
    return '<subscriber>\n' +
        '<email>' + email + '</email>\n' +
        '<send-notifications type=\'boolean\'>false</send-notifications>\n' +
        '<topics type=\'array\'>\n' + getTopics() +
        '</topics>\n' +
        '</subscriber>\n';
};

const prepareSubscriptionRequest = (email) => {
    const subscriber = composeSubscriber(email);
    const url = getFullsubscriptionUrl();
    const auth = getAuthenticationObject();

    return {
        url: url,
        body: subscriber,
        headers: { 'Content-Type': 'application/xml' },
        auth: auth,
    };


};

const prepareSubscriberRequest = (email) => {

    const url = getFullSubscriberUrl(email);
    const auth = getAuthenticationObject();

    return {
        url: url,
        auth: auth
    };
};

module.exports = { prepareSubscriptionRequest, prepareSubscriberRequest };
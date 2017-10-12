const config = require(process.env.NODE_CONFIG_FILE_GOVDEL);
const { prepareSubscriptionRequest, prepareSubscriberRequest } = require('../resources/govdelResources');
const { getUsers } = require('../connectors/vdsConnector');
const request = require('request');
const readline = require('readline');
const fs = require('fs');

const updateSubscribers = async () => {
    const vdsEmails = await getUsers('nci');
    let lastRunEmails = [];

    const lineReader = readline.createInterface({
        input: fs.createReadStream(config.govdel.prevload)
    });

    lineReader.on('line', (line) => {
        lastRunEmails.push(line);
    });

    const toAdd = [];
    const toRemove = [];

    lineReader.on('close', () => {
        lastRunEmails = lastRunEmails.sort();

        let left = vdsEmails.shift();
        let right = lastRunEmails.shift();

        while (left || right) {
            if (left && left.email === right) {
                // do nothing
                left = vdsEmails.shift();
                right = lastRunEmails.shift();
            } else if (right && (!left || left.email > right)) {
                // subscriber has to be removed
                toRemove.push(right);
                right = lastRunEmails.shift();
            } else if (left && (!right || left.email < right)) {
                // subscriber has to be added
                toAdd.push(left.email + ' | ' + left.uniqueidentifier + ' | ' + left.distinguishedName);
                left = vdsEmails.shift();
            }
        }
        console.log(toAdd.length + ' to add');
        console.log(toAdd.join('\n'));
        console.log(toRemove.length + ' to remove: ');
        // console.log(toRemove.join('\n'));
    });

    // console.log(emails);
    // process emails to pick NED MAIL. If NED MAIL not available, pich NIHPRIMARYSMTP

    // Compare emails with emails from last run. 
    // prepare list of emails to add and emails to remove

    // add and remove emails in Gov Delivery

    // request.post(
    //     prepareSubscriptionRequest('svetoslav.yankov@nih.gov'),
    //     callback
    // );
};

const removeSubscriber = () => {
    request.delete(
        prepareSubscriberRequest('svetoslav.yankov@nih.gov'),
        callback
    );
};

const removeSubscriberFromTopic = () => {

    request.delete(
        prepareSubscriptionRequest('svetoslav.yankov@nih.gov'),
        callback
    );

};

function callback(error, response, body) {
    if (!error && response.statusCode == 200) {
        console.log(body);
    } else console.log('error ' + error + ', code: ' + response.statusCode + ', ' + response.body);
}


module.exports = { updateSubscribers, removeSubscriber, removeSubscriberFromTopic };
const { config } = require('../../constants');
const { prepareSubscriberCreateRequest, prepareSubscriberRemoveRequest, prepareResponseSubmissionRequest } = require('../resources/govdelResources');
const { getUsers } = require('../connectors/vdsConnector');
const mongoConnector = require('../connectors/mongoConnector');
const request = require('request');
const logger = require('winston');
global.report = '';

const test = async () => {
    console.log('starting test');

    setTimeout(() => {
        callback();
    }, 1000);

    const callback = () => {
        console.log('callback in test');
    };

    console.log('at end of test');
};

const logToReport = (str) => {
    global.report += '<p>' + str + '</p>';
};

const updateSubscribers = async () => {
    logToReport('Starting subscriber update on ' + Date().toLocaleString());

    try {
        const connection = await mongoConnector.getConnection();
        logger.info('Connecting to ' + config.db.users_collection + ' collection');
        const collection = connection.collection(config.db.users_collection);

        logger.info('Retrieving users from VDS');
        const usersFromCurrentVds = await getUsers('nci');

        logger.info('Retrieving user set from previous update');
        const usersFromPreviousUpdate = await collection.find().sort({ email: 1 }).toArray() || [];
        const toAdd = [];
        const toUpdate = [];
        const toRemove = [];

        let left = usersFromCurrentVds.shift();
        let right = usersFromPreviousUpdate.shift();

        while (left || right) {
            if (left && right && left.email === right.email) {
                // Check for changes in any of the record fields
                if (left.status !== right.status || left.division !== right.division || left.building !== right.building) {
                    toUpdate.push(left);
                }
                left = usersFromCurrentVds.shift();
                right = usersFromPreviousUpdate.shift();
            } else if (right && (!left || left.email > right.email)) {
                // subscriber has to be removed
                toRemove.push(right);
                right = usersFromPreviousUpdate.shift();
            } else if (left && (!right || left.email < right.email)) {
                // subscriber has to be added
                toAdd.push(left);
                // toAdd.push(left.email + ' | ' + left.uniqueidentifier + ' | ' + left.distinguishedName);
                //toAdd.push(left.email);
                left = usersFromCurrentVds.shift();
            }
        }
        logToReport(toAdd.length + ' users to add.');
        logToReport(toUpdate.length + ' users to update.');
        logToReport(toRemove.length + ' users to remove.');

        logger.info(toAdd.length + ' to add');
        logger.info(toUpdate.length + ' to update');
        // console.log(toAdd.join('\n'));
        logger.info(toRemove.length + ' to remove');
        // console.log(toRemove.join('\n'));
        // });

        const ops = [];

        toRemove.forEach(user => {
            ops.push({
                deleteOne:
                    {
                        filter: { uniqueidentifier: user.uniqueidentifier }
                    }
            });
        });

        toUpdate.forEach(user => {
            if (validEntry(user)) {
                ops.push({
                    replaceOne:
                        {
                            filter: { uniqueidentifier: user.uniqueidentifier },
                            replacement: user,
                            upsert: true
                        }
                });
            } else {
                logger.error('user ' + user.email + ' has invalid entries');
                logToReport('user ' + user.email + ' has invalid entries');
            }
        });

        toAdd.forEach(user => {
            if (validEntry(user)) {
                ops.push({
                    insertOne:
                        {
                            document: user
                        }
                });
            } else {
                logger.error('user ' + user.email + ' has invalid entries');
                logToReport('user ' + user.email + ' has invalid entries');
            }
        });

        if (ops.length > 0) {
            await collection.bulkWrite(ops);
            await mongoConnector.releaseConnection();
        } else {
            await mongoConnector.releaseConnection();
        }

        toAdd.forEach(user => {
            if (validEntry(user)) {
                const subCreateRequest = prepareSubscriberCreateRequest(user.email);
                try {
                    const response = request.post(subCreateRequest);
                    if (response.statusCode === 200) {
                        request.put(prepareResponseSubmissionRequest(user), callback);
                    }
                } catch (error) {
                    logToReport(error);
                    logger.error(error);
                }
            }

            // request.post(
            //     prepareSubscriberCreateRequest(user.email),
            //     (error, response) => {
            //         if (!error && response.statusCode == 200) {
            //             // const req = prepareResponseSubmissionRequest(user);
            //             // console.log(req);
            //             request.put(prepareResponseSubmissionRequest(user), callback);
            //         } else logger.error('error ' + error);
            //     }
            // );
        });

        // An update to a subscriber can only be a change in the question responses. Hence, we call the response submission API. 
        toUpdate.forEach(user => {
            if (validEntry(user)) {
                request.put(prepareResponseSubmissionRequest(user), callback);
            }
        });


        toRemove.forEach(user => {
            request.delete(prepareSubscriberRemoveRequest(user.email), callback);
        });

        // mailer.send(config.mail.admin_list, config.mail.subjectPrefix + ' ### Empty user_dn registration attempt', 'Headers: ' + headers);

    } catch (error) {
        logger.error('FATAL ERROR: ' + error);
        logToReport(error);
        process.exitCode(1);
    }


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

const validEntry = (user) => {
    return config.govdel.status_answers[user.status] &&
        config.govdel.division_answers[user.division] &&
        config.govdel.building_answers[user.building];
};

function callback(error, response, body) {

    console.log('callback');
    if (error || response.statusCode !== 200) {
        logger.error('error ' + error + ', code: ' + response.statusCode + ', ' + response.body);
        logToReport('error ' + error + ', code: ' + response.statusCode + ', ' + response.body);
    }
}


module.exports = { updateSubscribers, test };
const config = require(process.env.NODE_CONFIG_FILE_GOVDEL);
const { prepareSubscriberCreateRequest, prepareSubscriberRemoveRequest, prepareResponseSubmissionRequest } = require('../resources/govdelResources');
const { getUsers } = require('../connectors/vdsConnector');
const mongoConnector = require('../connectors/mongoConnector');
const request = require('request');
const logger = require('winston');

const test = async () => {
    console.log('starting test');

    setTimeout(() => {
        callback();
    }, 1000);
    
    const callback = () => {
        console.log('callback');
    };
};

const updateSubscribers = async () => {

    try {
        const connection = await mongoConnector.getConnection();
        logger.info('Connecting to ' + config.db.users_collection + ' collection');
        const collection = connection.collection(config.db.users_collection);

        logger.info('Retrieving users from VDS');
        const usersFromCurrentVds = await getUsers('nci');

        logger.info('Retrieving user set from previous update');
        const usersFromPreviousUpdate = await collection.find().sort({ email: 1 }).toArray() || [];

        // await collection.insertMany(users, {
        //     ordered: false
        // });

        // let lastRunEmails = [];

        // const lineReader = readline.createInterface({
        //     input: fs.createReadStream(config.govdel.prevload)
        // });

        // lineReader.on('line', (line) => {
        //     lastRunEmails.push(line);
        // });

        const toAdd = [];
        const toUpdate = [];
        const toRemove = [];

        // lineReader.on('close', () => {
        //     lastRunEmails = lastRunEmails.sort();

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
            ops.push({
                replaceOne:
                    {
                        filter: { uniqueidentifier: user.uniqueidentifier },
                        replacement: user,
                        upsert: true
                    }
            });
        });

        toAdd.forEach(user => {
            ops.push({
                insertOne:
                    {
                        document: user
                    }
            });
        });

        if (ops.length > 0) {
            await collection.bulkWrite(ops);
        }

        // toAdd.forEach(user => {
        //     console.log('posting user');
        //     request.post(
        //         prepareSubscriberCreateRequest(user.email),
        //         (error, response) => {
        //             if (!error && response.statusCode == 200) {
        //                 const req = prepareResponseSubmissionRequest(user);
        //                 console.log(req);
        //                 request.put(prepareResponseSubmissionRequest(user), callback);
        //             } else logger.error('error ' + error);
        //         }
        //     );
        // });

        console.log('time to exit');
        // process.exit();
    } catch (error) {
        logger.error('FATAL ERROR: ' + error);
        process.exit();
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

const removeSubscriber = () => {
    request.delete(
        prepareSubscriberRemoveRequest('svetoslav.yankov@nih.gov'),
        callback
    );
};


function callback(error, response, body) {
    if (!error && response.statusCode == 200) {
        logger.info(body);
    } else logger.error('error ' + error + ', code: ' + response.statusCode + ', ' + response.body);
}


module.exports = { updateSubscribers, removeSubscriber, test };
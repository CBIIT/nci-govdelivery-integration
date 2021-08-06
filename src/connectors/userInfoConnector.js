'use strict';
const { config } = require('../../constants');
const { getSubscriberExceptionRecords } = require('./snConnector');
const logger = require('winston');

const rp = require('request-promise');

const emailActiveDelayDays = 2;

function estimatedEmailActivated(startDateStr, ned_id) {
    const today = new Date();
    let startDate = new Date(startDateStr);
    let activeDate = new Date(startDateStr);
    activeDate.setDate(activeDate.getDate() + emailActiveDelayDays);
    if (today > startDate && today <= activeDate) {
        logger.info(`User: ${ned_id} started on ${startDate} but email not activated yet`);
    }
    return today > activeDate;
}

const getUsers = async (ic) => {

    return new Promise(async (resolve, reject) => {
        const users = [];

        const userInfoOptions = {
            method: 'POST',
            uri: `${config.userinfo.graphql}`,
            auth: {
                user: config.userinfo.user,
                pass: config.userinfo.password
            },
            headers: {
                'Content-Type': 'application/graphql'
            },
            body:
                `{
                usersLocal(ic: "${ic}") {
                    ned_id,
                    inactive,
                    email,
                    sac,
                    status,
                    division,
                    effective_start_date,
                    building
                }
            }`
        };

        // return promise
        try {
            const userData = await rp(userInfoOptions);

            const userInfoUsers = JSON.parse(userData).data.usersLocal;
            logger.info(`Received ${userInfoUsers.length} users from UserInfo API`);
            userInfoUsers.forEach(user => {

                if (user.email && !user.inactive && estimatedEmailActivated(user.effective_start_date, user.ned_id)) {
                    users.push({
                        ned_id: user.ned_id,
                        email: user.email,
                        sac: user.sac,
                        status: user.status,
                        division: user.division,
                        building: user.building || 'N/A',
                    });
                }
            });

            let subscriberExceptions;

            try {
                subscriberExceptions = await getSubscriberExceptions();
                logger.info(`Found ${subscriberExceptions.length} exceptions defined in ServiceNow`);
            } catch (error) {
                logger.error(`Failed to get subscriber exceptions | ${error}`);
            }

            logger.info('Merging VDS and exception lists');
            mergeSubscriberLists(users, subscriberExceptions || []);

            resolve(users.sort(compareUsers));
        } catch (error) {
            reject(error);
        }
    });
};

const getSubscriberExceptions = async () => {
    return new Promise(async (resolve, reject) => {

        logger.info('Getting subscriber exceptions from ServiceNow');
        let subscriberExceptionRecords;
        try {
            subscriberExceptionRecords = await getSubscriberExceptionRecords();
        } catch (error) {
            logger.error(`Could not get Subscriber exceptions from ServiceNow | ${error}`);
            reject(error);
        }

        let subscriberExceptions = [];

        if (subscriberExceptionRecords) {
            try {
                await Promise.all(subscriberExceptionRecords.map(async (record) => {

                    const userInfoOptions = {
                        method: 'POST',
                        uri: `${config.userinfo.graphql}`,
                        auth: {
                            user: config.userinfo.user,
                            pass: config.userinfo.password
                        },
                        headers: {
                            'Content-Type': 'application/graphql'
                        },
                        body:
                            `{
                            user(id: "${record.ned_id}") {
                                ned_id,
                                inactive,
                                email,
                                sac,
                                status,
                                division,
                                building
                            }
                        }`
                    };

                    const userData = await rp(userInfoOptions);
                    const user = JSON.parse(userData).data.user;

                    if (user.email && !user.inactive) {
                        subscriberExceptions.push({
                            ned_id: user.ned_id,
                            email: user.email,
                            sac: record.sac,
                            status: user.status,
                            division: record.division,
                            building: record.building || 'N/A',
                        });
                    }

                }));

                resolve(subscriberExceptions);

            } catch (error) {
                logger.error(`Could not get UserInfo  records for subscriber exception users | ${error}`);
                reject(error);
            }
        } else {
            resolve(subscriberExceptions);
        }
    });
};

const mergeSubscriberLists = (list1, list2) => {

    list2.forEach(user => {
        let seen = false;
        for (let i = 0; i < list1.length; i++) {
            if (list1[i].ned_id === user.ned_id) {
                seen = true;
                break;
            }
        }
        if (!seen) {
            list1.push({
                ned_id: user.ned_id,
                email: user.email,
                status: user.status,
                division: user.division,
                sac: user.sac,
                building: user.building
            });
        }

    });
};

const compareUsers = (a, b) => {
    if (a.email < b.email) {
        return -1;
    }
    if (a.email > b.email) {
        return 1;
    }
    return 0;
};

module.exports = { getUsers };

'use strict';
const { config } = require('../../constants');

const rp = require('request-promise');


const getSubscriberExceptionRecords = async => {

    return new Promise(async (resolve, reject) => {
        const users = [];

        const snOptions = {
            method: 'GET',
            uri: `${config.sn.subscriberExceptionsUrl}`,
            headers: {
                'Content-Type': 'application/json'
            },
            json: true
        };

        // return promise
        try {
            const userData = await rp(snOptions);

            resolve(userData.result);
        } catch (error) {
            reject(error);
        }
    });
};

module.exports = { getSubscriberExceptionRecords };
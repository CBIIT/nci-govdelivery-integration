'use strict';
const { config } = require('../../constants');
const MongoClient = require('mongodb').MongoClient;
const logger = require('winston');

let client, connection;

const getConnection = () => {
    return new Promise(async (resolve, reject) => {
        if (client && connection) {
            return connection;
        } else {
            try {
                client = await MongoClient.connect(config.db.base_url);
                connection = client.db(config.db.database);
                logger.info('Mongo Connection successful');
                resolve(connection);
            } catch (error) {
                logger.error(error);
                reject(error);
            }
        }
    });
};

const releaseConnection = () => {
    return new Promise(async (resolve, reject) => {
        if (client) {

            try {
                client.close(() => {
                    logger.info('Mongo Connection closed');
                    client = null;
                    connection = null;
                    resolve();
                });
            } catch (error) {
                logger.info(error);
                reject(error);
            }
        }
    });
};


module.exports = { getConnection, releaseConnection };
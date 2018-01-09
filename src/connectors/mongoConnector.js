'use strict';
const { config } = require('../../constants');
const MongoClient = require('mongodb').MongoClient;
const logger = require('winston');
const assert = require('assert');

let client, connection;

const getConnection_ = async () => {
    return new Promise((resolve, reject) => {
        if (connection) {
            resolve(connection);
        } else {
            MongoClient.connect(config.db.base_url, (err, client) => {
                if (err) {
                    reject(err.message);
                }
                assert.equal(null, err);
                connection = client.db(config.db.database);
                logger.info('Mongo Connection successful');
                resolve(connection);
            });
        }
    });
};

const getConnection = async () => {
    if (connection) {
        return connection;
    } else {
        try {
            client = await MongoClient.connect(config.db.base_url);
            connection = client.db(config.db.database);
            logger.info('Mongo Connection successful');
            return connection;
        } catch (error) {
            logger.error(error);
            process.exit(1);
        }
    }
};

const releaseConnection = () => {
    if (client) {

        try {
            client.close();
            logger.info('Mongo Connection closed');
        } catch (error) {
            logger.info(error);
        }
    }
};


module.exports = { getConnection, releaseConnection };
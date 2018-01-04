'use strict';
const { config } = require('../../constants');
const MongoClient = require('mongodb').MongoClient;
const logger = require('winston');
const assert = require('assert');

var connection;

const getConnection = () => {
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

const releaseConnection = (connection) => {
    connection.close(err => {
        if (err) {
            logger.error(err.message);
        } else {
            logger.info('Mongo Connection closed');
        }
    }
    );
};


module.exports = { getConnection, releaseConnection };
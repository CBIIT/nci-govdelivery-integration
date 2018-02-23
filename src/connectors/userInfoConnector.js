'use strict';
const { config } = require('../../constants');
const logger = require('winston');
const ldap = require('ldapjs');
const fs = require('fs');
const tlsOptions = {
    ca: [fs.readFileSync(config.vds.vdscert)]
};

const rp = require('request-promise');

const getUsersFromUserInfo = async (ic) => {

    return new Promise(async (resolve, reject) => {
        const users = [];

        const userInfoOptions = {
            uri: `${config.userinfo.users_url}/${ic}`,
            auth: {
                user: config.userinfo.user,
                pass: config.userinfo.password
            },
            headers: {
                'Accept': 'application/json'
            },
            json: true // Automatically parses the JSON string in the response
        };

        // return promise
        try {
            const userData = await rp(userInfoOptions);
            userData.forEach(user => {
                const email = getEmail(user);
                const dn = user.distinguishedName;
                if (email && !dn.includes('_InActive')) {

                    users.push({
                        email: email,
                        uniqueidentifier: user.UNIQUEIDENTIFIER,
                        distinguishedName: user.distinguishedName,
                        status: user.ORGANIZATIONALSTAT || 'N/A',
                        division: getDivision(user),
                        building: getBuilding(user),
                    });
                }
            });
            resolve(users.sort(compareUsers));
        } catch (error) {
            reject(error);
        }
    });
};

const getUsers = (ic) => {

    return new Promise(async (resolve, reject) => {
        const nciSubFilter = '(NIHORGACRONYM=' + ic + ')';
        const filter = ('(&' + nciSubFilter + ')');
        const userSearchOptions = {
            scope: 'sub',
            attributes: config.vds.user_attributes,
            filter: filter,
            paged: true
        };
        let counter = 0;
        const ldapClient = await getLdapClient();
        ldapClient.bind(config.vds.dn, config.vds.password, (err) => {

            if (err) {
                logger.error('Bind error: ' + err);
                ldapClient.destroy();
                reject(Error(err.message));
            }
            const users = [];
            logger.info('starting search');
            ldapClient.search(config.vds.searchBase, userSearchOptions, (err, ldapRes) => {
                if (err) {
                    logger.error('error: ' + err.code);
                }
                ldapRes.on('searchEntry', ({ object }) => {
                    if (++counter % 10000 === 0) {
                        logger.info(counter + ' records found and counting...');
                    }
                    const email = getEmail(object);
                    const dn = object.distinguishedName;
                    if (email && !dn.includes('_InActive')) {

                        users.push({
                            email: email,
                            uniqueidentifier: object.UNIQUEIDENTIFIER,
                            distinguishedName: object.distinguishedName,
                            status: object.ORGANIZATIONALSTAT || 'N/A',
                            division: getDivision(object),
                            building: getBuilding(object),
                        });
                    }

                });
                ldapRes.on('searchReference', () => { });
                ldapRes.on('page', () => {
                });
                ldapRes.on('error', (err) => {
                    ldapClient.destroy();
                    if (err.code === 32) {
                        resolve({});
                    } else {
                        reject(Error(err.message));
                    }
                });
                ldapRes.on('end', () => {
                    logger.info(' destroy ldap client');
                    logger.info(counter + ' records found');
                    ldapClient.destroy();
                    resolve(users.sort(compareUsers));
                });
            });
        });

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

const getLdapClient = async () => {

    try {
        const ldapClient = await ldap.createClient({
            url: config.vds.host,
            tlsOptions: tlsOptions,
            idleTimeout: 15 * 60 * 1000,
            timeout: 15 * 60 * 1000,
            connectTimeout: 15 * 60 * 1000 // 15 mins
        });

        ldapClient.on('connectError', function (err) {
            logger.error('ldap client connectError: ' + err);
        });

        ldapClient.on('error', function (err) {
            logger.error('ldap client error: ' + err);
        });

        ldapClient.on('resultError', function (err) {
            logger.error('ldap client resultError: ' + err);
        });

        ldapClient.on('socketTimeout', function (err) {
            logger.error('ldap socket timeout: ' + err);
        });

        ldapClient.on('timeout', function (err) {
            logger.error('ldap client timeout: ' + err);
        });
        return ldapClient;
    } catch (error) {
        return Error(error);
    }
};

const getEmail = (obj) => {

    let result = null;

    const proxyEmails = obj.proxyAddresses;
    if (proxyEmails) {
        if (Array.isArray(proxyEmails)) {
            proxyEmails.forEach(email => {
                const data = email.split(':');
                if (data[0] === 'SMTP') {
                    result = data[1];
                }
            });
        } else {
            const data = proxyEmails.split(':');
            if (data[0] === 'SMTP') {
                result = data[1];
            }
        }
    }
    return result;
};

const getDivision = (obj) => {

    let result = 'N/A';

    if (obj.NIHORGPATH) {
        const orgPathArr = obj.NIHORGPATH.split(' ') || [];
        const len = orgPathArr.length;

        if (len > 0 && len <= 2) {
            result = orgPathArr[len - 1];
        } else if (len > 2) {
            if (orgPathArr[1] === 'OD') {
                result = orgPathArr[2];
            } else {
                result = orgPathArr[1];
            }
        }
    }

    return result;

};

const getBuilding = (obj) => {

    if (obj.BUILDINGNAME) {
        return 'BG ' + obj.BUILDINGNAME;
    } else {
        return 'N/A';
    }
};


module.exports = { getUsersFromUserInfo };
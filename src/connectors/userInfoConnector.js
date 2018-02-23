'use strict';
const { config } = require('../../constants');

const rp = require('request-promise');

const getUsers = async (ic) => {

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

const compareUsers = (a, b) => {
    if (a.email < b.email) {
        return -1;
    }
    if (a.email > b.email) {
        return 1;
    }
    return 0;
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


module.exports = { getUsers };
const config = require(process.env.NODE_CONFIG_FILE_GOVDEL);
const logger = require('../config/log');
const ldap = require('ldapjs');
const fs = require('fs');
const tlsOptions = {
    ca: [fs.readFileSync(config.vds.vdscert)]
};

const getUsers = (ic) => {

    return new Promise(async (resolve, reject) => {

        const nciSubFilter = '(NIHORGACRONYM=' + ic + ')';
        const inactiveFilter = '(!(distinguishedName=*InActive*))';
        const dnFilter = '(distinguishedName=*OU=Users,OU=*,OU=NIH,OU=AD,DC=nih,DC=gov)';
        const noAdAcctFilter = '(!(NIHADACCTREQ=N))';
        const guestFilter = '(!(ORGANIZATIONALSTAT=GUEST))';
        const volunteerFilter = '(!(ORGANIZATIONALSTAT=VOLUNTEER))';


        const filter = ('(&' + nciSubFilter + ')');

        // const filter = '(&(NIHORGACRONYM=' + ic + ') (!(vddn=*_InActive*)))';

        // const filter = '\'(&(NIHORGACRONYM=NCI) (!(vddn=*_InActive*)))\'';

        console.log(filter);

        var userSearchOptions = {
            scope: 'sub',
            attributes: config.vds.user_attributes,
            filter: filter,
            paged: true
        };
        var counter = 0;
        const ldapClient = await getLdapClient();

        ldapClient.bind(config.vds.dn, config.vds.password, (err) => {

            if (err) {
                logger.error('Bind error: ' + err);
                ldapClient.destroy();
                reject(Error(err.message));
            }
            var users = [];
            logger.info('starting search');
            ldapClient.search(config.vds.searchBase, userSearchOptions, (err, ldapRes) => {
                if (err) {
                    logger.error('error: ' + err.code);
                }
                ldapRes.on('searchEntry', (entry) => {
                    if (++counter % 10000 === 0) {
                        logger.info(counter + ' records found and counting...');
                    }
                    // let obj = util.convertBase64Fields(entry);
                    // users.push(obj);
                    let email = getEmail(entry.object);
                    if (email) {
                        users.push({ email: email, uniqueidentifier: entry.object.UNIQUEIDENTIFIER, distinguishedName: entry.object.distinguishedName });
                    }
                });
                ldapRes.on('searchReference', () => { });
                ldapRes.on('page', () => {
                    logger.info('page end');
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
    const nedEmail = obj.MAIL && obj.MAIL.trim() !== '' ? obj.MAIL.trim() : null;
    const adEmail = obj.NIHPRIMARYSMTP && obj.NIHPRIMARYSMTP.trim() !== '' ? obj.NIHPRIMARYSMTP.trim() : null;

    return nedEmail ? nedEmail : adEmail;

};


module.exports = { getUsers };
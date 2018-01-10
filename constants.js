'use strict';
const config = require(process.env.NODE_CONFIG_FILE_GOVDEL);
// const mailer = require('./src/config/mailer');

// const sendReport = () => {
//     mailer.send(config.mail.admin_list, config.mail.subjectPrefix + 'GevDelivery Update Report', global.report);
// };

module.exports =  { config } ;
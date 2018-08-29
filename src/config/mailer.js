const { config } = require('../../constants');
const mailer = require('nodemailer');
const logger = require('winston');


const smtpConfig = {
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    ignoreTLS: config.mail.ignoreTLS,

};
const defaultFromAddress = config.mail.defaultFromAddress;
const transporter = mailer.createTransport(smtpConfig);

const send = async (recipient, subject, message) => {
    const mailOptions = {
        from: defaultFromAddress,
        replyTo: defaultFromAddress,
        to: recipient,
        subject: subject,
        html: message
    };

    try {
        transporter.sendMail(mailOptions);
    } catch (error) {
        logger.error(error);
    }
};

const sendReport = () => {
    

    if (global.optOuts) {
        global.report += '<p><strong>Failed due to error GD-15004 (This destination has requested to no longer receive emails from National Cancer Institute):</strong></p>';
        global.report += global.optOuts;
    }
    if (global.optOutsUpdates) {
        global.report += '<p><strong>Failed due to error GD-15002 (Subscriber not found):</strong></p>';
        global.report += global.optOutsUpdates;
    }
    send(config.mail.admin_list, config.mail.subjectPrefix + 'GovDelivery Update Report', global.report);
};


module.exports = { send, sendReport };

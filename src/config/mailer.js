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

module.exports = {

    send: async (recipient, subject, message) => {

        var mailOptions = {
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
    }
};
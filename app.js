const program = require('commander');
// const { config } = require('./constants');
const {
    updateSubscribers,
    updateSubscribersFromMongo,
    removeAllSubscribers,
    uploadAllSubscribers,
    reloadLocalSubscriberBaseOnly,
    rebaseSubscribers
} = require('./src/model/model');
const mailer = require('./src/config/mailer');
const logger = require('./src/config/log');

let end = false;
process.on('beforeExit', async code => {
    mailer.sendReport().then(() => {
        logger.info('Process exit ' + code);
        process.exit();
    }).catch(error => {
        logger.error(error);
        logger.info('Process exit ' + code);
        process.exit(1);
    });
});

program
    .version('1.0.0')
    .description('GovDelivery Subscriber Update');
program
    .command('updateSubscribers')
    .description('Updates subscribers')
    .action(updateSubscribers);
program
    .command('updateSubscribersFromMongo')
    .description('Updates subscribers from MongoDB')
    .action(updateSubscribersFromMongo);
program
    .command('uploadAllSubscribers')
    .description('Upload all subscribers')
    .action(uploadAllSubscribers);
program
    .command('removeAllSubscribers')
    .description('Remove all subscribers')
    .action(removeAllSubscribers);
program
    .command('reloadLocalSubscriberBaseOnly')
    .description('Reload Local User Base (No GovDel upload)')
    .action(reloadLocalSubscriberBaseOnly);
program
    .command('rebaseSubscribers <csvFile>')
    .description('Empty local DB and load users from GovDeliver subscribers list (in CSV file)')
    .action(rebaseSubscribers);

program.parse(process.argv);

const program = require('commander');
// const { config } = require('./constants');
const { updateSubscribers, removeAllSubscribers, uploadAllSubscribers, reloadLocalSubscriberBaseOnly } = require('./src/model/model');
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
    
program.parse(process.argv);

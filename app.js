const program = require('commander');
const { config } = require('./constants');
const { reloadAllSubscribers, updateSubscribers, removeAllSubscribers, reloadLocalSubscriberBaseOnly, test } = require('./src/model/model');
const mailer = require('./src/config/mailer');
const logger = require('./src/config/log');

let end = false;
process.on('beforeExit', async code => {
    if (end) {
        process.exit();
    }
    // send the update report
    // mailer.sendReport();
    end = true;
    logger.info('Process exit ' + code);
});

program
    .version('1.0.0')
    .description('GovDelivery Subscriber Update');
program
    .command('reloadAllSubscribers')
    .description('Deletes and reloads all subscribers')
    .action(reloadAllSubscribers);
program
    .command('updateSubscribers')
    .description('Updates subscribers')
    .action(updateSubscribers);
program
    .command('removeAllSubscribers')
    .description('Remove all subscribers')
    .action(removeAllSubscribers);
program
    .command('reloadLocalSubscriberBaseOnly')
    .description('Reload Local User Base (No GovDel upload)')
    .action(reloadLocalSubscriberBaseOnly);
program
    .command('test')
    .action(test);

program.parse(process.argv);

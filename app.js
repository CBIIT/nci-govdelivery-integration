const program = require('commander');
const { config } = require('./constants');
const { updateSubscribers, test } = require('./src/model/model');
const mailer = require('./src/config/mailer');

let end = false;
process.on('beforeExit', async code => {
    if (end) {
        process.exit();
    }
    // send the update report
    mailer.send(config.mail.admin_list, config.mail.subject_prefix + 'GevDelivery Update Report', global.report);
    end = true;
    console.log('Process exit ' + code);
});

program
    .version('1.0.0')
    .description('GovDelivery Subscriber Update');
program
    .command('updateSubscribers')
    .description('Updates subscribers')
    .action(updateSubscribers)
    .action(test);
program
    .command('test')
    .action(test);

program.parse(process.argv);

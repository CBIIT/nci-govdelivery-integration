const program = require('commander');
const { updateSubscribers, removeSubscriber, removeSubscriberFromTopic, test } = require('./src/model/model');

program
    .version('1.0.0')
    .description('GovDelivery Subscriber Update');
program
    .command('updateSubscribers')
    .description('Updates subscribers')
    .action(updateSubscribers);
program
    .command('removeSubscriber')
    .description('removes a subscriber')
    .action(removeSubscriber);
program
    .command('removeSubscriberFromTopic')
    .description('Removes a subscriber from single topics')
    .action(removeSubscriberFromTopic);
program
    .command('test')
    .action(test);

program.parse(process.argv);

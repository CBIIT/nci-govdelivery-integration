'use strict';
const { config } = require('../../constants');
const parser = require('xml2json');

const util = {

    parseTopics: (topicsXmlResult) => {
        let topics = JSON.parse(parser.toJson(topicsXmlResult)).topics.topic;

        let result = [];

        if (!(topics instanceof Array)) {
            topics = [topics];
        }

        result = topics.map(topic => topic['to-param']);
        return result;
    },

    checkTopicSubscriptions: (topics) => {
        let subscribedToAllStaffTopic = false;
        let subscribedToOtherTopics = false;
        topics.forEach(topic => {
            if (topic === config.govdel.nciAllTopicCode) {
                subscribedToAllStaffTopic = true;
            } else {
                subscribedToOtherTopics = true;
            }
        });

        return [subscribedToAllStaffTopic, subscribedToOtherTopics];
    },

    compareSubscriberLists: (leftList, rightList) => {

        const toAdd = [];
        const toUpdate = [];
        const toRemove = [];
    
        let left = leftList.shift();
        let right = rightList.shift();
        while (left || right) {
            if (left && right && left.email === right.email) {
                // Check for changes in any of the record fields
                if (left.status !== right.status || left.division !== right.division || left.sac !== right.sac || left.building !== right.building) {
                    toUpdate.push(left); // actual
                }
                left = leftList.shift();
                right = rightList.shift();
            } else if (right && (!left || left.email > right.email)) {
                // subscriber has to be removed
                toRemove.push(right);
                right = rightList.shift();
            } else if (left && (!right || left.email < right.email)) {
                // subscriber has to be added
                toAdd.push(left); // actual
                left = leftList.shift();
            } else {
                console.log(`${JSON.stringify(left)} and ${JSON.stringify(right)}`);
            }
        }
    
        return [toAdd, toUpdate, toRemove];
    }

};

module.exports = { util };
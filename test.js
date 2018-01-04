console.log('here');

setTimeout(() => {
    callback();
}, 1000);

const callback = () => {
    console.log('callback');
};


console.log('exit');
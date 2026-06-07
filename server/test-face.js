const util = require('util');
global.util = util;
Object.assign(global, { TextDecoder: util.TextDecoder, TextEncoder: util.TextEncoder });

const faceapi = require('@vladmandic/face-api/dist/face-api.js');
console.log('Face API Loaded successfully:', !!faceapi);

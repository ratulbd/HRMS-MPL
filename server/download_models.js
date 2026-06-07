const https = require('https');
const fs = require('fs');
const path = require('path');

const baseUrl = 'https://raw.githubusercontent.com/vladmandic/face-api/master/model/';
const modelsDir = path.join(__dirname, 'utils', 'models');

if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
}

const files = [
    'ssd_mobilenetv1_model-weights_manifest.json',
    'ssd_mobilenetv1_model.bin',
    'face_landmark_68_model-weights_manifest.json',
    'face_landmark_68_model.bin',
    'face_recognition_model-weights_manifest.json',
    'face_recognition_model.bin'
];

function download(filename) {
    return new Promise((resolve, reject) => {
        const url = baseUrl + filename;
        const dest = path.join(modelsDir, filename);
        console.log(`Downloading ${filename}...`);
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 200) {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            } else if (response.statusCode === 301 || response.statusCode === 302) {
                 https.get(response.headers.location, (res) => {
                      res.pipe(file);
                      file.on('finish', () => { file.close(); resolve(); });
                 });
            } else {
                reject(`Server responded with ${response.statusCode}: ${response.statusMessage}`);
            }
        }).on('error', (err) => {
            fs.unlink(dest, () => reject(err.message));
        });
    });
}

async function start() {
    for (const file of files) {
        await download(file);
    }
    console.log('All models downloaded successfully!');
}

start();

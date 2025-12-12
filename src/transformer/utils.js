const private_char_map = require('./PrivateChars.js');
const fs = require('fs');

function uploadFile(filePath, url, filename) {
    console.log(`Uploading ${filePath} to ${url} as ${filename}`);
    // No-op for now
}

module.exports = {
    private_char_map,
    uploadFile
};

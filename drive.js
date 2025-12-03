// drive.js
const { google } = require('googleapis');
const path = require('path');

function createDriveClient() {
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || './service-account-key.json';

  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(keyFile),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  const drive = google.drive({ version: 'v3', auth });
  return drive;
}

module.exports = createDriveClient;  // <-- THIS MUST BE HERE

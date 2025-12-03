// server.js
require('dotenv').config();


const express = require('express');
const multer = require('multer');
const createDriveClient = require('./drive');
console.log("DEBUG createDriveClient =", createDriveClient);

const app = express();
const cors = require("cors");
app.use(cors());
const upload = multer({ storage: multer.memoryStorage() });

const drive = createDriveClient();

// ----- CONFIG -----
const PORT = process.env.PORT || 3000;
const LOCKED_FOLDER_ID = process.env.LOCKED_FOLDER_ID;
const LOCK_PIN = process.env.LOCK_PIN;

if (!LOCKED_FOLDER_ID || !LOCK_PIN) {
  console.error('❌ LOCKED_FOLDER_ID or LOCK_PIN is missing in .env');
  process.exit(1);
}

// ----- MIDDLEWARE -----
app.use(express.json());

// Simple PIN check helper
function checkPin(req, res) {
  const { pin } = req.body;
  if (!pin) {
    res.status(400).json({ error: 'PIN is required' });
    return false;
  }
  if (pin !== LOCK_PIN) {
    res.status(401).json({ error: 'Incorrect PIN' });
    return false;
  }
  return true;
}

// ----- ROUTES -----

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Locked folder API running' });
});

// List files in locked folder (PIN required)
app.post('/files/list', async (req, res) => {
  try {
    if (!checkPin(req, res)) return;

    const response = await drive.files.list({
      q: `'${LOCKED_FOLDER_ID}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, createdTime, size)',
    });

    res.json({ files: response.data.files || [] });
  } catch (err) {
    console.error('Error listing files:', err.message || err);
    res.status(500).json({ error: 'Internal error listing files' });
  }
});

// Upload a file into locked folder (PIN + file)
app.post('/files/upload', upload.single('file'), async (req, res) => {
  try {
    if (!checkPin(req, res)) return;

    if (!req.file) {
      return res.status(400).json({ error: 'File is required (field name: file)' });
    }

    const fileMetadata = {
      name: req.file.originalname,
      parents: [LOCKED_FOLDER_ID],
    };

    const media = {
      mimeType: req.file.mimetype,
      body: Buffer.from(req.file.buffer),
    };

    const response = await drive.files.create({
      resource: fileMetadata,
      media,
      fields: 'id, name, mimeType',
    });

    res.status(201).json({
      message: 'File uploaded',
      file: response.data,
    });
  } catch (err) {
    console.error('Error uploading file:', err.message || err);
    res.status(500).json({ error: 'Internal error uploading file' });
  }
});

// Download a file from locked folder (PIN required)
app.post('/files/:fileId/download', async (req, res) => {
  try {
    if (!checkPin(req, res)) return;

    const fileId = req.params.fileId;

    // (Optional) check the file actually belongs to the locked folder
    const meta = await drive.files.get({
      fileId,
      fields: 'id, name, parents, mimeType',
    });

    if (!meta.data.parents || !meta.data.parents.includes(LOCKED_FOLDER_ID)) {
      return res.status(403).json({ error: 'File is not in the locked folder' });
    }

    const dl = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    // Set headers so browser treats as download
    res.setHeader('Content-Disposition', `attachment; filename="${meta.data.name}"`);
    res.setHeader('Content-Type', meta.data.mimeType || 'application/octet-stream');

    dl.data
      .on('error', (err) => {
        console.error('Error streaming file:', err.message || err);
        res.status(500).end('Error downloading file');
      })
      .pipe(res);
  } catch (err) {
    console.error('Error downloading file:', err.message || err);
    res.status(500).json({ error: 'Internal error downloading file' });
  }
});
app.post("/auth/check", (req, res) => {
  const { pin } = req.body;

  if (pin === LOCK_PIN) {
    return res.json({ valid: true });
  }

  return res.json({ valid: false });
});

// ----- START SERVER -----
app.listen(PORT, () => {
  console.log(`✅ Locked folder API listening on port ${PORT}`);
});

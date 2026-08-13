const path = require('path');
const cors = require('cors');
const express = require('express');
const multer = require('multer');
require('dotenv').config();

const app = express();

// Use memory storage so tests don't need a writable uploads/ directory
const storage = multer.memoryStorage();
const upload = multer({ storage });

app.use(cors());
app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// REQUIRED FOR FREECODECAMP
app.get('/api/fileanalyse', (req, res) => {
  res.json({ message: "Send POST with file" });
});

// inside index.js (replace the POST handler)
app.post('/api/fileanalyse', upload.single('upfile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  // Debugging: uncomment during local testing to inspect what multer produced
  // console.log('MULTER REQ.FILE:', req.file);

  // Some multer versions/platforms may not populate size; fallback to buffer length if needed
  const size = typeof req.file.size === 'number'
    ? req.file.size
    : (req.file.buffer && req.file.buffer.length) || 0;

  // Ensure size is a number (not string)
  const sizeNumber = Number(size);

  return res.json({
    name: req.file.originalname || '',
    type: req.file.mimetype || '',
    size: sizeNumber
  });
});

// start only when run directly (test harness can require this file)
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, function () {
    console.log('Your app is listening on port ' + port);
  });
}

module.exports = app;

const path = require('path');
const cors = require('cors');
const express = require('express');
const multer = require('multer');
const morgan = require('morgan');
require('dotenv').config();

const app = express();

// Use memory storage so no disk writes are required
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Request logging
app.use(morgan('combined'));

app.use(cors());
app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Helpful GET for quick check
app.get('/api/fileanalyse', (req, res) => {
  res.json({ message: "Send POST with file" });
});

// POST handler with extra logging and robust size fallback
app.post('/api/fileanalyse', upload.single('upfile'), (req, res) => {
  // Log info for debugging (will appear in server console)
  console.log('---- /api/fileanalyse POST received ----');
  console.log('Headers:', req.headers);
  console.log('Multer req.file:', req.file);

  if (!req.file) {
    console.log('No req.file found!');
    return res.status(400).json({ error: "No file uploaded" });
  }

  const size = (typeof req.file.size === 'number')
    ? req.file.size
    : (req.file.buffer ? req.file.buffer.length : 0);

  const result = {
    name: req.file.originalname || '',
    type: req.file.mimetype || '',
    size: Number(size)
  };

  console.log('Response JSON:', result);
  // Ensure we send JSON with exactly the keys the test expects
  return res.json(result);
});

// start only when run directly
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, function () {
    console.log('Your app is listening on port ' + port);
  });
}

module.exports = app;

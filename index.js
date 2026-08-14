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

// Disable caching for HTML
app.get('/', function (req, res) {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
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

  // Check if this is an AJAX request
  const isAjax = req.headers['x-requested-with'] === 'XMLHttpRequest';

  if (isAjax) {
    // If AJAX, return JSON
    console.log('Returning JSON for AJAX request');
    return res.json(result);
  } else {
    // If regular form submission, return HTML with JSON embedded
    console.log('Returning HTML for form submission');
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>File Metadata</title>
  <link rel="shortcut icon" href="https://cdn.freecodecamp.org/universal/favicons/favicon-32x32.png" type="image/x-icon"/>
  <link href="https://fonts.googleapis.com/css?family=Roboto" rel="stylesheet" type="text/css">
  <link href="/public/style.css" rel="stylesheet" type="text/css">
</head>
<body>
  <div class="container">
    <h2>API Project: File Metadata Microservice</h2>
    <h3>Usage:</h3>
    <p>Please Upload a File ...</p>
    <div class="view">
      <h4 id="output">${JSON.stringify(result)}</h4>
      <form id="fileForm" enctype="multipart/form-data" onsubmit="handleSubmit(event)">
        <input id="inputfield" type="file" name="upfile" required>
        <input id="button" type="submit" value="Upload">
      </form>
    </div>
  </div>
  <div class="footer">
    <p>by <a href="http://www.freecodecamp.com">freeCodeCamp</a></p>
  </div>
  
  <script>
    window.fileMetadata = ${JSON.stringify(result)};
    console.log('File metadata loaded:', window.fileMetadata);
    
    function handleSubmit(event) {
      event.preventDefault();
      console.log('Form submitted via AJAX');
      
      const fileInput = document.getElementById('inputfield');
      const output = document.getElementById('output');
      
      if (!fileInput.files.length) {
        output.textContent = 'Please select a file';
        return false;
      }

      const formData = new FormData();
      formData.append('upfile', fileInput.files[0]);
      
      console.log('Sending file:', fileInput.files[0].name);
      
      fetch('/api/fileanalyse', {
        method: 'POST',
        body: formData,
        headers: {
          'X-Requested-With': 'XMLHttpRequest'
        }
      })
      .then(response => {
        console.log('Response status:', response.status);
        if (!response.ok) {
          throw new Error('Upload failed with status ' + response.status);
        }
        return response.json();
      })
      .then(data => {
        console.log('Response data:', data);
        window.fileMetadata = data;
        output.textContent = JSON.stringify(data);
      })
      .catch(error => {
        console.error('Error:', error);
        output.textContent = 'Error: ' + error.message;
      });
      
      return false;
    }
  </script>
</body>
</html>
    `;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }
});

// start only when run directly
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, function () {
    console.log('Your app is listening on port ' + port);
  });
}

module.exports = app;

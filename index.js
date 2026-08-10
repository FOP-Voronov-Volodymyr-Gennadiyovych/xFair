const path = require('path');
const cors = require('cors');
const express = require('express');
const multer = require('multer');
require('dotenv').config();

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

app.use(cors());
app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.post('/api/fileanalyse', upload.single('upfile'), function (req, res) {
  if (!req.file) {
    return res.json({
      name: "",
      type: "",
      size: 0
    });
  }

  return res.json({
    name: req.file.originalname,
    type: req.file.mimetype,
    size: req.file.size
  });
});

app.use(function (err, req, res, next) {
  if (err instanceof multer.MulterError) {
    return res.json({
      name: "",
      type: "",
      size: 0
    });
  }
  next(err);
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, function () {
    console.log('Your app is listening on port ' + port);
  });
}

module.exports = app;

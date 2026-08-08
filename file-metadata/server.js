import express from "express";
import cors from "cors";
import multer from "multer";

const app = express();
const upload = multer();

// разрешаем CORS для freeCodeCamp
app.use(cors());
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/public/index.html");
});

// основной маршрут для проверки
app.post("/api/fileanalyse", upload.single("upfile"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file provided in upfile field" });
  }

  res.json({
    name: req.file.originalname,
    type: req.file.mimetype,
    size: req.file.size,
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`File Metadata Microservice listening on port ${port}`);
});

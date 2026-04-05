const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const fs = require("fs");
const path = require("path");

const app = express();

// middleware
app.use(cors());
app.use(express.json());

// ==========================
// 🔥 FIX: uploads folder create
// ==========================
const uploadsDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// multer setup
const upload = multer({ dest: uploadsDir });

// ==========================
// 🔥 TEXT SUMMARY ROUTE
// ==========================
app.post("/summarize", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ message: "Text required" });
    }

    // basic summary (first 100 words)
    const summary = text.split(" ").slice(0, 100).join(" ");

    res.json({ summary });
  } catch (err) {
    console.log("Summarize error:", err);
    res.status(500).json({ message: "Error generating summary" });
  }
});

// ==========================
// 🔥 PDF UPLOAD ROUTE
// ==========================
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    console.log("UPLOAD HIT");

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const filePath = req.file.path;

    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);

    const text = pdfData.text;

    // simple summary
    const summary = text.split(" ").slice(0, 100).join(" ");

    // delete temp file
    fs.unlinkSync(filePath);

    res.json({ summary });
  } catch (err) {
    console.log("UPLOAD ERROR:", err);
    res.status(500).json({ message: "PDF processing failed" });
  }
});

// ==========================
// TEST ROUTE
// ==========================
app.get("/test", (req, res) => {
  res.send("Backend working 🚀");
});

// ==========================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const summaryRoutes = require("./routes/Summary");

const app = express();

// CORS
const corsOptions = {
  origin: function (origin, callback) {
    // allow requests with no origin (Postman, direct server checks, etc.)
    if (!origin) {
      return callback(null, true);
    }

    const allowedOrigins = [
      "https://notegenius-ai.netlify.app",
      "http://localhost:5500",
      "http://127.0.0.1:5500",
      "http://localhost:3000"
    ];

    const isNetlifyPreview =
      origin.endsWith(".netlify.app");

    if (allowedOrigins.includes(origin) || isNetlifyPreview) {
      return callback(null, true);
    }

    return callback(new Error("Not allowed by CORS: " + origin));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json());

// MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log("MongoDB error:", err.message));

// uploads folder
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({ dest: uploadsDir });

// routes
app.use("/api/auth", authRoutes);
app.use("/api/summary", summaryRoutes);

// stop words
const stopWords = new Set([
  "the", "is", "are", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with",
  "by", "as", "at", "from", "that", "this", "it", "be", "was", "were", "has", "have",
  "had", "will", "can", "into", "about", "their", "them", "also", "than", "then",
  "but", "not", "which", "who", "what", "when", "where", "why", "how", "you", "your",
  "we", "our", "they", "he", "she", "his", "her", "its", "i", "am", "been", "being"
]);

function splitSentences(text) {
  return text
    .replace(/\r/g, " ")
    .replace(/\n+/g, " ")
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function getWordFrequency(text) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !stopWords.has(w) && w.length > 2);

  const freq = {};
  for (const word of words) {
    freq[word] = (freq[word] || 0) + 1;
  }
  return freq;
}

function scoreSentences(sentences, freq) {
  return sentences.map((sentence, index) => {
    const words = sentence
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/);

    let score = 0;
    for (const word of words) {
      if (freq[word]) {
        score += freq[word];
      }
    }

    return { sentence, score, index };
  });
}

function generateSummaryAndPoints(text) {
  const cleanText = (text || "").trim();
  const sentences = splitSentences(cleanText);

  if (sentences.length === 0) {
    return {
      summary: "No meaningful text found.",
      points: []
    };
  }

  const freq = getWordFrequency(cleanText);
  const scored = scoreSentences(sentences, freq);

  const summarySentences = [...scored]
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(3, sentences.length))
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence);

  const keyPoints = [...scored]
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(5, sentences.length))
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence.replace(/[.?!]+$/, "").trim());

  const summary = summarySentences.length
    ? summarySentences.join(" ")
    : sentences.slice(0, 2).join(" ");

  return {
    summary,
    points: [...new Set(keyPoints)]
  };
}

// text summary
app.post("/summarize", (req, res) => {
  try {
    const text = (req.body.text || "").trim();

    if (!text) {
      return res.status(400).json({
        summary: "No text provided",
        points: []
      });
    }

    const result = generateSummaryAndPoints(text);
    return res.json(result);
  } catch (err) {
    console.log("SUMMARIZE ERROR:", err);
    return res.status(500).json({
      summary: "Error generating summary",
      points: []
    });
  }
});

// pdf summary
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    console.log("UPLOAD HIT");

    if (!req.file) {
      return res.status(400).json({
        summary: "No file uploaded",
        points: []
      });
    }

    const filePath = req.file.path;
    const buffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(buffer);
    const text = (pdfData.text || "").trim();

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    if (!text) {
      return res.status(400).json({
        summary: "No readable text found in PDF. Use a text-based PDF.",
        points: []
      });
    }

    const result = generateSummaryAndPoints(text);
    return res.json(result);
  } catch (err) {
    console.log("UPLOAD ERROR:", err);
    return res.status(500).json({
      summary: "PDF processing failed",
      points: []
    });
  }
});

// health routes
app.get("/test", (req, res) => {
  res.send("Backend working 🚀");
});

app.get("/", (req, res) => {
  res.send("NoteGenius backend is live");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

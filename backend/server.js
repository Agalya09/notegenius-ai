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

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    const allowedOrigins = [
      "https://notegenius-ai.netlify.app",
      "http://localhost:5500",
      "http://127.0.0.1:5500",
      "http://localhost:3000"
    ];

    const isNetlifyPreview = origin.endsWith(".netlify.app");

    if (allowedOrigins.includes(origin) || isNetlifyPreview) {
      return callback(null, true);
    }

    return callback(new Error("Not allowed by CORS: " + origin));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

app.use(cors(corsOptions));
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log("MongoDB error:", err.message));

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({ dest: uploadsDir });

app.use("/api/auth", authRoutes);
app.use("/api/summary", summaryRoutes);

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

function generateSummaryAndPoints(text, length = "medium") {
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

  let summaryCount = 3;
  let pointCount = 5;

  if (length === "short") {
    summaryCount = 2;
    pointCount = 3;
  } else if (length === "long") {
    summaryCount = 5;
    pointCount = 7;
  }

  const summarySentences = [...scored]
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(summaryCount, sentences.length))
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence);

  const keyPoints = [...scored]
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(pointCount, sentences.length))
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

function basicGrammarCheck(text) {
  let correctedText = text;
  const suggestions = [];

  const corrections = [
    { wrong: /\bi\b/g, correct: "I", message: "Changed 'i' to 'I'" },
    { wrong: /\bdont\b/gi, correct: "don't", message: "Corrected 'dont' to 'don't'" },
    { wrong: /\bcant\b/gi, correct: "can't", message: "Corrected 'cant' to 'can't'" },
    { wrong: /\bwont\b/gi, correct: "won't", message: "Corrected 'wont' to 'won't'" },
    { wrong: /\bim\b/gi, correct: "I'm", message: "Corrected 'im' to 'I'm'" },
    { wrong: /\bu\b/gi, correct: "you", message: "Replaced informal 'u' with 'you'" },
    { wrong: /\bur\b/gi, correct: "your", message: "Replaced informal 'ur' with 'your'" },
    { wrong: /\bteh\b/gi, correct: "the", message: "Corrected 'teh' to 'the'" },
    { wrong: /\brecieve\b/gi, correct: "receive", message: "Corrected 'recieve' to 'receive'" },
    { wrong: /\bseperate\b/gi, correct: "separate", message: "Corrected 'seperate' to 'separate'" }
  ];

  corrections.forEach((item) => {
    if (item.wrong.test(correctedText)) {
      correctedText = correctedText.replace(item.wrong, item.correct);
      suggestions.push(item.message);
    }
  });

  correctedText = correctedText.replace(/\s+/g, " ").trim();

  if (correctedText.length > 0) {
    correctedText = correctedText.charAt(0).toUpperCase() + correctedText.slice(1);
  }

  if (correctedText && !/[.?!]$/.test(correctedText)) {
    correctedText += ".";
    suggestions.push("Added ending punctuation.");
  }

  return {
    correctedText,
    suggestions
  };
}

app.post("/summarize", (req, res) => {
  try {
    const text = (req.body.text || "").trim();
    const length = req.body.length || "medium";

    if (!text) {
      return res.status(400).json({
        summary: "No text provided",
        points: []
      });
    }

    const result = generateSummaryAndPoints(text, length);
    return res.json(result);
  } catch (err) {
    console.log("SUMMARIZE ERROR:", err);
    return res.status(500).json({
      summary: "Error generating summary",
      points: []
    });
  }
});

app.post("/grammar-check", (req, res) => {
  try {
    const text = (req.body.text || "").trim();

    if (!text) {
      return res.status(400).json({
        message: "No text provided"
      });
    }

    const result = basicGrammarCheck(text);

    return res.json({
      correctedText: result.correctedText,
      suggestions: result.suggestions
    });
  } catch (err) {
    console.log("GRAMMAR CHECK ERROR:", err);
    return res.status(500).json({
      message: "Grammar check failed"
    });
  }
});

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

    const result = generateSummaryAndPoints(text, "medium");
    return res.json(result);
  } catch (err) {
    console.log("UPLOAD ERROR:", err);
    return res.status(500).json({
      summary: "PDF processing failed",
      points: []
    });
  }
});

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

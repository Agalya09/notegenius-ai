const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const fs = require("fs");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const summaryRoutes = require("./routes/summary");

const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log("MongoDB error:", err.message));

app.get("/", (req, res) => {
  res.send("Server working");
});

app.get("/test", (req, res) => {
  res.send("Backend working");
});

app.use("/api/auth", authRoutes);
app.use("/api/summary", summaryRoutes);

const stopWords = new Set([
  "the","is","are","a","an","and","or","of","to","in","on","for","with",
  "by","as","at","from","that","this","it","be","was","were","has","have",
  "had","will","can","into","about","their","them","also","than","then",
  "but","not","which","who","what","when","where","why","how"
]);

function splitSentences(text) {
  return text
    .replace(/\n+/g, " ")
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function getWordFrequency(text) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w && !stopWords.has(w) && w.length > 2);

  const freq = {};
  for (const w of words) {
    freq[w] = (freq[w] || 0) + 1;
  }
  return freq;
}

function scoreSentences(sentences, freq) {
  return sentences.map((sentence, index) => {
    const words = sentence
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/);

    let score = 0;
    for (const w of words) {
      if (freq[w]) score += freq[w];
    }

    return { sentence, score, index };
  });
}

function generateSummaryAndPoints(text) {
  const sentences = splitSentences(text);

  if (sentences.length === 0) {
    return {
      summary: "No meaningful text found.",
      points: []
    };
  }

  const freq = getWordFrequency(text);
  const scored = scoreSentences(sentences, freq);

  const topSummary = [...scored]
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence);

  const topPoints = [...scored]
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence.replace(/[.?!]+$/, ""));

  let summary = topSummary.join(" ");
  if (!summary) {
    summary = sentences.slice(0, 2).join(" ");
  }

  return {
    summary,
    points: [...new Set(topPoints)]
  };
}

app.post("/summarize", (req, res) => {
  try {
    const text = (req.body.text || "").trim();

    if (!text) {
      return res.json({
        summary: "No text provided",
        points: []
      });
    }

    const result = generateSummaryAndPoints(text);
    return res.json(result);
  } catch (err) {
    console.log("Summarize error:", err);
    return res.status(500).json({
      summary: "Error generating summary",
      points: []
    });
  }
});

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    console.log("UPLOAD HIT");

    if (!req.file) {
      return res.json({
        summary: "No file uploaded",
        points: []
      });
    }

    console.log("File saved:", req.file.path);

    const buffer = fs.readFileSync(req.file.path);
    const pdf = await pdfParse(buffer);
    const text = (pdf.text || "").trim();

    console.log("Text length:", text.length);

    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    if (!text) {
      return res.json({
        summary: "No readable text in PDF",
        points: []
      });
    }

    const result = generateSummaryAndPoints(text);
    return res.json(result);

  } catch (err) {
    console.log("UPLOAD ERROR:", err);
    return res.json({
      summary: "Upload failed",
      points: []
    });
  }
});

app.listen(5000, () => {
  console.log("Server running on 5000");
});
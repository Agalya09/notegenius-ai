const mongoose = require("mongoose");

const summarySchema = new mongoose.Schema({
  userId: String,
  text: String,
  summary: String,
  points: [String]
}, { timestamps: true });

module.exports = mongoose.model("Summary", summarySchema);
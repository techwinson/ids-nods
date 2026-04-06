const mongoose = require("mongoose");

const blockedSchema = new mongoose.Schema({
  ip: {
    type: String,
    default: null,
  },
  deviceId: {
    type: String,
    default: null,
  },
  blockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  reason: {
    type: String,
    default: "Manual block",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Blocked", blockedSchema);

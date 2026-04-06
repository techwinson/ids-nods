const mongoose = require("mongoose");

const logSchema = new mongoose.Schema(
  {
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    prediction: {
      type: String,
      enum: ["NORMAL", "ATTACK"],
      required: true,
    },
    attackType: {
      type: String,
      default: null,
    },
    activityType: {
      type: String,
      default: null,
    },
    sourceIp: {
      type: String,
      default: null,
    },
    deviceId: {
      type: String,
      default: null,
    },
    rfConfidence: {
      type: Number,
      default: null,
    },
    xgbConfidence: {
      type: Number,
      default: null,
    },
    modelConfidence: {
      type: Number,
      default: null,
    },
    time: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Log", logSchema);

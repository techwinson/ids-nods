require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const multer = require("multer");

const Log = require("./models/Log");
const User = require("./models/User");
const Blocked = require("./models/Blocked");

const authRoutes = require("./routes/auth");
const { verifyToken, authorize } = require("./middleware/auth");

const app = express();

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/ids";
const PORT = Number(process.env.PORT || 5000);

const ML_ENGINE_DIR = path.resolve(__dirname, "../ml-engine");
const MODEL_FILE = path.join(ML_ENGINE_DIR, "model.pkl");
const METRICS_FILE = path.join(ML_ENGINE_DIR, "metrics.json");
const UPLOADS_DIR = path.join(ML_ENGINE_DIR, "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const cleanBase = path
        .basename(file.originalname, path.extname(file.originalname))
        .replace(/[^a-zA-Z0-9_-]/g, "_");
      const name = `${Date.now()}_${cleanBase || "dataset"}.csv`;
      cb(null, name);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const isCsv =
      file.mimetype === "text/csv" ||
      file.originalname.toLowerCase().endsWith(".csv");
    cb(isCsv ? null : new Error("Only .csv files are allowed"), isCsv);
  },
  limits: {
    fileSize: 30 * 1024 * 1024,
  },
});

app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json());

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
  })
  .catch((err) => {
    console.error("MongoDB connection error", err);
  });

app.use("/api/auth", authRoutes);

const toNumberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toPercent = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  return Math.round(Number(value) * 10000) / 100;
};

const normalizePrediction = (value) =>
  String(value || "").toUpperCase() === "ATTACK" ? "ATTACK" : "NORMAL";

const formatLog = (log) => {
  const raw = typeof log.toObject === "function" ? log.toObject() : log;
  return {
    id: raw._id,
    prediction: raw.prediction,
    recordedTime: raw.time,
    mlAccuracy: toPercent(raw.modelConfidence),
    modelConfidence: raw.modelConfidence,
    rfConfidence: raw.rfConfidence,
    xgbConfidence: raw.xgbConfidence,
    attackType: raw.attackType || null,
    activityType:
      raw.activityType ||
      (raw.prediction === "ATTACK" ? raw.attackType || "attack" : "normal"),
    sourceIp: raw.sourceIp || null,
    deviceId: raw.deviceId || null,
    data: raw.data || {},
  };
};

const runTrainingScript = (datasetPath) =>
  new Promise((resolve, reject) => {
    const args = [
      "train.py",
      "--dataset",
      datasetPath,
      "--metrics",
      METRICS_FILE,
      "--model",
      MODEL_FILE,
    ];
    const child = spawn("python", args, { cwd: ML_ENGINE_DIR });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          `Training failed with exit code ${code}\n${stderr || stdout}`,
        ),
      );
    });

    child.on("error", (err) => {
      reject(err);
    });
  });

const promoteUser = async (req, res) => {
  const allowedRoles = ["admin", "analyst", "user"];
  const role = String(req.body.role || "").toLowerCase();

  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ message: "Invalid role" });
  }

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { role },
    { new: true, runValidators: true },
  ).select("email username role");

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  return res.json({
    message: "Role updated",
    user,
  });
};

const blockEntity = async (req, res) => {
  const ip = typeof req.body.ip === "string" ? req.body.ip.trim() : "";
  const deviceId =
    typeof req.body.deviceId === "string" ? req.body.deviceId.trim() : "";
  const reason =
    typeof req.body.reason === "string" && req.body.reason.trim()
      ? req.body.reason.trim()
      : "Manual block";

  if (!ip && !deviceId) {
    return res.status(400).json({ message: "ip or deviceId is required" });
  }

  const query = ip ? { ip } : { deviceId };
  const blocked = await Blocked.findOneAndUpdate(
    query,
    {
      $set: {
        ip: ip || null,
        deviceId: deviceId || null,
        blockedBy: req.user.id,
        reason,
        createdAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return res.json({ message: "Blocked", blocked });
};

// receive logs
app.post("/api/log", async (req, res) => {
  const prediction = normalizePrediction(req.body.prediction);
  const rfConfidence = toNumberOrNull(req.body.rfConfidence);
  const xgbConfidence = toNumberOrNull(req.body.xgbConfidence);
  const providedModelConfidence = toNumberOrNull(req.body.modelConfidence);
  const averageConfidence =
    rfConfidence !== null && xgbConfidence !== null
      ? (rfConfidence + xgbConfidence) / 2
      : null;

  const modelConfidence =
    providedModelConfidence !== null
      ? providedModelConfidence
      : averageConfidence;

  const activityType =
    req.body.activityType ||
    (prediction === "ATTACK" ? req.body.attackType || "attack" : "normal");

  const sourceIp =
    req.body.sourceIp || req.body.data?.srcip || req.body.data?.src_ip || null;
  const deviceId =
    req.body.deviceId ||
    req.body.data?.device ||
    req.body.data?.device_id ||
    null;

  const doc = await Log.create({
    data: req.body.data || {},
    prediction,
    attackType: req.body.attackType || null,
    activityType,
    sourceIp,
    deviceId,
    rfConfidence,
    xgbConfidence,
    modelConfidence,
  });

  res.status(201).json({ message: "Saved", log: formatLog(doc) });
});

// dashboard attacks (all users)
app.get("/api/dashboard", verifyToken, async (req, res) => {
  const attacks = await Log.find({ prediction: "ATTACK" })
    .sort({ time: -1 })
    .limit(200);
  res.json(attacks.map(formatLog));
});

// logs (admin + analyst)
app.get(
  "/api/logs",
  verifyToken,
  authorize(["admin", "analyst"]),
  async (req, res) => {
    const logs = await Log.find().sort({ time: -1 }).limit(1000);
    res.json(logs.map(formatLog));
  },
);

// alerts (all users)
app.get("/api/alerts", verifyToken, async (req, res) => {
  const alerts = await Log.find({ prediction: "ATTACK" })
    .sort({ time: -1 })
    .limit(200);
  res.json(alerts.map(formatLog));
});

// model training (analyst + admin)
app.post(
  "/api/model/train",
  verifyToken,
  authorize(["admin", "analyst"]),
  upload.single("dataset"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "Dataset .csv file is required" });
    }

    try {
      const { stdout, stderr } = await runTrainingScript(req.file.path);
      const metrics = fs.existsSync(METRICS_FILE)
        ? JSON.parse(fs.readFileSync(METRICS_FILE, "utf-8"))
        : null;

      return res.json({
        message: "Model updated successfully",
        modelPath: MODEL_FILE,
        dataset: req.file.filename,
        metrics,
        logs: {
          stdout,
          stderr,
        },
      });
    } catch (err) {
      return res.status(500).json({
        message: "Training failed",
        details: err.message,
      });
    }
  },
);

// model performance (analyst + admin)
app.get(
  "/api/model/performance",
  verifyToken,
  authorize(["admin", "analyst"]),
  async (_req, res) => {
    if (!fs.existsSync(METRICS_FILE)) {
      return res.status(404).json({
        message: "No metrics found. Train a model first.",
      });
    }

    const metrics = JSON.parse(fs.readFileSync(METRICS_FILE, "utf-8"));
    return res.json(metrics);
  },
);

// admin users
app.get(
  "/api/admin/users",
  verifyToken,
  authorize(["admin"]),
  async (_req, res) => {
    const users = await User.find()
      .select("email username role createdAt")
      .sort({ createdAt: -1 });
    res.json(users);
  },
);

// promote user (admin)
app.put("/api/promote/:id", verifyToken, authorize(["admin"]), promoteUser);

app.put(
  "/api/admin/promote/:id",
  verifyToken,
  authorize(["admin"]),
  promoteUser,
);

// block ip/device (admin)
app.post("/api/block", verifyToken, authorize(["admin"]), blockEntity);

app.post("/api/admin/block", verifyToken, authorize(["admin"]), blockEntity);

app.get(
  "/api/admin/blocked",
  verifyToken,
  authorize(["admin"]),
  async (_req, res) => {
    const blocked = await Blocked.find().sort({ createdAt: -1 });
    res.json(blocked);
  },
);

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: err.message });
  }
  if (err) {
    return res.status(400).json({ message: err.message || "Request failed" });
  }
  return res.status(500).json({ message: "Unexpected error" });
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

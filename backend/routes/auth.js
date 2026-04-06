const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();
const SECRET = process.env.JWT_SECRET || "change_this_secret";
const TOKEN_EXPIRY = process.env.JWT_EXPIRES_IN || "1h";

const normalizeEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

router.post("/register", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password || "";
    const username =
      typeof req.body.username === "string"
        ? req.body.username.trim()
        : undefined;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Invalid email" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Account already exists" });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, username, password: hash });

    const token = jwt.sign({ id: user._id, role: user.role }, SECRET, {
      expiresIn: TOKEN_EXPIRY,
    });

    return res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        username: user.username,
      },
    });
  } catch (err) {
    console.error("register error", err);
    return res.status(500).json({ message: "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password || "";

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, SECRET, {
      expiresIn: TOKEN_EXPIRY,
    });

    return res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        username: user.username,
      },
    });
  } catch (err) {
    console.error("login error", err);
    return res.status(500).json({ message: "Login failed" });
  }
});

router.get("/me", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "email username role createdAt",
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ user });
  } catch (err) {
    console.error("me error", err);
    return res.status(500).json({ message: "Failed to load profile" });
  }
});

module.exports = router;

const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "change_this_secret";

exports.verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  if (!token) {
    return res.status(401).json({ message: "Missing token" });
  }

  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (err) {
    const message =
      err.name === "TokenExpiredError" ? "Token expired" : "Invalid token";
    res.status(401).json({ message });
  }
};

exports.authorize = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
};

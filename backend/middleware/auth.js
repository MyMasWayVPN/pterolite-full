const jwt = require("jsonwebtoken");
const config = require("../config");
const { getUser } = require("../services/userService");

// JWT Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, config.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Admin role check middleware
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Helper function to check container ownership
const checkContainerOwnership = (req, res, next) => {
  const user = getUser(req.user.username);
  const containerId = req.params.id || req.body.containerId || req.query.containerId;
  
  if (req.user.role === 'admin') {
    // Admin can access all containers
    return next();
  }
  
  if (containerId && !user.containers.includes(containerId)) {
    return res.status(403).json({ error: "Access denied to this server" });
  }
  
  next();
};

// API Key authentication middleware (for external API)
const requireAuth = (req, res, next) => {
  if (req.headers["x-api-key"] !== config.API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

module.exports = {
  authenticateToken,
  requireAdmin,
  checkContainerOwnership,
  requireAuth
};

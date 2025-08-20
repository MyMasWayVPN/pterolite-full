const express = require("express");
const Docker = require("dockerode");
const bodyParser = require("body-parser");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { exec, spawn } = require("child_process");
const archiver = require("archiver");
const unzipper = require("unzipper");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const docker = new Docker({ socketPath: "/var/run/docker.sock" });
const app = express();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = '/tmp/pterolite-uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

app.use(bodyParser.json());
app.use(express.static('public'));

const API_KEY = process.env.API_KEY || "supersecretkey";
const JWT_SECRET = process.env.JWT_SECRET || "pterolite-jwt-secret-key";

// ===== USER MANAGEMENT & AUTHENTICATION =====

// In-memory storage for users (in production, use database)
const users = new Map();

// Load users from file if exists
const usersFile = '/tmp/pterolite-users.json';
if (fs.existsSync(usersFile)) {
  try {
    const userData = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    userData.forEach(user => {
      users.set(user.username, user);
    });
    console.log(`Loaded ${users.size} users from file`);
  } catch (error) {
    console.error('Error loading users:', error.message);
  }
}

// Save users to file
function saveUsers() {
  try {
    const userData = Array.from(users.values());
    fs.writeFileSync(usersFile, JSON.stringify(userData, null, 2));
  } catch (error) {
    console.error('Error saving users:', error.message);
  }
}

// JWT Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
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
  const user = users.get(req.user.username);
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

// ===== AUTHENTICATION ENDPOINTS =====

// Login endpoint
app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const user = users.get(username);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create user endpoint (admin only)
app.post("/auth/users", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    
    if (!username || !email || !password || !role) {
      return res.status(400).json({ error: "All fields required" });
    }

    if (users.has(username)) {
      return res.status(400).json({ error: "Username already exists" });
    }

    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: uuidv4(),
      username,
      email,
      password: hashedPassword,
      role,
      createdAt: new Date(),
      containers: []
    };

    users.set(username, newUser);
    saveUsers();

    res.json({
      success: true,
      message: "User created successfully",
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all users (admin only)
app.get("/auth/users", authenticateToken, requireAdmin, (req, res) => {
  const userList = Array.from(users.values()).map(user => ({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    containerCount: user.containers.length
  }));
  
  res.json({ users: userList });
});

// Delete user (admin only)
app.delete("/auth/users/:username", authenticateToken, requireAdmin, (req, res) => {
  const { username } = req.params;
  
  if (username === req.user.username) {
    return res.status(400).json({ error: "Cannot delete your own account" });
  }
  
  if (users.has(username)) {
    users.delete(username);
    saveUsers();
    res.json({ success: true, message: "User deleted successfully" });
  } else {
    res.status(404).json({ error: "User not found" });
  }
});

// Get current user info
app.get("/auth/me", authenticateToken, (req, res) => {
  const user = users.get(req.user.username);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      containerCount: user.containers.length
    }
  });
});

// ===== CONTAINER MANAGEMENT ENDPOINTS =====

// Get containers (filtered by user)
app.get("/containers", authenticateToken, async (req, res) => {
  try {
    const allContainers = await docker.listContainers({ all: true });
    const user = users.get(req.user.username);
    
    let userContainers;
    if (req.user.role === 'admin') {
      // Admin can see all containers
      userContainers = allContainers;
    } else {
      // Regular users can only see their own containers
      userContainers = allContainers.filter(container => 
        user.containers.includes(container.Id)
      );
    }
    
    res.json(userContainers);
  } catch (error) {
    console.error('Get containers error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create container (with user ownership and limits)
app.post("/containers", authenticateToken, async (req, res) => {
  try {
    const { name, image, cmd, port, description } = req.body;
    const user = users.get(req.user.username);
    
    // Check container limit for regular users
    if (req.user.role === 'user' && user.containers.length >= 1) {
      return res.status(403).json({ 
        error: "Server limit reached. Regular users can only create 1 server." 
      });
    }
    
    // Use a base image that's more likely to exist (ubuntu or alpine)
    let baseImage = 'ubuntu:latest';
    
    // If the requested image is a common base image, use it directly
    const commonImages = [
      'ubuntu', 'alpine', 'debian', 'centos', 'node', 'python', 'nginx'
    ];
    
    const isCommonImage = commonImages.some(common => 
      image.toLowerCase().includes(common.split(':')[0])
    );
    
    if (isCommonImage) {
      baseImage = image;
    }
    
    // Create container folder on host system
    const containerFolder = `/tmp/pterolite-containers/${name}`;
    try {
      if (!fs.existsSync(containerFolder)) {
        fs.mkdirSync(containerFolder, { recursive: true });
        console.log(`Created container folder: ${containerFolder}`);
      }
    } catch (folderError) {
      console.warn(`Failed to create container folder: ${folderError.message}`);
    }
    
    // Create container configuration
    const containerConfig = {
      Image: baseImage,
      name: name,
      Tty: true,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      OpenStdin: true,
      WorkingDir: `/tmp/pterolite-containers/${name}`,
      Cmd: ['/bin/bash'] // Keep container running
    };
    
    // Add port mapping if provided
    if (port) {
      containerConfig.ExposedPorts = {};
      containerConfig.ExposedPorts[`${port}/tcp`] = {};
      containerConfig.HostConfig = {
        PortBindings: {}
      };
      containerConfig.HostConfig.PortBindings[`${port}/tcp`] = [{ HostPort: port.toString() }];
    }
    
    // Create the container
    const container = await docker.createContainer(containerConfig);
    
    // Start the container
    await container.start();
    
    // Add container to user's container list
    user.containers.push(container.id);
    users.set(req.user.username, user);
    saveUsers();
    
    console.log(`Server ${name} created and started successfully for user ${req.user.username}`);
    
    res.json({ 
      message: "Server created & started", 
      id: container.id,
      name: name,
      baseImage: baseImage,
      requestedImage: image,
      port: port,
      description: description,
      owner: req.user.username
    });
  } catch (err) {
    console.error("Container creation error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Start container
app.post("/containers/:id/start", authenticateToken, checkContainerOwnership, async (req, res) => {
  try {
    await docker.getContainer(req.params.id).start();
    res.json({ ok: true });
  } catch (e) {
    console.error("Container start error:", e);
    res.status(400).json({ error: e.message });
  }
});

// Stop container
app.post("/containers/:id/stop", authenticateToken, checkContainerOwnership, async (req, res) => {
  try {
    await docker.getContainer(req.params.id).stop();
    res.json({ ok: true });
  } catch (e) {
    console.error("Container stop error:", e);
    res.status(400).json({ error: e.message });
  }
});

// Delete container
app.delete("/containers/:id", authenticateToken, checkContainerOwnership, async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    
    // Stop container first if it's running
    try {
      await container.stop();
    } catch (stopError) {
      // Container might already be stopped, continue with removal
    }
    
    // Remove the container
    await container.remove();
    
    // Remove container from user's list
    const user = users.get(req.user.username);
    if (user) {
      user.containers = user.containers.filter(id => id !== req.params.id);
      users.set(req.user.username, user);
      saveUsers();
    }
    
    res.json({ 
      ok: true, 
      message: "Server deleted successfully"
    });
  } catch (e) {
    console.error("Container delete error:", e);
    res.status(400).json({ error: e.message });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    version: "2.0.0-stable",
    users: users.size
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
const PORT = process.env.PORT || 8088;
app.listen(PORT, () => {
  console.log(`🚀 PteroLite API (Stable) running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔐 Authentication: JWT-based`);
  console.log(`👥 Users loaded: ${users.size}`);
  console.log(`🐳 Docker integration: Active`);
});

module.exports = app;

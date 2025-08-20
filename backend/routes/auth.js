const express = require("express");
const jwt = require("jsonwebtoken");
const config = require("../config");
const userService = require("../services/userService");
const { authenticateToken, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// Login endpoint
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const user = await userService.validateCredentials(username, password);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role 
      },
      config.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      user: user
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create user endpoint (admin only)
router.post("/users", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    
    if (!username || !email || !password || !role) {
      return res.status(400).json({ error: "All fields required" });
    }

    const newUser = await userService.createUser({ username, email, password, role });

    res.json({
      success: true,
      message: "User created successfully",
      user: newUser
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all users (admin only)
router.get("/users", authenticateToken, requireAdmin, (req, res) => {
  const userList = userService.getAllUsers();
  res.json({ users: userList });
});

// Delete user (admin only)
router.delete("/users/:username", authenticateToken, requireAdmin, (req, res) => {
  const { username } = req.params;
  
  if (username === req.user.username) {
    return res.status(400).json({ error: "Cannot delete your own account" });
  }
  
  const deleted = userService.deleteUser(username);
  if (deleted) {
    res.json({ success: true, message: "User deleted successfully" });
  } else {
    res.status(404).json({ error: "User not found" });
  }
});

// Get current user info
router.get("/me", authenticateToken, (req, res) => {
  const user = userService.getUser(req.user.username);
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

module.exports = router;

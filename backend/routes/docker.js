const express = require("express");
const { exec } = require("child_process");
const dockerService = require("../services/dockerService");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// Get available Docker images on system
router.get("/images", authenticateToken, async (req, res) => {
  try {
    const images = await dockerService.listImages();
    res.json(images);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Execute Docker command (for image management)
router.post("/execute", authenticateToken, (req, res) => {
  const { command } = req.body;
  if (!command) {
    return res.status(400).json({ error: "Docker command required" });
  }
  
  const options = {
    timeout: 300000, // 5 minutes timeout for Docker operations
    maxBuffer: 10 * 1024 * 1024 // 10MB buffer
  };
  
  exec(command, options, (error, stdout, stderr) => {
    res.json({
      command,
      stdout: stdout || '',
      stderr: stderr || '',
      error: error ? error.message : null,
      exitCode: error ? error.code : 0
    });
  });
});

module.exports = router;

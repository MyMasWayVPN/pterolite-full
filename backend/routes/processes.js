const express = require("express");
const { spawn } = require("child_process");
const { v4: uuidv4 } = require("uuid");
const processManager = require("../services/processManager");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// Get all running processes (optionally filtered by container)
router.get("/", authenticateToken, (req, res) => {
  const containerId = req.query.containerId;
  
  // Clean up dead processes before returning
  processManager.cleanupDeadProcesses();
  
  const allProcesses = processManager.getAllProcesses();
  
  if (containerId) {
    // Filter processes by container ID
    const containerProcesses = {};
    for (const [id, process] of Object.entries(allProcesses)) {
      if (process.info.containerId === containerId) {
        containerProcesses[id] = process;
      }
    }
    res.json(containerProcesses);
  } else {
    res.json(allProcesses);
  }
});

// Get process logs
router.get("/:id/logs", authenticateToken, (req, res) => {
  const { id } = req.params;
  const limit = parseInt(req.query.limit) || 100;
  const logs = processManager.getLogs(id, limit);
  res.json({ processId: id, logs });
});

// Kill process
router.post("/:id/kill", authenticateToken, (req, res) => {
  const { id } = req.params;
  const success = processManager.killProcess(id);
  if (success) {
    res.json({ success: true, message: "Process killed successfully" });
  } else {
    res.status(400).json({ error: "Failed to kill process or process not found" });
  }
});

// Remove process from list
router.delete("/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  processManager.removeProcess(id);
  res.json({ success: true, message: "Process removed from list" });
});

module.exports = router;

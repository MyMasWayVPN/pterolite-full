const express = require("express");
const { exec, spawn } = require("child_process");
const { v4: uuidv4 } = require("uuid");
const processManager = require("../services/processManager");
const config = require("../config");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// Execute command (one-time execution)
router.post("/execute", authenticateToken, (req, res) => {
  const { command, workingDir } = req.body;
  if (!command) {
    return res.status(400).json({ error: "Command required" });
  }
  
  const options = {
    cwd: workingDir || config.DEFAULT_FILES_DIR,
    timeout: 30000, // 30 seconds timeout
    maxBuffer: 1024 * 1024 // 1MB buffer
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

// Run command as persistent process
router.post("/run", authenticateToken, (req, res) => {
  const { command, workingDir, name, containerId } = req.body;
  if (!command) {
    return res.status(400).json({ error: "Command required" });
  }
  
  const processId = uuidv4();
  
  try {
    const process = spawn('bash', ['-c', command], {
      cwd: workingDir || config.DEFAULT_FILES_DIR,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true // Create a new process group
    });
    
    const processInfo = {
      id: processId,
      name: name || `Command: ${command.substring(0, 50)}`,
      type: 'command',
      command: command,
      workingDir: workingDir || config.DEFAULT_FILES_DIR,
      containerId: containerId || null
    };
    
    processManager.addProcess(processId, process, processInfo);
    processManager.addLog(processId, 'system', `Command process started: ${command} (PID: ${process.pid})`);
    
    res.json({
      success: true,
      processId,
      message: "Command process started successfully"
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

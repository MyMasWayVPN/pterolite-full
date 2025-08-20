const express = require("express");
const { spawn } = require("child_process");
const { v4: uuidv4 } = require("uuid");
const processManager = require("../services/processManager");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// In-memory storage for startup commands (in production, use database)
const startupCommands = new Map();

// Get all startup commands
router.get("/", authenticateToken, (req, res) => {
  const commands = Array.from(startupCommands.values());
  res.json({ commands });
});

// Save startup command
router.post("/", authenticateToken, (req, res) => {
  const { id, name, command, workingDir, autoStart, description } = req.body;
  
  if (!name || !command) {
    return res.status(400).json({ error: "Name and command are required" });
  }
  
  const commandId = id || uuidv4();
  const startupCommand = {
    id: commandId,
    name,
    command,
    workingDir: workingDir || '/tmp/pterolite-files',
    autoStart: autoStart || false,
    description: description || '',
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  startupCommands.set(commandId, startupCommand);
  
  res.json({
    success: true,
    message: "Startup command saved successfully",
    command: startupCommand
  });
});

// Delete startup command
router.delete("/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  
  if (startupCommands.has(id)) {
    startupCommands.delete(id);
    res.json({ success: true, message: "Startup command deleted successfully" });
  } else {
    res.status(404).json({ error: "Startup command not found" });
  }
});

// Run startup command
router.post("/:id/run", authenticateToken, (req, res) => {
  const { id } = req.params;
  const startupCommand = startupCommands.get(id);
  
  if (!startupCommand) {
    return res.status(404).json({ error: "Startup command not found" });
  }
  
  const processId = uuidv4();
  
  try {
    const process = spawn('bash', ['-c', startupCommand.command], {
      cwd: startupCommand.workingDir,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    const processInfo = {
      id: processId,
      name: startupCommand.name,
      type: 'startup-command',
      command: startupCommand.command,
      workingDir: startupCommand.workingDir,
      startupCommandId: id
    };
    
    processManager.addProcess(processId, process, processInfo);
    processManager.addLog(processId, 'system', `Startup command executed: ${startupCommand.name}`);
    
    res.json({
      success: true,
      processId,
      message: `Startup command "${startupCommand.name}" started successfully`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

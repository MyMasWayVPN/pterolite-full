const express = require("express");
const { exec, spawn } = require("child_process");
const { v4: uuidv4 } = require("uuid");
const processManager = require("../services/processManager");
const fileUtils = require("../utils/fileUtils");
const config = require("../config");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// Execute JavaScript (one-time)
router.post("/javascript", authenticateToken, (req, res) => {
  const { code, workingDir } = req.body;
  if (!code) {
    return res.status(400).json({ error: "JavaScript code required" });
  }
  
  // Create temporary JS file
  const tempFile = fileUtils.createTempFile(code, '.js');
  
  try {
    const options = {
      cwd: workingDir || config.DEFAULT_FILES_DIR,
      timeout: 30000
    };
    
    exec(`node ${tempFile}`, options, (error, stdout, stderr) => {
      // Clean up temp file
      fileUtils.cleanupTempFile(tempFile);
      
      res.json({
        language: 'javascript',
        stdout: stdout || '',
        stderr: stderr || '',
        error: error ? error.message : null,
        exitCode: error ? error.code : 0
      });
    });
  } catch (error) {
    fileUtils.cleanupTempFile(tempFile);
    res.status(500).json({ error: error.message });
  }
});

// Execute Python (one-time)
router.post("/python", authenticateToken, (req, res) => {
  const { code, workingDir } = req.body;
  if (!code) {
    return res.status(400).json({ error: "Python code required" });
  }
  
  // Create temporary Python file
  const tempFile = fileUtils.createTempFile(code, '.py');
  
  try {
    const options = {
      cwd: workingDir || config.DEFAULT_FILES_DIR,
      timeout: 30000
    };
    
    exec(`python3 ${tempFile}`, options, (error, stdout, stderr) => {
      // Clean up temp file
      fileUtils.cleanupTempFile(tempFile);
      
      res.json({
        language: 'python',
        stdout: stdout || '',
        stderr: stderr || '',
        error: error ? error.message : null,
        exitCode: error ? error.code : 0
      });
    });
  } catch (error) {
    fileUtils.cleanupTempFile(tempFile);
    res.status(500).json({ error: error.message });
  }
});

// Run JavaScript as persistent process
router.post("/javascript/run", authenticateToken, (req, res) => {
  const { code, workingDir, name } = req.body;
  if (!code) {
    return res.status(400).json({ error: "JavaScript code required" });
  }
  
  const processId = uuidv4();
  const tempFile = fileUtils.createTempFile(code, `.js`);
  
  try {
    const process = spawn('node', [tempFile], {
      cwd: workingDir || config.DEFAULT_FILES_DIR,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    const processInfo = {
      id: processId,
      name: name || `JavaScript Script`,
      language: 'javascript',
      file: tempFile,
      workingDir: workingDir || config.DEFAULT_FILES_DIR
    };
    
    processManager.addProcess(processId, process, processInfo);
    processManager.addLog(processId, 'system', `JavaScript process started: ${name || 'Unnamed Script'}`);
    
    // Clean up temp file when process ends
    process.on('close', () => {
      fileUtils.cleanupTempFile(tempFile);
    });
    
    res.json({
      success: true,
      processId,
      message: "JavaScript process started successfully"
    });
  } catch (error) {
    fileUtils.cleanupTempFile(tempFile);
    res.status(500).json({ error: error.message });
  }
});

// Run Python as persistent process
router.post("/python/run", authenticateToken, (req, res) => {
  const { code, workingDir, name } = req.body;
  if (!code) {
    return res.status(400).json({ error: "Python code required" });
  }
  
  const processId = uuidv4();
  const tempFile = fileUtils.createTempFile(code, '.py');
  
  try {
    const process = spawn('python3', [tempFile], {
      cwd: workingDir || config.DEFAULT_FILES_DIR,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    const processInfo = {
      id: processId,
      name: name || `Python Script`,
      language: 'python',
      file: tempFile,
      workingDir: workingDir || config.DEFAULT_FILES_DIR
    };
    
    processManager.addProcess(processId, process, processInfo);
    processManager.addLog(processId, 'system', `Python process started: ${name || 'Unnamed Script'}`);
    
    // Clean up temp file when process ends
    process.on('close', () => {
      fileUtils.cleanupTempFile(tempFile);
    });
    
    res.json({
      success: true,
      processId,
      message: "Python process started successfully"
    });
  } catch (error) {
    fileUtils.cleanupTempFile(tempFile);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

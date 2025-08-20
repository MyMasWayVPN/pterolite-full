const express = require("express");
const multer = require("multer");
const unzipper = require("unzipper");
const fs = require("fs");
const path = require("path");
const config = require("../config");
const fileUtils = require("../utils/fileUtils");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(config.UPLOAD_DIR)) {
      fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });
    }
    cb(null, config.UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// List files in directory
router.get("/", authenticateToken, (req, res) => {
  const requestedPath = req.query.path;
  const containerName = req.query.container;
  
  // Validate and get safe path
  const pathValidation = fileUtils.validateContainerPath(requestedPath, containerName);
  if (!pathValidation.isValid) {
    return res.status(403).json({ error: pathValidation.error });
  }
  
  const dirPath = pathValidation.safePath;
  
  try {
    const files = fileUtils.listDirectory(dirPath);
    
    // Add container info to response
    const response = { 
      files, 
      currentPath: dirPath,
      containerName: containerName || null,
      containerFolder: containerName ? `${config.CONTAINER_DIR}/${containerName}` : config.DEFAULT_FILES_DIR
    };
    
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Read file content
router.get("/content", authenticateToken, (req, res) => {
  const requestedPath = req.query.path;
  const containerName = req.query.container;
  
  if (!requestedPath) {
    return res.status(400).json({ error: "Path parameter required" });
  }
  
  // Validate path
  const pathValidation = fileUtils.validateContainerPath(requestedPath, containerName);
  if (!pathValidation.isValid) {
    return res.status(403).json({ error: pathValidation.error });
  }
  
  try {
    const content = fileUtils.readFileContent(pathValidation.safePath);
    res.json({ content, path: pathValidation.safePath });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save file content
router.post("/save", authenticateToken, (req, res) => {
  const { path: requestedPath, content, container: containerName } = req.body;
  
  if (!requestedPath || content === undefined) {
    return res.status(400).json({ error: "Path and content required" });
  }
  
  // Validate path
  const pathValidation = fileUtils.validateContainerPath(requestedPath, containerName);
  if (!pathValidation.isValid) {
    return res.status(403).json({ error: pathValidation.error });
  }
  
  const filePath = pathValidation.safePath;
  
  try {
    fileUtils.writeFileContent(filePath, content);
    res.json({ success: true, message: "File saved successfully", path: filePath });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload file
router.post("/upload", authenticateToken, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  
  const requestedPath = req.body.targetPath;
  const containerName = req.body.container;
  
  // Validate target path
  const pathValidation = fileUtils.validateContainerPath(requestedPath, containerName);
  if (!pathValidation.isValid) {
    // Clean up uploaded file
    fileUtils.cleanupTempFile(req.file.path);
    return res.status(403).json({ error: pathValidation.error });
  }
  
  const targetPath = pathValidation.safePath;
  const finalPath = path.join(targetPath, req.file.originalname);
  
  // Validate final path as well
  const finalPathValidation = fileUtils.validateContainerPath(finalPath, containerName);
  if (!finalPathValidation.isValid) {
    // Clean up uploaded file
    fileUtils.cleanupTempFile(req.file.path);
    return res.status(403).json({ error: finalPathValidation.error });
  }
  
  try {
    // Create target directory if it doesn't exist
    fileUtils.ensureDirectoryExists(targetPath);
    
    // Move file to target location
    fileUtils.moveFile(req.file.path, finalPathValidation.safePath);
    
    res.json({ 
      success: true, 
      message: "File uploaded successfully",
      path: finalPathValidation.safePath,
      filename: req.file.originalname
    });
  } catch (error) {
    // Clean up uploaded file on error
    fileUtils.cleanupTempFile(req.file.path);
    res.status(500).json({ error: error.message });
  }
});

// Delete file/directory
router.delete("/", authenticateToken, (req, res) => {
  const requestedPath = req.query.path;
  const containerName = req.query.container;
  
  if (!requestedPath) {
    return res.status(400).json({ error: "Path parameter required" });
  }
  
  // Validate path
  const pathValidation = fileUtils.validateContainerPath(requestedPath, containerName);
  if (!pathValidation.isValid) {
    return res.status(403).json({ error: pathValidation.error });
  }
  
  const filePath = pathValidation.safePath;
  
  try {
    const deleted = fileUtils.deleteFileOrDirectory(filePath);
    if (deleted) {
      res.json({ success: true, message: "File/directory deleted successfully" });
    } else {
      res.status(404).json({ error: "File not found" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Extract ZIP file
router.post("/extract", authenticateToken, (req, res) => {
  const { zipPath: requestedZipPath, extractPath: requestedExtractPath, container: containerName } = req.body;
  
  if (!requestedZipPath || !requestedExtractPath) {
    return res.status(400).json({ error: "ZIP path and extract path required" });
  }
  
  // Validate both paths
  const zipPathValidation = fileUtils.validateContainerPath(requestedZipPath, containerName);
  const extractPathValidation = fileUtils.validateContainerPath(requestedExtractPath, containerName);
  
  if (!zipPathValidation.isValid) {
    return res.status(403).json({ error: `ZIP file: ${zipPathValidation.error}` });
  }
  
  if (!extractPathValidation.isValid) {
    return res.status(403).json({ error: `Extract path: ${extractPathValidation.error}` });
  }
  
  const zipPath = zipPathValidation.safePath;
  const extractPath = extractPathValidation.safePath;
  
  try {
    // Create extract directory if it doesn't exist
    fileUtils.ensureDirectoryExists(extractPath);
    
    fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: extractPath }))
      .on('close', () => {
        res.json({ success: true, message: "ZIP extracted successfully" });
      })
      .on('error', (error) => {
        res.status(500).json({ error: error.message });
      });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new directory
router.post("/mkdir", authenticateToken, (req, res) => {
  const { path: requestedPath, name, container: containerName } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: "Directory name required" });
  }
  
  // Validate parent path
  const pathValidation = fileUtils.validateContainerPath(requestedPath, containerName);
  if (!pathValidation.isValid) {
    return res.status(403).json({ error: pathValidation.error });
  }
  
  const parentPath = pathValidation.safePath;
  const newDirPath = path.join(parentPath, name);
  
  // Validate new directory path
  const newDirValidation = fileUtils.validateContainerPath(newDirPath, containerName);
  if (!newDirValidation.isValid) {
    return res.status(403).json({ error: newDirValidation.error });
  }
  
  try {
    fileUtils.createDirectory(newDirValidation.safePath);
    res.json({ 
      success: true, 
      message: "Directory created successfully",
      path: newDirValidation.safePath
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

const fs = require("fs");
const path = require("path");
const config = require("../config");

// Helper function to validate and restrict paths to container folder
function validateContainerPath(requestedPath, containerName) {
  if (!containerName) {
    // If no container specified, use default folder
    const defaultPath = config.DEFAULT_FILES_DIR;
    if (!requestedPath || requestedPath === config.DEFAULT_FILES_DIR) {
      return { isValid: true, safePath: defaultPath };
    }
    
    // Check if requested path is within default folder
    const resolvedPath = path.resolve(requestedPath);
    const resolvedDefault = path.resolve(defaultPath);
    
    if (resolvedPath.startsWith(resolvedDefault)) {
      return { isValid: true, safePath: resolvedPath };
    }
    
    return { isValid: false, error: "Access denied: Path outside allowed directory" };
  }
  
  // Container-specific path validation
  const containerFolder = `${config.CONTAINER_DIR}/${containerName}`;
  const resolvedContainerFolder = path.resolve(containerFolder);
  
  if (!requestedPath) {
    return { isValid: true, safePath: containerFolder };
  }
  
  // Resolve the requested path
  const resolvedPath = path.resolve(requestedPath);
  
  // Check if the resolved path is within the container folder
  if (resolvedPath.startsWith(resolvedContainerFolder)) {
    return { isValid: true, safePath: resolvedPath };
  }
  
  // Path is outside container folder - deny access
  return { 
    isValid: false, 
    error: `Access denied: Path '${requestedPath}' is outside server folder '${containerFolder}'` 
  };
}

// Ensure directory exists
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Get file stats
function getFileStats(filePath) {
  const stats = fs.statSync(filePath);
  return {
    isDirectory: stats.isDirectory(),
    size: stats.size,
    modified: stats.mtime,
    created: stats.birthtime
  };
}

// List directory contents
function listDirectory(dirPath) {
  ensureDirectoryExists(dirPath);
  
  return fs.readdirSync(dirPath).map(file => {
    const filePath = path.join(dirPath, file);
    const stats = getFileStats(filePath);
    return {
      name: file,
      path: filePath,
      ...stats
    };
  });
}

// Read file content
function readFileContent(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

// Write file content
function writeFileContent(filePath, content) {
  // Create directory if it doesn't exist
  const dir = path.dirname(filePath);
  ensureDirectoryExists(dir);
  
  fs.writeFileSync(filePath, content, 'utf8');
}

// Delete file or directory
function deleteFileOrDirectory(filePath) {
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      fs.rmSync(filePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(filePath);
    }
    return true;
  }
  return false;
}

// Create directory
function createDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    throw new Error("Directory already exists");
  }
  
  fs.mkdirSync(dirPath, { recursive: true });
}

// Move/rename file
function moveFile(sourcePath, targetPath) {
  fs.renameSync(sourcePath, targetPath);
}

// Copy file
function copyFile(sourcePath, targetPath) {
  // Ensure target directory exists
  const targetDir = path.dirname(targetPath);
  ensureDirectoryExists(targetDir);
  
  fs.copyFileSync(sourcePath, targetPath);
}

// Get file extension
function getFileExtension(filename) {
  return path.extname(filename).toLowerCase();
}

// Check if file is text file
function isTextFile(filename) {
  const textExtensions = [
    '.txt', '.js', '.json', '.html', '.css', '.md', '.yml', '.yaml',
    '.xml', '.csv', '.log', '.conf', '.config', '.ini', '.env',
    '.py', '.php', '.rb', '.go', '.java', '.cpp', '.c', '.h',
    '.sh', '.bat', '.ps1', '.sql', '.dockerfile'
  ];
  
  const ext = getFileExtension(filename);
  return textExtensions.includes(ext);
}

// Get file size in human readable format
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Create temporary file
function createTempFile(content, extension = '.tmp') {
  const tempFile = path.join('/tmp', `pterolite-${Date.now()}${extension}`);
  fs.writeFileSync(tempFile, content);
  return tempFile;
}

// Clean up temporary file
function cleanupTempFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.warn(`Failed to cleanup temp file ${filePath}:`, error.message);
  }
}

module.exports = {
  validateContainerPath,
  ensureDirectoryExists,
  getFileStats,
  listDirectory,
  readFileContent,
  writeFileContent,
  deleteFileOrDirectory,
  createDirectory,
  moveFile,
  copyFile,
  getFileExtension,
  isTextFile,
  formatFileSize,
  createTempFile,
  cleanupTempFile
};

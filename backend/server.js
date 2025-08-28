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
const crypto = require("crypto");
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

// Cookie parser middleware (untuk mendukung cookie-based authentication)
const cookieParser = require('cookie-parser');
app.use(cookieParser());

const API_KEY = process.env.API_KEY || "supersecretkey";
const JWT_SECRET = process.env.JWT_SECRET || "defaultjwtsecret";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";

// ===== AUTHENTICATION FUNCTIONS =====

// Hash password function
function hashPassword(password) {
  return crypto.createHmac('sha256', JWT_SECRET).update(password).digest('base64');
}

// Default password hash for "admin123"
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || hashPassword("admin123");

// Verify password function
function verifyPassword(password, hash) {
  const computedHash = hashPassword(password);
  return computedHash === hash;
}

// Generate JWT token
function generateToken(username) {
  return jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
}

// Verify JWT token
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// ===== PROCESS MANAGEMENT FOR MULTI-SCRIPT RUNNING =====

class ProcessManager {
  constructor() {
    this.processes = new Map();
    this.logs = new Map();
  }

  addProcess(id, process, info) {
    this.processes.set(id, {
      process: process,
      info: info,
      startTime: new Date(),
      status: 'running'
    });
    
    this.logs.set(id, []);
    
    // Handle process output
    if (process.stdout) {
      process.stdout.on('data', (data) => {
        this.addLog(id, 'stdout', data.toString());
      });
    }
    
    if (process.stderr) {
      process.stderr.on('data', (data) => {
        this.addLog(id, 'stderr', data.toString());
      });
    }
    
    process.on('close', (code) => {
      const proc = this.processes.get(id);
      if (proc) {
        proc.status = 'finished';
        proc.exitCode = code;
        this.addLog(id, 'system', `Process finished with exit code: ${code}`);
      }
    });
    
    process.on('error', (error) => {
      const proc = this.processes.get(id);
      if (proc) {
        proc.status = 'error';
        this.addLog(id, 'error', `Process error: ${error.message}`);
      }
    });
  }

  addLog(processId, type, message) {
    const logs = this.logs.get(processId) || [];
    const timestamp = new Date().toISOString();
    logs.push({
      timestamp,
      type,
      message: message.trim()
    });
    
    // Keep only last 1000 log entries per process
    if (logs.length > 1000) {
      logs.splice(0, logs.length - 1000);
    }
    
    this.logs.set(processId, logs);
  }

  getProcess(id) {
    return this.processes.get(id);
  }

  getAllProcesses() {
    const result = {};
    for (const [id, proc] of this.processes.entries()) {
      result[id] = {
        id,
        info: proc.info,
        status: proc.status,
        startTime: proc.startTime,
        exitCode: proc.exitCode || null
      };
    }
    return result;
  }

  getLogs(id, limit = 100) {
    const logs = this.logs.get(id) || [];
    return logs.slice(-limit);
  }

  killProcess(id) {
    const proc = this.processes.get(id);
    if (proc && proc.process && proc.status === 'running') {
      try {
        // Kill the entire process group to ensure all child processes are terminated
        const pid = proc.process.pid;
        
        if (pid) {
          try {
            // Kill the process group (negative PID kills the entire group)
            process.kill(-pid, 'SIGTERM');
            this.addLog(id, 'system', `Process group killed (SIGTERM) - PID: ${pid}`);
          } catch (groupKillError) {
            // If process group kill fails, try individual process kill
            proc.process.kill('SIGTERM');
            this.addLog(id, 'system', `Individual process killed (SIGTERM) - PID: ${pid}`);
          }
        } else {
          proc.process.kill('SIGTERM');
          this.addLog(id, 'system', 'Process killed (SIGTERM)');
        }
        
        proc.status = 'killed';
        
        // Force kill after 3 seconds if still running
        setTimeout(() => {
          const currentProc = this.processes.get(id);
          if (currentProc && currentProc.process && currentProc.status === 'killed') {
            try {
              const currentPid = currentProc.process.pid;
              if (currentPid) {
                try {
                  // Force kill the process group
                  process.kill(-currentPid, 'SIGKILL');
                  this.addLog(id, 'system', `Process group force killed (SIGKILL) - PID: ${currentPid}`);
                } catch (groupForceKillError) {
                  // If process group force kill fails, try individual process force kill
                  currentProc.process.kill('SIGKILL');
                  this.addLog(id, 'system', `Individual process force killed (SIGKILL) - PID: ${currentPid}`);
                }
              } else {
                currentProc.process.kill('SIGKILL');
                this.addLog(id, 'system', 'Process force killed (SIGKILL)');
              }
            } catch (forceKillError) {
              this.addLog(id, 'error', `Failed to force kill process: ${forceKillError.message}`);
            }
          }
        }, 3000);
        
        return true;
      } catch (error) {
        this.addLog(id, 'error', `Failed to kill process: ${error.message}`);
        return false;
      }
    }
    return false;
  }

  removeProcess(id) {
    const proc = this.processes.get(id);
    if (proc) {
      // If process is still running, try to kill it first
      if (proc.status === 'running' && proc.process) {
        try {
          proc.process.kill('SIGKILL');
          this.addLog(id, 'system', 'Process force killed during removal');
        } catch (killError) {
          this.addLog(id, 'error', `Failed to kill process during removal: ${killError.message}`);
        }
      }
    }
    
    this.processes.delete(id);
    this.logs.delete(id);
    return true;
  }

  // Check if process is actually running (not just status)
  isProcessActuallyRunning(id) {
    const proc = this.processes.get(id);
    if (!proc || !proc.process) {
      return false;
    }
    
    try {
      // Check if process is still alive
      const isAlive = !proc.process.killed && proc.process.pid && process.kill(proc.process.pid, 0);
      return isAlive;
    } catch (error) {
      // Process doesn't exist
      return false;
    }
  }

  // Clean up finished/dead processes
  cleanupDeadProcesses() {
    for (const [id, proc] of this.processes.entries()) {
      if (proc.status === 'running' && !this.isProcessActuallyRunning(id)) {
        // Process is marked as running but actually dead
        proc.status = 'finished';
        proc.exitCode = -1;
        this.addLog(id, 'system', 'Process detected as finished (cleanup)');
      }
    }
  }
}

const processManager = new ProcessManager();

// Middleware untuk API authentication (hanya untuk endpoint API eksternal)
const requireAuth = (req, res, next) => {
  if (req.headers["x-api-key"] !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

// Middleware untuk web panel (dengan JWT authentication)
const webPanelAuth = (req, res, next) => {
  // Skip authentication untuk login endpoint
  if (req.path === '/auth/login') {
    return next();
  }
  
  const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.token;
  
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  
  req.user = decoded;
  next();
};

// ===== AUTHENTICATION ENDPOINTS =====

// Login endpoint
app.post("/auth/login", (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }
  
  // Check if admin credentials are configured
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD_HASH) {
    return res.status(500).json({ error: "Admin credentials not configured" });
  }
  
  // Verify credentials
  if (username === ADMIN_USERNAME && verifyPassword(password, ADMIN_PASSWORD_HASH)) {
    const token = generateToken(username);
    
    res.json({
      success: true,
      message: "Login successful",
      token: token,
      user: {
        username: username,
        role: "admin"
      }
    });
  } else {
    res.status(401).json({ error: "Invalid username or password" });
  }
});

// Logout endpoint (client-side token removal)
app.post("/auth/logout", (req, res) => {
  res.json({
    success: true,
    message: "Logout successful"
  });
});

// Check authentication status
app.get("/auth/status", (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.token;
  
  if (!token) {
    return res.json({
      authenticated: false,
      user: null
    });
  }
  
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.json({
      authenticated: false,
      user: null
    });
  }
  
  res.json({
    authenticated: true,
    user: {
      username: decoded.username,
      role: "admin"
    }
  });
});

// ===== CONTAINER MANAGEMENT ENDPOINTS =====

// Endpoint untuk web panel (dengan JWT authentication)
app.get("/containers", webPanelAuth, async (req, res) => {
  const containers = await docker.listContainers({ all: true });
  res.json(containers);
});

app.post("/containers", webPanelAuth, async (req, res) => {
  try {
    const { name, image, cmd, port, description } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: "Docker image is required" });
    }
    
    console.log(`Creating container with requested image: ${image}`);
    
    // Always try to pull the requested image first to ensure we get the latest version
    try {
      console.log(`Pulling requested image: ${image}`);
      const stream = await docker.pull(image);
      
      // Wait for pull to complete
      await new Promise((resolve, reject) => {
        docker.modem.followProgress(stream, (err, res) => {
          if (err) reject(err);
          else resolve(res);
        });
      });
      
      console.log(`Image ${image} pulled successfully`);
    } catch (pullError) {
      console.log(`Pull failed for ${image}:`, pullError.message);
      
      // Check if image exists locally
      try {
        const localImages = await docker.listImages();
        const imageExists = localImages.some(img => 
          img.RepoTags && img.RepoTags.some(tag => tag === image)
        );
        
        if (!imageExists) {
          // Image doesn't exist locally and pull failed
          return res.status(400).json({ 
            error: `Failed to pull image '${image}' and image not found locally. Please check the image name and try again.`,
            pullError: pullError.message
          });
        }
        
        console.log(`Using existing local image: ${image}`);
      } catch (listError) {
        return res.status(500).json({ 
          error: `Failed to check local images: ${listError.message}` 
        });
      }
    }
    
    // Create container folder on host system (but don't mount it)
    const containerFolder = `/tmp/pterolite-containers/${name}`;
    try {
      if (!fs.existsSync(containerFolder)) {
        fs.mkdirSync(containerFolder, { recursive: true });
        console.log(`Created container folder: ${containerFolder}`);
      }
    } catch (folderError) {
      console.warn(`Failed to create container folder: ${folderError.message}`);
    }
    
    // Create container configuration with the REQUESTED image (without bind mounts)
    const containerConfig = {
      Image: image, // Use the actual requested image
      name: name,
      Tty: true,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      OpenStdin: true,
      WorkingDir: `/workspace`,
      Cmd: ['/bin/bash'] // Keep container running
    };
    
    // Add port mapping if provided
    if (port) {
      containerConfig.ExposedPorts = {};
      containerConfig.ExposedPorts[`${port}/tcp`] = {};
      
      if (!containerConfig.HostConfig.PortBindings) {
        containerConfig.HostConfig.PortBindings = {};
      }
      containerConfig.HostConfig.PortBindings[`${port}/tcp`] = [{ HostPort: port.toString() }];
    }
    
    // Create the container with the requested image
    const container = await docker.createContainer(containerConfig);
    
    // Start the container
    await container.start();
    
    console.log(`Container ${name} created and started successfully with image: ${image}`);
    
    res.json({ 
      message: "Container created & started with requested image", 
      id: container.id,
      name: name,
      image: image, // Return the actual image used
      port: port,
      description: description,
      note: `Container successfully created with requested image: ${image}`
    });
  } catch (err) {
    console.error("Container creation error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/containers/:id/start", webPanelAuth, async (req, res) => {
  try {
    await docker.getContainer(req.params.id).start();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/containers/:id/stop", webPanelAuth, async (req, res) => {
  try {
    await docker.getContainer(req.params.id).stop();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/containers/:id", webPanelAuth, async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    const removeImage = req.query.removeImage === 'true'; // Optional parameter
    
    // Get container info before deletion
    let containerInfo;
    let containerName = null;
    try {
      containerInfo = await container.inspect();
      containerName = containerInfo.Name.replace('/', '');
    } catch (inspectError) {
      console.warn('Could not inspect container before deletion:', inspectError.message);
    }
    
    // Stop container first if it's running
    try {
      await container.stop();
    } catch (stopError) {
      // Container might already be stopped, continue with removal
    }
    
    // Remove the container
    await container.remove();
    
    let imageRemovalResult = null;
    let folderRemovalResult = null;
    
    // Remove container folder if it exists
    if (containerName) {
      const containerFolder = `/tmp/pterolite-containers/${containerName}`;
      try {
        if (fs.existsSync(containerFolder)) {
          fs.rmSync(containerFolder, { recursive: true, force: true });
          folderRemovalResult = { success: true, message: `Container folder ${containerFolder} removed successfully` };
          console.log(`Container folder removed: ${containerFolder}`);
        } else {
          folderRemovalResult = { success: false, message: `Container folder ${containerFolder} not found` };
        }
      } catch (folderError) {
        folderRemovalResult = { 
          success: false, 
          message: `Failed to remove container folder ${containerFolder}: ${folderError.message}` 
        };
        console.error('Failed to remove container folder:', folderError);
      }
    }
    
    // Optionally remove the Docker image if requested and safe to do so
    if (removeImage && containerInfo && containerInfo.Config && containerInfo.Config.Image) {
      const imageName = containerInfo.Config.Image;
      
      try {
        // Check if other containers are using this image
        const allContainers = await docker.listContainers({ all: true });
        const containersUsingImage = allContainers.filter(c => 
          c.Image === imageName && c.Id !== req.params.id
        );
        
        if (containersUsingImage.length === 0) {
          // Safe to remove image - no other containers using it
          const image = docker.getImage(imageName);
          await image.remove();
          imageRemovalResult = { success: true, message: `Image ${imageName} removed successfully` };
        } else {
          imageRemovalResult = { 
            success: false, 
            message: `Image ${imageName} not removed - still used by ${containersUsingImage.length} other container(s)` 
          };
        }
      } catch (imageError) {
        imageRemovalResult = { 
          success: false, 
          message: `Failed to remove image ${imageName}: ${imageError.message}` 
        };
      }
    }
    
    const response = { 
      ok: true, 
      message: "Container deleted successfully"
    };
    
    if (folderRemovalResult) {
      response.folderRemoval = folderRemovalResult;
    }
    
    if (imageRemovalResult) {
      response.imageRemoval = imageRemovalResult;
    }
    
    res.json(response);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Endpoint API eksternal dengan authentication (untuk akses programmatic)
app.get("/api/containers", requireAuth, async (req, res) => {
  const containers = await docker.listContainers({ all: true });
  res.json(containers);
});

app.post("/api/containers", requireAuth, async (req, res) => {
  try {
    const { name, image, cmd, port, description } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: "Docker image is required" });
    }
    
    console.log(`Creating container with requested image: ${image}`);
    
    // Always try to pull the requested image first to ensure we get the latest version
    try {
      console.log(`Pulling requested image: ${image}`);
      const stream = await docker.pull(image);
      
      // Wait for pull to complete
      await new Promise((resolve, reject) => {
        docker.modem.followProgress(stream, (err, res) => {
          if (err) reject(err);
          else resolve(res);
        });
      });
      
      console.log(`Image ${image} pulled successfully`);
    } catch (pullError) {
      console.log(`Pull failed for ${image}:`, pullError.message);
      
      // Check if image exists locally
      try {
        const localImages = await docker.listImages();
        const imageExists = localImages.some(img => 
          img.RepoTags && img.RepoTags.some(tag => tag === image)
        );
        
        if (!imageExists) {
          // Image doesn't exist locally and pull failed
          return res.status(400).json({ 
            error: `Failed to pull image '${image}' and image not found locally. Please check the image name and try again.`,
            pullError: pullError.message
          });
        }
        
        console.log(`Using existing local image: ${image}`);
      } catch (listError) {
        return res.status(500).json({ 
          error: `Failed to check local images: ${listError.message}` 
        });
      }
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
    
    // Create container configuration with the REQUESTED image (without bind mounts)
    const containerConfig = {
      Image: image, // Use the actual requested image
      name: name,
      Tty: true,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      OpenStdin: true,
      WorkingDir: `/workspace`,
      Cmd: ['/bin/bash'] // Keep container running
    };
    
    // Add port mapping if provided
    if (port) {
      containerConfig.ExposedPorts = {};
      containerConfig.ExposedPorts[`${port}/tcp`] = {};
      
      if (!containerConfig.HostConfig.PortBindings) {
        containerConfig.HostConfig.PortBindings = {};
      }
      containerConfig.HostConfig.PortBindings[`${port}/tcp`] = [{ HostPort: port.toString() }];
    }
    
    // Create the container with the requested image
    const container = await docker.createContainer(containerConfig);
    
    // Start the container
    await container.start();
    
    console.log(`Container ${name} created and started successfully with image: ${image}`);
    
    res.json({ 
      message: "Container created & started with requested image", 
      id: container.id,
      name: name,
      image: image, // Return the actual image used
      port: port,
      description: description,
      note: `Container successfully created with requested image: ${image}`
    });
  } catch (err) {
    console.error("Container creation error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/containers/:id/start", requireAuth, async (req, res) => {
  try {
    await docker.getContainer(req.params.id).start();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/containers/:id/stop", requireAuth, async (req, res) => {
  try {
    await docker.getContainer(req.params.id).stop();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ===== FILE MANAGER ENDPOINTS =====

// Helper function to validate and restrict paths to container folder
function validateContainerPath(requestedPath, containerName) {
  if (!containerName) {
    // If no container specified, use default folder
    const defaultPath = '/tmp/pterolite-files';
    if (!requestedPath || requestedPath === '/tmp/pterolite-files') {
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
  const containerFolder = `/tmp/pterolite-containers/${containerName}`;
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
    error: `Access denied: Path '${requestedPath}' is outside container folder '${containerFolder}'` 
  };
}

// List files in directory
app.get("/files", webPanelAuth, (req, res) => {
  const requestedPath = req.query.path;
  const containerName = req.query.container;
  
  // Validate and get safe path
  const pathValidation = validateContainerPath(requestedPath, containerName);
  if (!pathValidation.isValid) {
    return res.status(403).json({ error: pathValidation.error });
  }
  
  const dirPath = pathValidation.safePath;
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  
  try {
    const files = fs.readdirSync(dirPath).map(file => {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        path: filePath,
        isDirectory: stats.isDirectory(),
        size: stats.size,
        modified: stats.mtime
      };
    });
    
    // Add container info to response
    const response = { 
      files, 
      currentPath: dirPath,
      containerName: containerName || null,
      containerFolder: containerName ? `/tmp/pterolite-containers/${containerName}` : '/tmp/pterolite-files'
    };
    
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Read file content
app.get("/files/content", webPanelAuth, (req, res) => {
  const requestedPath = req.query.path;
  const containerName = req.query.container;
  
  if (!requestedPath) {
    return res.status(400).json({ error: "Path parameter required" });
  }
  
  // Validate path
  const pathValidation = validateContainerPath(requestedPath, containerName);
  if (!pathValidation.isValid) {
    return res.status(403).json({ error: pathValidation.error });
  }
  
  try {
    const content = fs.readFileSync(pathValidation.safePath, 'utf8');
    res.json({ content, path: pathValidation.safePath });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save file content
app.post("/files/save", webPanelAuth, (req, res) => {
  const { path: requestedPath, content, container: containerName } = req.body;
  
  if (!requestedPath || content === undefined) {
    return res.status(400).json({ error: "Path and content required" });
  }
  
  // Validate path
  const pathValidation = validateContainerPath(requestedPath, containerName);
  if (!pathValidation.isValid) {
    return res.status(403).json({ error: pathValidation.error });
  }
  
  const filePath = pathValidation.safePath;
  
  try {
    // Create directory if it doesn't exist
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    res.json({ success: true, message: "File saved successfully", path: filePath });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload file
app.post("/files/upload", webPanelAuth, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  
  const requestedPath = req.body.targetPath;
  const containerName = req.body.container;
  
  // Validate target path
  const pathValidation = validateContainerPath(requestedPath, containerName);
  if (!pathValidation.isValid) {
    // Clean up uploaded file
    try {
      fs.unlinkSync(req.file.path);
    } catch (e) {}
    return res.status(403).json({ error: pathValidation.error });
  }
  
  const targetPath = pathValidation.safePath;
  const finalPath = path.join(targetPath, req.file.originalname);
  
  // Validate final path as well
  const finalPathValidation = validateContainerPath(finalPath, containerName);
  if (!finalPathValidation.isValid) {
    // Clean up uploaded file
    try {
      fs.unlinkSync(req.file.path);
    } catch (e) {}
    return res.status(403).json({ error: finalPathValidation.error });
  }
  
  try {
    // Create target directory if it doesn't exist
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }
    
    // Move file to target location
    fs.renameSync(req.file.path, finalPathValidation.safePath);
    
    res.json({ 
      success: true, 
      message: "File uploaded successfully",
      path: finalPathValidation.safePath,
      filename: req.file.originalname
    });
  } catch (error) {
    // Clean up uploaded file on error
    try {
      fs.unlinkSync(req.file.path);
    } catch (e) {}
    res.status(500).json({ error: error.message });
  }
});

// Extract ZIP file
app.post("/files/extract", webPanelAuth, (req, res) => {
  const { zipPath: requestedZipPath, extractPath: requestedExtractPath, container: containerName } = req.body;
  
  if (!requestedZipPath || !requestedExtractPath) {
    return res.status(400).json({ error: "ZIP path and extract path required" });
  }
  
  // Validate both paths
  const zipPathValidation = validateContainerPath(requestedZipPath, containerName);
  const extractPathValidation = validateContainerPath(requestedExtractPath, containerName);
  
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
    if (!fs.existsSync(extractPath)) {
      fs.mkdirSync(extractPath, { recursive: true });
    }
    
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

// Delete file/directory
app.delete("/files", webPanelAuth, (req, res) => {
  const requestedPath = req.query.path;
  const containerName = req.query.container;
  
  if (!requestedPath) {
    return res.status(400).json({ error: "Path parameter required" });
  }
  
  // Validate path
  const pathValidation = validateContainerPath(requestedPath, containerName);
  if (!pathValidation.isValid) {
    return res.status(403).json({ error: pathValidation.error });
  }
  
  const filePath = pathValidation.safePath;
  
  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
      res.json({ success: true, message: "File/directory deleted successfully" });
    } else {
      res.status(404).json({ error: "File not found" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new directory
app.post("/files/mkdir", webPanelAuth, (req, res) => {
  const { path: requestedPath, name, container: containerName } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: "Directory name required" });
  }
  
  // Validate parent path
  const pathValidation = validateContainerPath(requestedPath, containerName);
  if (!pathValidation.isValid) {
    return res.status(403).json({ error: pathValidation.error });
  }
  
  const parentPath = pathValidation.safePath;
  const newDirPath = path.join(parentPath, name);
  
  // Validate new directory path
  const newDirValidation = validateContainerPath(newDirPath, containerName);
  if (!newDirValidation.isValid) {
    return res.status(403).json({ error: newDirValidation.error });
  }
  
  try {
    if (fs.existsSync(newDirValidation.safePath)) {
      return res.status(400).json({ error: "Directory already exists" });
    }
    
    fs.mkdirSync(newDirValidation.safePath, { recursive: true });
    res.json({ 
      success: true, 
      message: "Directory created successfully",
      path: newDirValidation.safePath
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== CONSOLE/TERMINAL ENDPOINTS =====

// Execute command (one-time execution)
app.post("/console/execute", webPanelAuth, (req, res) => {
  const { command, workingDir } = req.body;
  if (!command) {
    return res.status(400).json({ error: "Command required" });
  }
  
  const options = {
    cwd: workingDir || '/tmp/pterolite-files',
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

app.listen(8088, () => console.log("PteroLite API running on port 8088"));

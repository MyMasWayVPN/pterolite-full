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

// Middleware untuk web panel (tanpa auth requirement)
const webPanelAuth = (req, res, next) => {
  // Skip authentication untuk web panel
  next();
};

// ===== CONTAINER MANAGEMENT ENDPOINTS =====

// Endpoint untuk web panel (tanpa authentication)
app.get("/containers", webPanelAuth, async (req, res) => {
  const containers = await docker.listContainers({ all: true });
  res.json(containers);
});

app.post("/containers", webPanelAuth, async (req, res) => {
  try {
    const { name, image, cmd, port, description } = req.body;
    
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
    
    // First, try to pull the base image
    try {
      console.log(`Pulling base image: ${baseImage}`);
      const stream = await docker.pull(baseImage);
      
      // Wait for pull to complete
      await new Promise((resolve, reject) => {
        docker.modem.followProgress(stream, (err, res) => {
          if (err) reject(err);
          else resolve(res);
        });
      });
      
      console.log(`Base image ${baseImage} pulled successfully`);
    } catch (pullError) {
      console.log(`Pull failed for ${baseImage}:`, pullError.message);
      // Continue anyway - image might already exist locally
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
    
    // If the requested image is different from base image, 
    // prepare commands to install it inside the container
    let installCommands = [];
    
    if (!isCommonImage && image !== baseImage) {
      // Add commands to install Docker inside the container and pull the requested image
      installCommands = [
        'apt-get update',
        'apt-get install -y docker.io',
        'service docker start',
        `docker pull ${image}`,
        `echo "Image ${image} pulled successfully inside container"`
      ];
    }
    
    console.log(`Container ${name} created and started successfully`);
    
    res.json({ 
      message: "Container created & started", 
      id: container.id,
      name: name,
      baseImage: baseImage,
      requestedImage: image,
      port: port,
      description: description,
      installCommands: installCommands,
      note: !isCommonImage && image !== baseImage ? 
        `Container created with ${baseImage}. Run the provided install commands to get ${image}` : 
        `Container created with requested image ${image}`
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
    
    // First, try to pull the base image
    try {
      console.log(`Pulling base image: ${baseImage}`);
      const stream = await docker.pull(baseImage);
      
      // Wait for pull to complete
      await new Promise((resolve, reject) => {
        docker.modem.followProgress(stream, (err, res) => {
          if (err) reject(err);
          else resolve(res);
        });
      });
      
      console.log(`Base image ${baseImage} pulled successfully`);
    } catch (pullError) {
      console.log(`Pull failed for ${baseImage}:`, pullError.message);
      // Continue anyway - image might already exist locally
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
    
    // If the requested image is different from base image, 
    // prepare commands to install it inside the container
    let installCommands = [];
    
    if (!isCommonImage && image !== baseImage) {
      // Add commands to install Docker inside the container and pull the requested image
      installCommands = [
        'apt-get update',
        'apt-get install -y docker.io',
        'service docker start',
        `docker pull ${image}`,
        `echo "Image ${image} pulled successfully inside container"`
      ];
    }
    
    console.log(`Container ${name} created and started successfully`);
    
    res.json({ 
      message: "Container created & started", 
      id: container.id,
      name: name,
      baseImage: baseImage,
      requestedImage: image,
      port: port,
      description: description,
      installCommands: installCommands,
      note: !isCommonImage && image !== baseImage ? 
        `Container created with ${baseImage}. Run the provided install commands to get ${image}` : 
        `Container created with requested image ${image}`
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

// ===== PROCESS MANAGEMENT ENDPOINTS =====

// Get all running processes (optionally filtered by container)
app.get("/processes", webPanelAuth, (req, res) => {
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
app.get("/processes/:id/logs", webPanelAuth, (req, res) => {
  const { id } = req.params;
  const limit = parseInt(req.query.limit) || 100;
  const logs = processManager.getLogs(id, limit);
  res.json({ processId: id, logs });
});

// Kill process
app.post("/processes/:id/kill", webPanelAuth, (req, res) => {
  const { id } = req.params;
  const success = processManager.killProcess(id);
  if (success) {
    res.json({ success: true, message: "Process killed successfully" });
  } else {
    res.status(400).json({ error: "Failed to kill process or process not found" });
  }
});

// Remove process from list
app.delete("/processes/:id", webPanelAuth, (req, res) => {
  const { id } = req.params;
  processManager.removeProcess(id);
  res.json({ success: true, message: "Process removed from list" });
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

// ===== STARTUP COMMAND MANAGEMENT =====

// In-memory storage for startup commands (in production, use database)
const startupCommands = new Map();

// Get all startup commands
app.get("/startup-commands", webPanelAuth, (req, res) => {
  const commands = Array.from(startupCommands.values());
  res.json({ commands });
});

// Save startup command
app.post("/startup-commands", webPanelAuth, (req, res) => {
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
app.delete("/startup-commands/:id", webPanelAuth, (req, res) => {
  const { id } = req.params;
  
  if (startupCommands.has(id)) {
    startupCommands.delete(id);
    res.json({ success: true, message: "Startup command deleted successfully" });
  } else {
    res.status(404).json({ error: "Startup command not found" });
  }
});

// Run startup command
app.post("/startup-commands/:id/run", webPanelAuth, (req, res) => {
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

// ===== SCRIPT EXECUTOR ENDPOINTS =====

// Execute JavaScript (one-time)
app.post("/scripts/javascript", webPanelAuth, (req, res) => {
  const { code, workingDir } = req.body;
  if (!code) {
    return res.status(400).json({ error: "JavaScript code required" });
  }
  
  // Create temporary JS file
  const tempFile = path.join('/tmp', `pterolite-js-${Date.now()}.js`);
  
  try {
    fs.writeFileSync(tempFile, code);
    
    const options = {
      cwd: workingDir || '/tmp/pterolite-files',
      timeout: 30000
    };
    
    exec(`node ${tempFile}`, options, (error, stdout, stderr) => {
      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {}
      
      res.json({
        language: 'javascript',
        stdout: stdout || '',
        stderr: stderr || '',
        error: error ? error.message : null,
        exitCode: error ? error.code : 0
      });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Execute Python (one-time)
app.post("/scripts/python", webPanelAuth, (req, res) => {
  const { code, workingDir } = req.body;
  if (!code) {
    return res.status(400).json({ error: "Python code required" });
  }
  
  // Create temporary Python file
  const tempFile = path.join('/tmp', `pterolite-py-${Date.now()}.py`);
  
  try {
    fs.writeFileSync(tempFile, code);
    
    const options = {
      cwd: workingDir || '/tmp/pterolite-files',
      timeout: 30000
    };
    
    exec(`python3 ${tempFile}`, options, (error, stdout, stderr) => {
      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {}
      
      res.json({
        language: 'python',
        stdout: stdout || '',
        stderr: stderr || '',
        error: error ? error.message : null,
        exitCode: error ? error.code : 0
      });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Run JavaScript as persistent process
app.post("/scripts/javascript/run", webPanelAuth, (req, res) => {
  const { code, workingDir, name } = req.body;
  if (!code) {
    return res.status(400).json({ error: "JavaScript code required" });
  }
  
  const processId = uuidv4();
  const tempFile = path.join('/tmp', `pterolite-js-${processId}.js`);
  
  try {
    fs.writeFileSync(tempFile, code);
    
    const process = spawn('node', [tempFile], {
      cwd: workingDir || '/tmp/pterolite-files',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    const processInfo = {
      id: processId,
      name: name || `JavaScript Script`,
      language: 'javascript',
      file: tempFile,
      workingDir: workingDir || '/tmp/pterolite-files'
    };
    
    processManager.addProcess(processId, process, processInfo);
    processManager.addLog(processId, 'system', `JavaScript process started: ${name || 'Unnamed Script'}`);
    
    // Clean up temp file when process ends
    process.on('close', () => {
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {}
    });
    
    res.json({
      success: true,
      processId,
      message: "JavaScript process started successfully"
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Run Python as persistent process
app.post("/scripts/python/run", webPanelAuth, (req, res) => {
  const { code, workingDir, name } = req.body;
  if (!code) {
    return res.status(400).json({ error: "Python code required" });
  }
  
  const processId = uuidv4();
  const tempFile = path.join('/tmp', `pterolite-py-${processId}.py`);
  
  try {
    fs.writeFileSync(tempFile, code);
    
    const process = spawn('python3', [tempFile], {
      cwd: workingDir || '/tmp/pterolite-files',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    const processInfo = {
      id: processId,
      name: name || `Python Script`,
      language: 'python',
      file: tempFile,
      workingDir: workingDir || '/tmp/pterolite-files'
    };
    
    processManager.addProcess(processId, process, processInfo);
    processManager.addLog(processId, 'system', `Python process started: ${name || 'Unnamed Script'}`);
    
    // Clean up temp file when process ends
    process.on('close', () => {
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {}
    });
    
    res.json({
      success: true,
      processId,
      message: "Python process started successfully"
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Run command as persistent process
app.post("/console/run", webPanelAuth, (req, res) => {
  const { command, workingDir, name, containerId } = req.body;
  if (!command) {
    return res.status(400).json({ error: "Command required" });
  }
  
  const processId = uuidv4();
  
  try {
    const process = spawn('bash', ['-c', command], {
      cwd: workingDir || '/tmp/pterolite-files',
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true // Create a new process group
    });
    
    const processInfo = {
      id: processId,
      name: name || `Command: ${command.substring(0, 50)}`,
      type: 'command',
      command: command,
      workingDir: workingDir || '/tmp/pterolite-files',
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

// ===== DOCKER IMAGE MANAGEMENT ENDPOINTS =====

// Get available Docker images on system
app.get("/docker/images", webPanelAuth, async (req, res) => {
  try {
    const images = await docker.listImages();
    const formattedImages = images.map(image => ({
      id: image.Id,
      repoTags: image.RepoTags || ['<none>:<none>'],
      created: new Date(image.Created * 1000),
      size: image.Size,
      virtualSize: image.VirtualSize
    }));
    res.json(formattedImages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Execute Docker command (for image management)
app.post("/docker/execute", webPanelAuth, (req, res) => {
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

app.listen(8088, () => console.log("PteroLite API running on port 8088"));

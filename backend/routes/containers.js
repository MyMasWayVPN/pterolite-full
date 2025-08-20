const express = require("express");
const dockerService = require("../services/dockerService");
const userService = require("../services/userService");
const { authenticateToken, checkContainerOwnership } = require("../middleware/auth");

const router = express.Router();

// Get servers (filtered by user)
router.get("/", authenticateToken, async (req, res) => {
  try {
    const allContainers = await dockerService.listContainers();
    const user = userService.getUser(req.user.username);
    
    let userContainers;
    if (req.user.role === 'admin') {
      // Admin can see all servers
      userContainers = allContainers;
    } else {
      // Regular users can only see their own servers
      userContainers = allContainers.filter(container => 
        user.containers.includes(container.Id)
      );
    }
    
    res.json(userContainers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create server (with user ownership and limits)
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { name, image, cmd, port, description } = req.body;
    const user = userService.getUser(req.user.username);
    
    // Check server limit for regular users
    if (req.user.role === 'user' && user.containers.length >= 1) {
      return res.status(403).json({ 
        error: "Server limit reached. Regular users can only create 1 server." 
      });
    }
    
    // Use a base image that's more likely to exist (ubuntu or alpine)
    let baseImage = 'ubuntu:latest';
    
    if (dockerService.isCommonImage(image)) {
      baseImage = image;
    }
    
    // First, try to pull the base image
    try {
      console.log(`Pulling base image: ${baseImage}`);
      await dockerService.pullImage(baseImage);
      console.log(`Base image ${baseImage} pulled successfully`);
    } catch (pullError) {
      console.log(`Pull failed for ${baseImage}:`, pullError.message);
      // Continue anyway - image might already exist locally
    }
    
    // Create server folder on host system
    dockerService.createServerFolder(name);
    
    // Create container configuration
    const containerConfig = dockerService.createServerConfig(name, baseImage, port);
    
    // Create the container
    const container = await dockerService.createContainer(containerConfig);
    
    // Start the container
    await dockerService.startContainer(container.id);
    
    // Add container to user's container list
    userService.addContainerToUser(req.user.username, container.id);
    
    // Get install commands if needed
    const installCommands = dockerService.getInstallCommands(image, baseImage);
    
    console.log(`Server ${name} created and started successfully for user ${req.user.username}`);
    
    res.json({ 
      message: "Server created & started", 
      id: container.id,
      name: name,
      baseImage: baseImage,
      requestedImage: image,
      port: port,
      description: description,
      owner: req.user.username,
      installCommands: installCommands,
      note: installCommands.length > 0 ? 
        `Server created with ${baseImage}. Run the provided install commands to get ${image}` : 
        `Server created with requested image ${image}`
    });
  } catch (err) {
    console.error("Server creation error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Start server
router.post("/:id/start", authenticateToken, checkContainerOwnership, async (req, res) => {
  try {
    await dockerService.startContainer(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Stop server
router.post("/:id/stop", authenticateToken, checkContainerOwnership, async (req, res) => {
  try {
    await dockerService.stopContainer(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Delete server
router.delete("/:id", authenticateToken, checkContainerOwnership, async (req, res) => {
  try {
    // Get container info before deletion
    let containerName = null;
    try {
      const containerInfo = await dockerService.inspectContainer(req.params.id);
      containerName = containerInfo.Name.replace('/', '');
    } catch (inspectError) {
      console.warn('Could not inspect container before deletion:', inspectError.message);
    }
    
    // Remove the container
    await dockerService.removeContainer(req.params.id);
    
    // Remove container from user's list
    userService.removeContainerFromUser(req.user.username, req.params.id);
    
    let folderRemovalResult = null;
    
    // Remove server folder if it exists
    if (containerName) {
      folderRemovalResult = dockerService.removeServerFolder(containerName);
      if (folderRemovalResult.success) {
        console.log(`Server folder removed: ${containerName}`);
      } else {
        console.error('Failed to remove server folder:', folderRemovalResult.message);
      }
    }
    
    const response = { 
      ok: true, 
      message: "Server deleted successfully"
    };
    
    if (folderRemovalResult) {
      response.folderRemoval = folderRemovalResult;
    }
    
    res.json(response);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;

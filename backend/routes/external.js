const express = require("express");
const { exec } = require("child_process");
const dockerService = require("../services/dockerService");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// External API endpoints for programmatic access (with API key authentication)

// Get all containers (external API)
router.get("/containers", requireAuth, async (req, res) => {
  try {
    const containers = await dockerService.listContainers();
    res.json(containers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create container (external API)
router.post("/containers", requireAuth, async (req, res) => {
  try {
    const { name, image, cmd, port, description } = req.body;
    
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
    
    // Get install commands if needed
    const installCommands = dockerService.getInstallCommands(image, baseImage);
    
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
      note: installCommands.length > 0 ? 
        `Container created with ${baseImage}. Run the provided install commands to get ${image}` : 
        `Container created with requested image ${image}`
    });
  } catch (err) {
    console.error("Container creation error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Start container (external API)
router.post("/containers/:id/start", requireAuth, async (req, res) => {
  try {
    await dockerService.startContainer(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Stop container (external API)
router.post("/containers/:id/stop", requireAuth, async (req, res) => {
  try {
    await dockerService.stopContainer(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;

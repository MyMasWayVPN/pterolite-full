const Docker = require("dockerode");
const fs = require("fs");
const config = require("../config");

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

// Get all containers
const listContainers = async (options = { all: true }) => {
  return await docker.listContainers(options);
};

// Get container by ID
const getContainer = (id) => {
  return docker.getContainer(id);
};

// Create container with configuration
const createContainer = async (containerConfig) => {
  return await docker.createContainer(containerConfig);
};

// Pull Docker image
const pullImage = async (imageName) => {
  const stream = await docker.pull(imageName);
  
  return new Promise((resolve, reject) => {
    docker.modem.followProgress(stream, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
};

// Create server configuration
const createServerConfig = (name, image, port) => {
  const containerConfig = {
    Image: image,
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
  
  return containerConfig;
};

// Create server folder
const createServerFolder = (name) => {
  const containerFolder = `${config.CONTAINER_DIR}/${name}`;
  try {
    if (!fs.existsSync(containerFolder)) {
      fs.mkdirSync(containerFolder, { recursive: true });
      console.log(`Created server folder: ${containerFolder}`);
    }
    return containerFolder;
  } catch (folderError) {
    console.warn(`Failed to create server folder: ${folderError.message}`);
    throw folderError;
  }
};

// Check if image is common/base image
const isCommonImage = (image) => {
  const commonImages = [
    'ubuntu', 'alpine', 'debian', 'centos', 'node', 'python', 'nginx'
  ];
  
  return commonImages.some(common => 
    image.toLowerCase().includes(common.split(':')[0])
  );
};

// Get install commands for non-common images
const getInstallCommands = (requestedImage, baseImage) => {
  if (isCommonImage(requestedImage) || requestedImage === baseImage) {
    return [];
  }
  
  return [
    'apt-get update',
    'apt-get install -y docker.io',
    'service docker start',
    `docker pull ${requestedImage}`,
    `echo "Image ${requestedImage} pulled successfully inside container"`
  ];
};

// Start container
const startContainer = async (id) => {
  const container = getContainer(id);
  return await container.start();
};

// Stop container
const stopContainer = async (id) => {
  const container = getContainer(id);
  return await container.stop();
};

// Remove container
const removeContainer = async (id) => {
  const container = getContainer(id);
  
  // Stop container first if it's running
  try {
    await container.stop();
  } catch (stopError) {
    // Container might already be stopped, continue with removal
  }
  
  return await container.remove();
};

// Get container info
const inspectContainer = async (id) => {
  const container = getContainer(id);
  return await container.inspect();
};

// Remove server folder
const removeServerFolder = (containerName) => {
  const containerFolder = `${config.CONTAINER_DIR}/${containerName}`;
  try {
    if (fs.existsSync(containerFolder)) {
      fs.rmSync(containerFolder, { recursive: true, force: true });
      return { success: true, message: `Server folder ${containerFolder} removed successfully` };
    } else {
      return { success: false, message: `Server folder ${containerFolder} not found` };
    }
  } catch (folderError) {
    return { 
      success: false, 
      message: `Failed to remove server folder ${containerFolder}: ${folderError.message}` 
    };
  }
};

// List Docker images
const listImages = async () => {
  const images = await docker.listImages();
  return images.map(image => ({
    id: image.Id,
    repoTags: image.RepoTags || ['<none>:<none>'],
    created: new Date(image.Created * 1000),
    size: image.Size,
    virtualSize: image.VirtualSize
  }));
};

module.exports = {
  docker,
  listContainers,
  getContainer,
  createContainer,
  pullImage,
  createServerConfig,
  createServerFolder,
  isCommonImage,
  getInstallCommands,
  startContainer,
  stopContainer,
  removeContainer,
  inspectContainer,
  removeServerFolder,
  listImages
};

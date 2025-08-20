import React, { useState, useEffect } from 'react';
import { executeDockerCommand, getDockerImages } from './api';

const DockerImageManager = ({ selectedContainer, containerFolder }) => {
  const [currentImage, setCurrentImage] = useState('');
  const [availableImages, setAvailableImages] = useState([]);
  const [selectedImage, setSelectedImage] = useState('');
  const [customImage, setCustomImage] = useState('');
  const [isChanging, setIsChanging] = useState(false);
  const [output, setOutput] = useState([]);
  const [useCustomImage, setUseCustomImage] = useState(false);

  const predefinedImages = [
    { value: 'docker.io/bionicc/nodejs-wabot:latest', label: '🟢 Stable (Recommended)', description: 'Stable Node.js runtime with WhatsApp Bot support' },
    { value: 'docker.io/bionicc/nodejs-wabot:alpine', label: '🏔️ Node.js LTS (Alpine Linux)', description: 'Lightweight Alpine Linux with Node.js LTS' },
    { value: 'docker.io/bionicc/nodejs-wabot:kali', label: '🐉 Node.js LTS (Kali Linux)', description: 'Kali Linux with Node.js LTS' },
    { value: 'docker.io/bionicc/nodejs-wabot:23', label: '🚀 Node.js 23', description: 'Latest Node.js 23' },
    { value: 'docker.io/bionicc/nodejs-wabot:22', label: '⚡ Node.js 22', description: 'Node.js 22' },
    { value: 'docker.io/bionicc/nodejs-wabot:22-ubuntu', label: '🐧 Node.js 22 (Ubuntu)', description: 'Node.js 22 on Ubuntu' },
    { value: 'docker.io/bionicc/nodejs-wabot:21', label: '🔥 Node.js 21', description: 'Node.js 21' },
    { value: 'docker.io/bionicc/nodejs-wabot:20', label: '💎 Node.js 20', description: 'Node.js 20 LT' },
    { value: 'docker.io/bionicc/nodejs-wabot:20-ubuntu', label: '🌟 Node.js 20 (Ubuntu)', description: 'Node.js 20 LTS on Ubuntu' },
    { value: 'docker.io/bionicc/nodejs-wabot:19', label: '⭐ Node.js 19', description: 'Node.js 19' },
    { value: 'docker.io/bionicc/nodejs-wabot:18', label: '✨ Node.js 18', description: 'Node.js 18 LTS' },
    { value: 'docker.io/bionicc/nodejs-wabot:18-ubuntu', label: '🎯 Node.js 18 (Ubuntu)', description: 'Node.js 18 LTS on Ubuntu' },
    { value: 'docker.io/bionicc/nodejs-wabot:17', label: '🎪 Node.js 17', description: 'Node.js 17' },
    { value: 'docker.io/bionicc/nodejs-wabot:16', label: '🎨 Node.js 16', description: 'Node.js 16 LTS' }
  ];

  useEffect(() => {
    if (selectedContainer) {
      setCurrentImage(selectedContainer.Image);
      loadAvailableImages();
    }
  }, [selectedContainer]);

  const loadAvailableImages = async () => {
    try {
      const result = await executeDockerCommand('docker images --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"');
      if (result.stdout) {
        const lines = result.stdout.split('\n').slice(1); // Skip header
        const images = lines
          .filter(line => line.trim() && !line.includes('REPOSITORY'))
          .map(line => {
            const parts = line.split('\t');
            return {
              name: parts[0]?.trim(),
              size: parts[1]?.trim(),
              created: parts[2]?.trim()
            };
          })
          .filter(img => img.name && img.name !== '<none>:<none>');
        setAvailableImages(images);
      }
    } catch (error) {
      console.error('Failed to load available images:', error);
    }
  };

  const addOutput = (type, message, command = null) => {
    const newOutput = {
      id: Date.now(),
      type,
      message,
      command,
      timestamp: new Date().toLocaleTimeString()
    };
    setOutput(prev => [...prev, newOutput]);
  };

  const handleChangeImage = async () => {
    if (isChanging) return;
    
    const targetImage = useCustomImage ? customImage : selectedImage;
    if (!targetImage) {
      addOutput('error', 'Please select or enter a Docker image');
      return;
    }

    setIsChanging(true);
    addOutput('info', `Starting Docker image change process...`);
    addOutput('info', `Current image: ${currentImage}`);
    addOutput('info', `Target image: ${targetImage}`);

    try {
      // Step 1: Stop the container
      addOutput('info', 'Step 1: Stopping container...');
      const stopResult = await executeDockerCommand(`docker stop ${selectedContainer.Id}`);
      if (stopResult.error) {
        addOutput('error', `Failed to stop container: ${stopResult.error}`);
        return;
      }
      addOutput('success', 'Container stopped successfully');

      // Step 2: Remove old image (if it's not being used by other containers)
      addOutput('info', 'Step 2: Checking if old image can be removed...');
      const imageUsageResult = await executeDockerCommand(`docker ps -a --filter ancestor=${currentImage} --format "{{.ID}}"`);
      const containersUsingImage = imageUsageResult.stdout?.trim().split('\n').filter(id => id.trim()).length || 0;
      
      if (containersUsingImage <= 1) {
        addOutput('info', 'Removing old image...');
        const removeResult = await executeDockerCommand(`docker rmi ${currentImage}`);
        if (removeResult.error && !removeResult.error.includes('image is being used')) {
          addOutput('warning', `Could not remove old image: ${removeResult.error}`);
        } else {
          addOutput('success', 'Old image removed successfully');
        }
      } else {
        addOutput('info', `Old image is being used by ${containersUsingImage} containers, skipping removal`);
      }

      // Step 3: Pull new image
      addOutput('info', 'Step 3: Pulling new image...');
      const pullResult = await executeDockerCommand(`docker pull ${targetImage}`);
      if (pullResult.error) {
        addOutput('error', `Failed to pull new image: ${pullResult.error}`);
        // Try to restart with old image
        addOutput('info', 'Attempting to restart with original image...');
        await executeDockerCommand(`docker start ${selectedContainer.Id}`);
        return;
      }
      addOutput('success', `New image ${targetImage} pulled successfully`);

      // Step 4: Create new container with same configuration
      addOutput('info', 'Step 4: Creating new container with new image...');
      
      // Get container configuration
      const inspectResult = await executeDockerCommand(`docker inspect ${selectedContainer.Id}`);
      let containerConfig = {};
      
      try {
        const inspectData = JSON.parse(inspectResult.stdout);
        const container = inspectData[0];
        containerConfig = {
          name: container.Name.replace('/', ''),
          workingDir: container.Config.WorkingDir || containerFolder,
          env: container.Config.Env || [],
          ports: container.NetworkSettings.Ports || {},
          volumes: container.Mounts || []
        };
      } catch (parseError) {
        addOutput('warning', 'Could not parse container configuration, using defaults');
        containerConfig = {
          name: selectedContainer.Names[0].replace('/', ''),
          workingDir: containerFolder
        };
      }

      // Remove old container
      const removeContainerResult = await executeDockerCommand(`docker rm ${selectedContainer.Id}`);
      if (removeContainerResult.error) {
        addOutput('error', `Failed to remove old container: ${removeContainerResult.error}`);
        return;
      }
      addOutput('success', 'Old container removed');

      // Create new container
      let createCommand = `docker create --name ${containerConfig.name} -it`;
      
      // Add working directory
      if (containerConfig.workingDir) {
        createCommand += ` -w ${containerConfig.workingDir}`;
      }
      
      // Add port mappings
      Object.keys(containerConfig.ports).forEach(port => {
        if (containerConfig.ports[port] && containerConfig.ports[port].length > 0) {
          const hostPort = containerConfig.ports[port][0].HostPort;
          createCommand += ` -p ${hostPort}:${port.split('/')[0]}`;
        }
      });
      
      // Add volume mounts
      containerConfig.volumes.forEach(volume => {
        if (volume.Source && volume.Destination) {
          createCommand += ` -v ${volume.Source}:${volume.Destination}`;
        }
      });
      
      createCommand += ` ${targetImage} /bin/bash`;
      
      const createResult = await executeDockerCommand(createCommand);
      if (createResult.error) {
        addOutput('error', `Failed to create new container: ${createResult.error}`);
        return;
      }
      addOutput('success', 'New container created successfully');

      // Step 5: Start new container
      addOutput('info', 'Step 5: Starting new container...');
      const startResult = await executeDockerCommand(`docker start ${containerConfig.name}`);
      if (startResult.error) {
        addOutput('error', `Failed to start new container: ${startResult.error}`);
        return;
      }
      addOutput('success', 'New container started successfully');

      // Update current image
      setCurrentImage(targetImage);
      addOutput('success', `✅ Docker image successfully changed from ${currentImage} to ${targetImage}`);
      addOutput('info', 'Please refresh the container list to see the updated container');

      // Refresh available images
      loadAvailableImages();

    } catch (error) {
      addOutput('error', `Unexpected error: ${error.message}`);
    } finally {
      setIsChanging(false);
    }
  };

  const handleDeleteImage = async (imageName) => {
    const confirmDelete = confirm(`Are you sure you want to delete Docker image "${imageName}"?\n\n⚠️ Warning: This action cannot be undone. Make sure no containers are using this image.`);
    
    if (!confirmDelete) return;

    addOutput('info', `Starting deletion of Docker image: ${imageName}`);
    
    try {
      // Check if any containers are using this image
      addOutput('info', 'Checking if image is being used by containers...');
      const usageResult = await executeDockerCommand(`docker ps -a --filter ancestor=${imageName} --format "{{.Names}}"`);
      
      if (usageResult.stdout && usageResult.stdout.trim()) {
        const containersUsingImage = usageResult.stdout.trim().split('\n').filter(name => name.trim());
        addOutput('warning', `Image is being used by containers: ${containersUsingImage.join(', ')}`);
        
        const forceDelete = confirm(`Image "${imageName}" is being used by ${containersUsingImage.length} container(s):\n${containersUsingImage.join(', ')}\n\nDo you want to force delete the image anyway?\n\n⚠️ This may cause issues with those containers.`);
        
        if (!forceDelete) {
          addOutput('info', 'Image deletion cancelled by user');
          return;
        }
      }

      // Delete the image
      addOutput('info', 'Deleting Docker image...');
      const deleteResult = await executeDockerCommand(`docker rmi ${imageName}`);
      
      if (deleteResult.error) {
        // Try force delete if normal delete fails
        addOutput('warning', `Normal delete failed: ${deleteResult.error}`);
        addOutput('info', 'Attempting force delete...');
        
        const forceDeleteResult = await executeDockerCommand(`docker rmi -f ${imageName}`);
        
        if (forceDeleteResult.error) {
          addOutput('error', `Force delete failed: ${forceDeleteResult.error}`);
          return;
        } else {
          addOutput('success', `✅ Docker image "${imageName}" force deleted successfully`);
        }
      } else {
        addOutput('success', `✅ Docker image "${imageName}" deleted successfully`);
      }

      // Refresh the available images list
      loadAvailableImages();
      
    } catch (error) {
      addOutput('error', `Unexpected error while deleting image: ${error.message}`);
    }
  };

  const clearOutput = () => {
    setOutput([]);
  };

  if (!selectedContainer) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="text-center py-12">
          <div className="text-6xl text-gray-300 mb-4">🐳</div>
          <h3 className="text-xl font-semibold text-gray-700 mb-2">No Container Selected</h3>
          <p className="text-gray-500">Please select a container to manage Docker images</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">🐳 Docker Image Manager</h2>
        <p className="text-gray-600">Change Docker image for container: <strong>{selectedContainer.Names[0].replace('/', '')}</strong></p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Image Selection Section */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">Current Image</h3>
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center">
                <span className="text-2xl mr-3">🏷️</span>
                <div>
                  <p className="font-medium text-blue-900">{currentImage}</p>
                  <p className="text-sm text-blue-700">Container: {selectedContainer.Names[0].replace('/', '')}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">Select New Image</h3>
            
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={!useCustomImage}
                    onChange={() => setUseCustomImage(false)}
                    className="mr-2"
                  />
                  <span>Choose from predefined images</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={useCustomImage}
                    onChange={() => setUseCustomImage(true)}
                    className="mr-2"
                  />
                  <span>Enter custom image</span>
                </label>
              </div>

              {!useCustomImage ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Predefined Images</label>
                  <select
                    value={selectedImage}
                    onChange={(e) => setSelectedImage(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select an image...</option>
                    {predefinedImages.map((image) => (
                      <option key={image.value} value={image.value}>
                        {image.label} - {image.description}
                      </option>
                    ))}
                  </select>
                  {selectedImage && (
                    <p className="text-sm text-gray-600 mt-2">
                      Selected: <code className="bg-gray-100 px-2 py-1 rounded">{selectedImage}</code>
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Custom Docker Image</label>
                  <input
                    type="text"
                    value={customImage}
                    onChange={(e) => setCustomImage(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., nginx:alpine, python:3.11-slim, node:18-alpine"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Enter any valid Docker image name from Docker Hub or other registries
                  </p>
                </div>
              )}

              <div className="flex space-x-3">
                <button
                  onClick={handleChangeImage}
                  disabled={isChanging || (!selectedImage && !customImage)}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isChanging ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Changing Image...
                    </div>
                  ) : (
                    'Change Docker Image'
                  )}
                </button>
                <button
                  onClick={loadAvailableImages}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>

          {/* Available Images */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">Available Images on System</h3>
            <div className="max-h-64 overflow-y-auto">
              {availableImages.length === 0 ? (
                <p className="text-gray-500 text-sm">No images found. Click refresh to load available images.</p>
              ) : (
                <div className="space-y-2">
                  {availableImages.map((image, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border border-gray-200 rounded-md">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{image.name}</p>
                        <p className="text-xs text-gray-500">Size: {image.size} | Created: {image.created}</p>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => {
                            setUseCustomImage(true);
                            setCustomImage(image.name);
                          }}
                          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Use
                        </button>
                        <button
                          onClick={() => handleDeleteImage(image.name)}
                          className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                          title="Delete this Docker image"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Output Section */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Process Output</h3>
            <button
              onClick={clearOutput}
              className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Clear
            </button>
          </div>
          
          <div className="bg-black text-green-400 p-4 rounded-md h-96 overflow-y-auto font-mono text-sm">
            {output.length === 0 ? (
              <div className="text-gray-500 text-center py-12">
                <div className="text-4xl mb-4">🔄</div>
                <p>No process output yet</p>
                <p className="text-sm mt-2">Start changing Docker image to see process logs</p>
              </div>
            ) : (
              output.map((item) => (
                <div key={item.id} className="mb-2">
                  <div className="text-gray-400 text-xs mb-1">
                    [{item.timestamp}] {item.type.toUpperCase()}
                  </div>
                  {item.command && (
                    <div className="text-blue-400 mb-1">$ {item.command}</div>
                  )}
                  <div className={`whitespace-pre-wrap ${
                    item.type === 'error' ? 'text-red-400' :
                    item.type === 'success' ? 'text-green-400' :
                    item.type === 'warning' ? 'text-yellow-400' :
                    'text-white'
                  }`}>
                    {item.message}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Warning Section */}
      <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start">
          <span className="text-yellow-600 text-xl mr-3">⚠️</span>
          <div>
            <h4 className="font-medium text-yellow-800 mb-2">Important Notes:</h4>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>• This process will stop the current container and create a new one with the selected image</li>
              <li>• All running processes inside the container will be terminated</li>
              <li>• Container data in volumes will be preserved, but data in the container filesystem may be lost</li>
              <li>• The old Docker image will be removed if not used by other containers</li>
              <li>• Make sure to backup important data before changing the image</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DockerImageManager;

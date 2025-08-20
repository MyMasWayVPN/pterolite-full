import React, { useState, useEffect } from 'react';
import { getContainers, startContainer, stopContainer, deleteContainer } from './api';

const ContainerSelector = ({ onContainerSelect, selectedContainer }) => {
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    image: 'docker.io/bionicc/nodejs-wabot:latest',
    port: '',
    description: ''
  });

  useEffect(() => {
    loadContainers();
  }, []);

  const loadContainers = async () => {
    setLoading(true);
    try {
      const containerList = await getContainers();
      setContainers(containerList);
      
      // Auto-select first container if none selected
      if (!selectedContainer && containerList.length > 0) {
        onContainerSelect(containerList[0]);
      }
    } catch (error) {
      console.error('Failed to load containers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateContainer = async () => {
    if (isCreating) return; // Prevent double creation
    
    setIsCreating(true);
    try {
      // Check if container name already exists
      const existingContainer = containers.find(c => 
        c.Names?.[0]?.replace('/', '') === createForm.name
      );
      
      if (existingContainer) {
        alert(`Container with name "${createForm.name}" already exists. Please choose a different name.`);
        return;
      }

      // Create container using Docker API
      const response = await fetch('/api/containers', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-API-Key': 'supersecretkey'
        },
        body: JSON.stringify({
          name: createForm.name,
          image: createForm.image,
          port: createForm.port,
          description: createForm.description
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Container creation result:', result);
        
        loadContainers();
        setShowCreateForm(false);
        setCreateForm({
          name: '',
          image: 'docker.io/bionicc/nodejs-wabot:latest',
          port: '3000',
          description: ''
        });

        // Show success message with install commands if needed
        let message = `Container "${createForm.name}" created successfully!`;
        
        if (result.installCommands && result.installCommands.length > 0) {
          message += `\n\n📝 ${result.note}\n\n🔧 To install the requested image, run these commands in the Console:\n\n`;
          message += result.installCommands.map(cmd => `• ${cmd}`).join('\n');
          message += `\n\n💡 After running these commands, your container will have the requested image available.`;
        }
        
        alert(message);
      } else {
        const error = await response.json();
        alert(`Failed to create container: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to create container:', error);
      alert(`Failed to create container: ${error.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleContainerAction = async (containerId, action) => {
    try {
      switch (action) {
        case 'start':
          await startContainer(containerId);
          break;
        case 'stop':
          await stopContainer(containerId);
          break;
        case 'restart':
          await stopContainer(containerId);
          setTimeout(() => startContainer(containerId), 2000);
          break;
        case 'delete':
          const confirmDelete = confirm('Are you sure you want to delete this container? This action cannot be undone.');
          if (confirmDelete) {
            const removeImage = confirm('Do you also want to remove the Docker image used by this container?\n\n⚠️ Warning: The image will only be removed if no other containers are using it.');
            try {
              const result = await deleteContainer(containerId, removeImage);
              
              // Show result message
              let message = result.message;
              
              if (result.folderRemoval) {
                message += `\n\nFolder removal: ${result.folderRemoval.message}`;
              }
              
              if (result.imageRemoval) {
                message += `\n\nImage removal: ${result.imageRemoval.message}`;
              }
              
              alert(message);
              
              // If deleted container was selected, clear selection
              if (selectedContainer?.Id === containerId) {
                onContainerSelect(null);
              }
            } catch (error) {
              alert(`Failed to delete container: ${error.message}`);
              return; // Don't reload containers if deletion failed
            }
          }
          break;
      }
      loadContainers();
    } catch (error) {
      console.error(`Failed to ${action} container:`, error);
      alert(`Failed to ${action} container: ${error.message}`);
    }
  };

  const getContainerStatusColor = (state) => {
    return state === 'running' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-800 border-red-200';
  };

  const getContainerFolder = (container) => {
    const containerName = container.Names?.[0]?.replace('/', '') || container.Id.substring(0, 12);
    return `/tmp/pterolite-containers/${containerName}`;
  };

  const imageOptions = [
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

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-primary flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading containers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-primary">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">🐳 PteroLite Container Manager</h1>
          <p className="text-gray-300 text-lg">Select or create a container to get started</p>
        </div>

        {/* Selected Container Info */}
        {selectedContainer && (
          <div className="bg-blue-900 bg-opacity-30 border border-blue-700 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-blue-300">
                  📁 Current Container: {selectedContainer.Names?.[0]?.replace('/', '') || 'Unnamed'}
                </h3>
                <p className="text-blue-200">
                  <span className="font-medium">Image:</span> {selectedContainer.Image} | 
                  <span className="font-medium ml-2">Folder:</span> <code className="bg-blue-800 bg-opacity-50 px-2 py-1 rounded text-blue-300">{getContainerFolder(selectedContainer)}</code>
                </p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getContainerStatusColor(selectedContainer.State)}`}>
                {selectedContainer.State}
              </span>
            </div>
          </div>
        )}

        {/* Container Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {containers.map((container) => {
            const isSelected = selectedContainer?.Id === container.Id;
            return (
              <div
                key={container.Id}
                className={`bg-dark-secondary rounded-lg shadow-dark p-6 cursor-pointer transition-all duration-200 hover:shadow-lg ${
                  isSelected ? 'ring-2 ring-blue-500 border-blue-500' : 'border border-dark hover:border-blue-600'
                }`}
                onClick={() => onContainerSelect(container)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-1">
                      {container.Names?.[0]?.replace('/', '') || 'Unnamed Container'}
                    </h3>
                    <p className="text-sm text-gray-300 mb-2">{container.Image}</p>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getContainerStatusColor(container.State)}`}>
                      {container.State}
                    </span>
                  </div>
                  {isSelected && (
                    <div className="text-blue-400">
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>

                <div className="text-sm text-gray-400 mb-4">
                  <p><span className="font-medium">Folder:</span> {getContainerFolder(container)}</p>
                  <p><span className="font-medium">ID:</span> {container.Id.substring(0, 12)}</p>
                </div>

                <div className="space-y-2">
                  <div className="flex space-x-2">
                    {container.State === 'running' ? (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleContainerAction(container.Id, 'restart');
                          }}
                          className="flex-1 px-3 py-2 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors"
                        >
                          Restart
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleContainerAction(container.Id, 'stop');
                          }}
                          className="flex-1 px-3 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                        >
                          Stop
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleContainerAction(container.Id, 'start');
                        }}
                        className="flex-1 px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                      >
                        Start
                      </button>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleContainerAction(container.Id, 'delete');
                    }}
                    className="w-full px-3 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            );
          })}

          {/* Create New Container Card */}
          <div
            className="bg-dark-secondary rounded-lg shadow-dark p-6 cursor-pointer transition-all duration-200 hover:shadow-lg border-2 border-dashed border-gray-600 hover:border-blue-400"
            onClick={() => setShowCreateForm(true)}
          >
            <div className="text-center">
              <div className="text-4xl text-gray-400 mb-4">➕</div>
              <h3 className="text-lg font-semibold text-gray-300 mb-2">Create New Container</h3>
              <p className="text-sm text-gray-400">Click to create a new container with custom configuration</p>
            </div>
          </div>
        </div>

        {/* No Containers Message */}
        {containers.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl text-gray-400 mb-4">🐳</div>
            <h3 className="text-xl font-semibold text-white mb-2">No Containers Found</h3>
            <p className="text-gray-400 mb-6">Create your first container to get started with PteroLite</p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
            >
              Create First Container
            </button>
          </div>
        )}

        {/* Action Buttons */}
        {selectedContainer && (
          <div className="text-center">
            <button
              onClick={() => {
                // Hide container selector and proceed to main app
                window.dispatchEvent(new CustomEvent('containerSelected', { detail: selectedContainer }));
              }}
              className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-lg"
            >
              Continue with Selected Container →
            </button>
          </div>
        )}

        {/* Create Container Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-dark-secondary rounded-lg p-6 w-full max-w-md mx-4 border border-dark">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-white">Create New Container</h3>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="text-gray-400 hover:text-gray-200 transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Container Name</label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({...createForm, name: e.target.value})}
                    className="w-full px-3 py-2 bg-dark-tertiary border border-dark text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., my-web-app"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Docker Image</label>
                  <select
                    value={createForm.image}
                    onChange={(e) => setCreateForm({...createForm, image: e.target.value})}
                    className="w-full px-3 py-2 bg-dark-tertiary border border-dark text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {imageOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    {imageOptions.find(opt => opt.value === createForm.image)?.description}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Port</label>
                  <input
                    type="text"
                    value={createForm.port}
                    onChange={(e) => setCreateForm({...createForm, port: e.target.value})}
                    className="w-full px-3 py-2 bg-dark-tertiary border border-dark text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="3000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Description (Optional)</label>
                  <input
                    type="text"
                    value={createForm.description}
                    onChange={(e) => setCreateForm({...createForm, description: e.target.value})}
                    className="w-full px-3 py-2 bg-dark-tertiary border border-dark text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Brief description of this container"
                  />
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 rounded-md hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateContainer}
                  disabled={!createForm.name || !createForm.image || !createForm.port || isCreating}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isCreating ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Creating...
                    </div>
                  ) : (
                    'Create Container'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Help Section */}
        <div className="mt-12 bg-blue-900 bg-opacity-30 border border-blue-700 rounded-lg p-6">
          <h4 className="font-semibold text-blue-300 mb-3">💡 How Container Selection Works:</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-200">
            <div>
              <h5 className="font-medium mb-2 text-blue-300">📁 Container Folders:</h5>
              <ul className="space-y-1">
                <li>• Each container has its own dedicated folder</li>
                <li>• Files uploaded will go to: <code className="bg-blue-800 bg-opacity-50 px-1 rounded text-blue-300">/tmp/pterolite-containers/[container-name]/</code></li>
                <li>• Scripts run within the container's isolated environment</li>
              </ul>
            </div>
            <div>
              <h5 className="font-medium mb-2 text-blue-300">🚀 Getting Started:</h5>
              <ul className="space-y-1">
                <li>• Select an existing container or create a new one</li>
                <li>• Each container can run different runtimes (Node.js, Python, etc.)</li>
                <li>• Configure ports for web applications</li>
                <li>• Upload and manage files specific to each container</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContainerSelector;

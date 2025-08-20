import React, { useState, useEffect, useRef } from 'react';
import { getProcesses, getProcessLogs, killProcess, removeProcess, getFiles } from './api';

const StartupManager = ({ selectedContainer, containerFolder }) => {
  const [containerScripts, setContainerScripts] = useState([]);
  const [availableFiles, setAvailableFiles] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    scriptFile: '',
    runtime: 'node',
    port: '',
    autoStart: false,
    description: ''
  });
  const [processes, setProcesses] = useState({});
  const [selectedProcess, setSelectedProcess] = useState(null);
  const [processLogs, setProcessLogs] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const outputRef = useRef(null);

  // Auto-refresh processes and logs
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        loadProcesses();
        if (selectedProcess) {
          loadProcessLogs(selectedProcess);
        }
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, selectedProcess]);

  // Load data on mount
  useEffect(() => {
    loadContainerScripts();
    loadProcesses();
    loadAvailableFiles();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [processLogs]);

  const loadContainerScripts = async () => {
    try {
      // Load scripts for current container from localStorage
      const allScripts = JSON.parse(localStorage.getItem('containerScripts') || '[]');
      const containerScripts = allScripts.filter(script => script.containerId === selectedContainer?.Id);
      setContainerScripts(containerScripts);
    } catch (error) {
      console.error('Failed to load container scripts:', error);
    }
  };

  const loadProcesses = async () => {
    try {
      const response = await getProcesses();
      setProcesses(response);
    } catch (error) {
      console.error('Failed to load processes:', error);
    }
  };

  const loadProcessLogs = async (processId) => {
    try {
      const response = await getProcessLogs(processId, 200);
      setProcessLogs(response.logs || []);
    } catch (error) {
      console.error('Failed to load process logs:', error);
    }
  };

  const loadAvailableFiles = async () => {
    try {
      const response = await getFiles(containerFolder);
      const files = response.files || [];
      const scriptFiles = files.filter(file => 
        file.type === 'file' && 
        (file.name.endsWith('.js') || file.name.endsWith('.py') || file.name.endsWith('.sh'))
      );
      setAvailableFiles(scriptFiles);
    } catch (error) {
      console.error('Failed to load available files:', error);
    }
  };

  const handleSaveScript = async () => {
    try {
      const newScript = {
        ...editForm,
        id: isEditing ? editForm.id : Date.now().toString(),
        containerId: selectedContainer.Id,
        containerName: selectedContainer.Names?.[0]?.replace('/', '') || 'Unnamed',
        createdAt: isEditing ? editForm.createdAt : new Date(),
        updatedAt: new Date()
      };

      // Get all scripts and update
      const allScripts = JSON.parse(localStorage.getItem('containerScripts') || '[]');
      const updatedAllScripts = isEditing 
        ? allScripts.map(s => s.id === newScript.id ? newScript : s)
        : [...allScripts, newScript];

      localStorage.setItem('containerScripts', JSON.stringify(updatedAllScripts));
      loadContainerScripts(); // Reload container-specific scripts
      setIsEditing(false);
      setEditForm({
        name: '',
        scriptFile: '',
        runtime: 'node',
        port: '',
        autoStart: false,
        description: ''
      });
    } catch (error) {
      console.error('Failed to save container script:', error);
    }
  };

  const handleEditScript = (script) => {
    setEditForm(script);
    setIsEditing(true);
  };

  const handleDeleteScript = async (scriptId) => {
    if (confirm('Are you sure you want to delete this script?')) {
      try {
        const allScripts = JSON.parse(localStorage.getItem('containerScripts') || '[]');
        const updatedAllScripts = allScripts.filter(s => s.id !== scriptId);
        localStorage.setItem('containerScripts', JSON.stringify(updatedAllScripts));
        loadContainerScripts();
      } catch (error) {
        console.error('Failed to delete container script:', error);
      }
    }
  };

  const handleStartScript = async (script) => {
    try {
      // Create command based on runtime
      let command = '';
      const scriptPath = `${containerFolder}/${script.scriptFile}`;
      
      switch (script.runtime) {
        case 'node':
          command = `node ${scriptPath}`;
          break;
        case 'python':
          command = `python3 ${scriptPath}`;
          break;
        case 'bash':
          command = `bash ${scriptPath}`;
          break;
        default:
          command = scriptPath;
      }

      // Execute script as process
      const response = await fetch('/api/console/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: command,
          name: `${script.name} (${selectedContainer.Names?.[0]?.replace('/', '') || 'Container'})`,
          workingDir: containerFolder
        })
      });

      if (response.ok) {
        loadProcesses();
      }
    } catch (error) {
      console.error('Failed to start script:', error);
    }
  };

  const handleRestartScript = async (script) => {
    try {
      // Kill existing process if running
      const runningProcess = Object.values(processes).find(p => 
        p.info.name.includes(script.name) && p.status === 'running'
      );
      
      if (runningProcess) {
        await killProcess(runningProcess.id);
        setTimeout(() => handleStartScript(script), 1000);
      } else {
        handleStartScript(script);
      }
    } catch (error) {
      console.error('Failed to restart script:', error);
    }
  };

  const handleKillProcess = async (processId) => {
    try {
      await killProcess(processId);
      loadProcesses();
      if (selectedProcess === processId) {
        setSelectedProcess(null);
        setProcessLogs([]);
      }
    } catch (error) {
      console.error('Failed to kill process:', error);
    }
  };

  const handleRemoveProcess = async (processId) => {
    try {
      await removeProcess(processId);
      loadProcesses();
      if (selectedProcess === processId) {
        setSelectedProcess(null);
        setProcessLogs([]);
      }
    } catch (error) {
      console.error('Failed to remove process:', error);
    }
  };

  const handleSelectProcess = (processId) => {
    setSelectedProcess(processId);
    loadProcessLogs(processId);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'running': return 'text-green-600';
      case 'finished': return 'text-blue-600';
      case 'error': return 'text-red-600';
      case 'killed': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  };

  const getLogTypeColor = (type) => {
    switch (type) {
      case 'stdout': return 'text-green-700';
      case 'stderr': return 'text-red-600';
      case 'error': return 'text-red-700 font-bold';
      case 'system': return 'text-blue-600';
      default: return 'text-gray-700';
    }
  };

  const getScriptStatus = (script) => {
    const runningProcess = Object.values(processes).find(p => 
      p.info.name.includes(script.name)
    );
    return runningProcess ? runningProcess.status : 'stopped';
  };

  const runtimeOptions = [
    { value: 'node', label: 'Node.js', icon: '🟢' },
    { value: 'python', label: 'Python', icon: '🐍' },
    { value: 'bash', label: 'Bash', icon: '📜' }
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">🚀 Startup Manager</h2>
        <p className="text-gray-600">
          Manage startup scripts for container: <strong>{selectedContainer?.Names?.[0]?.replace('/', '') || 'Current Container'}</strong>
        </p>
        <div className="text-sm text-gray-500 mt-1">
          Container folder: <code className="bg-gray-100 px-2 py-1 rounded">{containerFolder}</code>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Script Configuration Section */}
        <div className="lg:col-span-2 space-y-4">
          {/* Script Editor */}
          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                {isEditing ? 'Edit Startup Script' : 'Add New Startup Script'}
              </h3>
              {isEditing && (
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditForm({
                      name: '',
                      scriptFile: '',
                      runtime: 'node',
                      port: '',
                      autoStart: false,
                      description: ''
                    });
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              )}
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Script Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., My Web Server"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Runtime</label>
                  <select
                    value={editForm.runtime}
                    onChange={(e) => setEditForm({...editForm, runtime: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {runtimeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.icon} {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Script File</label>
                <select
                  value={editForm.scriptFile}
                  onChange={(e) => setEditForm({...editForm, scriptFile: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Script File</option>
                  {availableFiles.map((file) => (
                    <option key={file.name} value={file.name}>
                      {file.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={loadAvailableFiles}
                  className="mt-1 text-xs text-blue-600 hover:text-blue-800"
                >
                  Refresh Files
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Port (Optional)</label>
                  <input
                    type="text"
                    value={editForm.port}
                    onChange={(e) => setEditForm({...editForm, port: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 3000, 8080"
                  />
                </div>
                <div className="flex items-center pt-6">
                  <input
                    type="checkbox"
                    id="autoStart"
                    checked={editForm.autoStart}
                    onChange={(e) => setEditForm({...editForm, autoStart: e.target.checked})}
                    className="mr-2"
                  />
                  <label htmlFor="autoStart" className="text-sm text-gray-700">
                    Auto-start with container
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={editForm.description}
                  onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Brief description of what this script does"
                />
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={handleSaveScript}
                  disabled={!editForm.name || !editForm.scriptFile}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isEditing ? 'Update Script' : 'Save Script'}
                </button>
              </div>
            </div>
          </div>

          {/* Container Scripts List */}
          <div className="bg-white rounded-lg shadow-md p-4">
            <h3 className="text-lg font-semibold mb-4">Configured Startup Scripts</h3>
            <div className="space-y-3">
              {containerScripts.length === 0 ? (
                <div className="text-gray-500 text-center py-8">
                  No startup scripts configured yet. Add one above to get started.
                </div>
              ) : (
                containerScripts.map((script) => {
                  const status = getScriptStatus(script);
                  return (
                    <div key={script.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h4 className="font-medium text-gray-900">{script.name}</h4>
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              status === 'running' ? 'bg-green-100 text-green-800' :
                              status === 'error' ? 'bg-red-100 text-red-800' :
                              status === 'finished' ? 'bg-blue-100 text-blue-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {status}
                            </span>
                            {script.autoStart && (
                              <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full">
                                Auto-start
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-600 mb-1">
                            <span className="font-medium">File:</span> <code className="bg-gray-100 px-2 py-1 rounded">{script.scriptFile}</code>
                            <span className="ml-3 font-medium">Runtime:</span> {runtimeOptions.find(r => r.value === script.runtime)?.icon} {script.runtime}
                            {script.port && <span className="ml-3 font-medium">Port:</span>} {script.port && <span className="text-blue-600">{script.port}</span>}
                          </div>
                          <div className="text-sm text-gray-500">
                            {script.description}
                          </div>
                        </div>
                        <div className="flex space-x-2 ml-4">
                          <button
                            onClick={() => handleStartScript(script)}
                            disabled={status === 'running'}
                            className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Start
                          </button>
                          <button
                            onClick={() => handleRestartScript(script)}
                            className="px-3 py-1 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700"
                          >
                            Restart
                          </button>
                          <button
                            onClick={() => handleEditScript(script)}
                            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteScript(script.id)}
                            className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Process Monitor Section */}
        <div className="space-y-4">
          {/* Running Processes */}
          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Running Processes</h3>
              <div className="flex items-center space-x-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="mr-1"
                  />
                  <span className="text-sm">Auto-refresh</span>
                </label>
                <button
                  onClick={loadProcesses}
                  className="px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {Object.keys(processes).length === 0 ? (
                <div className="text-gray-500 text-sm">No running processes</div>
              ) : (
                Object.values(processes).map((process) => (
                  <div
                    key={process.id}
                    className={`p-3 border rounded-md cursor-pointer transition-colors ${
                      selectedProcess === process.id 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                    onClick={() => handleSelectProcess(process.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{process.info.name}</div>
                        <div className={`text-xs ${getStatusColor(process.status)}`}>
                          {process.status}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(process.startTime).toLocaleTimeString()}
                        </div>
                      </div>
                      <div className="flex space-x-1 ml-2">
                        {process.status === 'running' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleKillProcess(process.id);
                            }}
                            className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                          >
                            Kill
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveProcess(process.id);
                          }}
                          className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Process Logs */}
          {selectedProcess && (
            <div className="bg-white rounded-lg shadow-md p-4">
              <h3 className="text-lg font-semibold mb-4">
                Process Logs: {processes[selectedProcess]?.info.name}
              </h3>
              <div 
                ref={outputRef}
                className="bg-black text-white p-3 rounded-md h-64 overflow-y-auto font-mono text-xs custom-scrollbar"
              >
                {processLogs.length === 0 ? (
                  <div className="text-gray-500">No logs available</div>
                ) : (
                  processLogs.map((log, index) => (
                    <div key={index} className="mb-1">
                      <span className="text-gray-400 text-xs">
                        [{new Date(log.timestamp).toLocaleTimeString()}]
                      </span>
                      <span className={`ml-2 ${getLogTypeColor(log.type)}`}>
                        [{log.type}]
                      </span>
                      <span className="ml-2 whitespace-pre-wrap">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Help Section */}
      <div className="mt-6 bg-blue-50 rounded-lg p-4">
        <h4 className="font-semibold text-blue-800 mb-2">💡 How Startup Manager Works:</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• <strong>Upload Scripts:</strong> Use File Manager to upload .js, .py, or .sh files to this container</li>
          <li>• <strong>Configure Scripts:</strong> Select script file, runtime, and port configuration</li>
          <li>• <strong>Start/Restart:</strong> Execute scripts with proper runtime in the container's folder</li>
          <li>• <strong>Process Monitor:</strong> View all running processes and their real-time logs</li>
          <li>• <strong>Auto-start:</strong> Scripts can be configured to start automatically with the container</li>
          <li>• <strong>Container-Specific:</strong> All scripts and files are isolated to the selected container</li>
        </ul>
      </div>
    </div>
  );
};

export default StartupManager;

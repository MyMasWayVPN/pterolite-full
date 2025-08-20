import React, { useState, useEffect, useRef } from 'react';
import { executeCommand, getProcesses, getProcessLogs, killProcess, removeProcess, runCommand } from './api';

const Console = ({ selectedContainer, containerFolder }) => {
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState([]);
  const [workingDir, setWorkingDir] = useState(containerFolder || '/tmp/pterolite-files');
  const [isLoading, setIsLoading] = useState(false);
  const [processes, setProcesses] = useState({});
  const [selectedProcess, setSelectedProcess] = useState(null);
  const [processLogs, setProcessLogs] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [autoRestart, setAutoRestart] = useState(true);
  const [processName, setProcessName] = useState('');
  const [lastCommand, setLastCommand] = useState('');
  const [lastProcessName, setLastProcessName] = useState('');
  const outputRef = useRef(null);

  // Auto-refresh processes and logs
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(async () => {
        const prevProcesses = { ...processes };
        await loadProcesses();
        
        // Check for finished processes and handle auto-restart/auto-remove
        Object.values(prevProcesses).forEach(async (process) => {
          if (process.status === 'running') {
            // Check if process is now finished
            const currentProcess = processes[process.id];
            if (currentProcess && (currentProcess.status === 'finished' || currentProcess.status === 'error')) {
              
              // Auto-restart if enabled and we have a last command
              if (autoRestart && lastCommand && Object.keys(processes).length === 1) {
                setTimeout(async () => {
                  try {
                    // Remove the finished process first
                    await removeProcess(process.id);
                    
                    // Add restart message to output
                    const restartOutput = {
                      id: Date.now(),
                      type: 'info',
                      timestamp: new Date().toLocaleTimeString(),
                      message: `🔄 Auto-restarting process: ${lastProcessName}`,
                      workingDir: getContainerWorkingDir()
                    };
                    setOutput(prev => [...prev, restartOutput]);
                    
                    // Wait a moment then restart
                    setTimeout(async () => {
                      try {
                        const result = await runCommand(lastCommand, getContainerWorkingDir(), lastProcessName, selectedContainer?.Id);
                        if (result.success) {
                          const newOutput = {
                            id: Date.now(),
                            type: 'success',
                            timestamp: new Date().toLocaleTimeString(),
                            message: `✅ Process restarted: ${result.processId}`,
                            workingDir: getContainerWorkingDir()
                          };
                          setOutput(prev => [...prev, newOutput]);
                          loadProcesses();
                          
                          // Auto-select the restarted process
                          setSelectedProcess(result.processId);
                          loadProcessLogs(result.processId);
                        }
                      } catch (error) {
                        const errorOutput = {
                          id: Date.now(),
                          type: 'error',
                          timestamp: new Date().toLocaleTimeString(),
                          error: `❌ Auto-restart failed: ${error.message}`
                        };
                        setOutput(prev => [...prev, errorOutput]);
                      }
                    }, 1000);
                    
                  } catch (error) {
                    console.error('Failed to auto-restart process:', error);
                  }
                }, 2000); // Wait 2 seconds before restarting
              } else {
                // Auto-remove finished processes after a short delay (if not restarting)
                setTimeout(async () => {
                  try {
                    await removeProcess(process.id);
                    loadProcesses();
                    if (selectedProcess === process.id) {
                      setSelectedProcess(null);
                      setProcessLogs([]);
                    }
                  } catch (error) {
                    console.error('Failed to auto-remove finished process:', error);
                  }
                }, 3000); // Wait 3 seconds before removing
              }
            }
          }
        });
        
        if (selectedProcess) {
          loadProcessLogs(selectedProcess);
        }
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, selectedProcess, processes, autoRestart, lastCommand, lastProcessName, selectedContainer]);

  // Load processes on mount and restore persistent output
  useEffect(() => {
    loadProcesses();
    // Load persistent output from localStorage
    const savedOutput = localStorage.getItem(`console-output-${selectedContainer?.Id}`);
    if (savedOutput) {
      try {
        setOutput(JSON.parse(savedOutput));
      } catch (error) {
        console.error('Failed to load saved output:', error);
      }
    }
  }, [selectedContainer]);

  // Update working directory when container changes
  useEffect(() => {
    if (containerFolder && containerFolder !== workingDir) {
      setWorkingDir(containerFolder);
    }
  }, [containerFolder]);

  // Get container name from selected container
  const getContainerName = () => {
    if (selectedContainer && selectedContainer.Names && selectedContainer.Names[0]) {
      return selectedContainer.Names[0].replace('/', '')
    }
    return null
  }

  // Get container working directory
  const getContainerWorkingDir = () => {
    const containerName = getContainerName()
    if (containerName) {
      return `/tmp/pterolite-containers/${containerName}`
    }
    return '/tmp/pterolite-files'
  }

  // Save output to localStorage whenever it changes
  useEffect(() => {
    if (selectedContainer && output.length > 0) {
      localStorage.setItem(`console-output-${selectedContainer.Id}`, JSON.stringify(output.slice(-50))); // Keep last 50 entries
    }
  }, [output, selectedContainer]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, processLogs]);

  const loadProcesses = async () => {
    try {
      const response = await getProcesses(selectedContainer?.Id);
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

  const handleRunPersistentCommand = async () => {
    if (!command.trim()) return;

    // Check if there's already a running process for this container
    const runningProcesses = Object.values(processes).filter(process => process.status === 'running');
    if (runningProcesses.length > 0) {
      const errorOutput = {
        id: Date.now(),
        type: 'error',
        timestamp: new Date().toLocaleTimeString(),
        error: `Cannot start new process. Container already has ${runningProcesses.length} running process(es). Please stop existing processes first.`,
        runningProcesses: runningProcesses.map(p => p.info.name)
      };
      setOutput(prev => [...prev, errorOutput]);
      return;
    }

    setIsLoading(true);
    const containerWorkingDir = getContainerWorkingDir();
    
    try {
      const result = await runCommand(command, containerWorkingDir, processName || `Command: ${command.substring(0, 30)}`, selectedContainer?.Id);
      if (result.success) {
        // Store command for auto restart
        setLastCommand(command);
        setLastProcessName(processName || `Command: ${command.substring(0, 30)}`);
        
        const newOutput = {
          id: Date.now(),
          type: 'success',
          timestamp: new Date().toLocaleTimeString(),
          message: `Started process: ${result.processId}${autoRestart ? ' (Auto Restart enabled)' : ''}`,
          workingDir: containerWorkingDir
        };
        setOutput(prev => [...prev, newOutput]);
        setCommand('');
        setProcessName('');
        loadProcesses();
        
        // Automatically select the new process to show its logs
        setSelectedProcess(result.processId);
        loadProcessLogs(result.processId);
      }
    } catch (error) {
      const errorOutput = {
        id: Date.now(),
        type: 'error',
        timestamp: new Date().toLocaleTimeString(),
        error: error.message
      };
      setOutput(prev => [...prev, errorOutput]);
    } finally {
      setIsLoading(false);
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
      const process = processes[processId];
      
      // If process is still running, kill it first
      if (process && process.status === 'running') {
        await killProcess(processId);
        // Wait a moment for the process to be killed
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      }
      
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

  const clearOutput = () => {
    setOutput([]);
    if (selectedContainer) {
      localStorage.removeItem(`console-output-${selectedContainer.Id}`);
    }
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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">💻 Console & Process Monitor</h2>
        <p className="text-gray-300">Execute commands and monitor running processes with real-time logs</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Command Input Section */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-dark-secondary rounded-lg shadow-dark p-4">
            <h3 className="text-lg font-semibold mb-4 text-white">Command Execution</h3>
            
            <div className="space-y-3">
              {/* Container Info & Working Directory Display */}
              <div className="p-3 bg-dark-tertiary rounded-lg border border-dark">
                {selectedContainer ? (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <strong className="text-white">Server:</strong> 
                        <span className="ml-2 text-green-400">{selectedContainer.Names?.[0]?.replace('/', '') || 'Unknown'}</span>
                        <span className="ml-2 text-gray-400">({selectedContainer.State})</span>
                      </div>
                    </div>
                    <div>
                      <strong className="text-white">Working Directory:</strong> 
                      <code className="ml-2 text-blue-400 bg-dark px-2 py-1 rounded">{getContainerWorkingDir()}</code>
                    </div>
                    <div className="mt-2 text-sm text-yellow-400">
                      🔒 Commands will execute in server folder only
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-yellow-400 mb-2">⚠️ No server selected</div>
                    <div>
                      <strong className="text-white">Working Directory:</strong> 
                      <code className="ml-2 text-blue-400 bg-dark px-2 py-1 rounded">/tmp/pterolite-files</code>
                    </div>
                    <div className="mt-2 text-sm text-gray-400">
                      Select a server to restrict command execution to server folder
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Process Name (for persistent commands)</label>
                <input
                  type="text"
                  value={processName}
                  onChange={(e) => setProcessName(e.target.value)}
                  className="w-full px-3 py-2 bg-dark-tertiary border border-dark text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Optional name for persistent process"
                />
              </div>

              <div className="flex items-center space-x-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={autoRestart}
                    onChange={(e) => setAutoRestart(e.target.checked)}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-300">🔄 Auto Restart (restart script when it stops)</span>
                  {autoRestart && lastCommand && (
                    <span className="ml-2 bg-green-800 text-green-200 px-2 py-1 rounded text-xs">
                      ✅ ACTIVE
                    </span>
                  )}
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Command</label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleRunPersistentCommand()}
                    className="flex-1 px-3 py-2 bg-dark-tertiary border border-dark text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                    placeholder="Enter command (e.g., ls -la, python3 script.py)"
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="flex space-x-2">
                <div className="relative">
                  <button
                    onClick={handleRunPersistentCommand}
                    disabled={isLoading || !command.trim() || Object.values(processes).some(p => p.status === 'running')}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={Object.values(processes).some(p => p.status === 'running') ? 
                      `Cannot start new process. ${Object.values(processes).filter(p => p.status === 'running').length} process(es) already running.` : 
                      'Run command and monitor process'
                    }
                  >
                    {isLoading ? 'Menjalankan...' : Object.values(processes).some(p => p.status === 'running') ? 
                      '🚫 Proses Berjalan' : 
                      'Jalankan Perintah'
                    }
                  </button>
                  {Object.values(processes).some(p => p.status === 'running') && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                  )}
                </div>
                <button
                  onClick={clearOutput}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                >
                  Clear Output
                </button>
              </div>
            </div>

            {/* Quick Commands */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">Quick Commands</label>
              <div className="flex flex-wrap gap-2">
                {['ls -la', 'pwd', 'df -h', 'free -h', 'ps aux', 'top -n 1'].map((cmd) => (
                  <button
                    key={cmd}
                    onClick={() => setCommand(cmd)}
                    className="px-3 py-1 text-sm bg-dark-tertiary text-gray-300 rounded-md hover:bg-gray-600 hover:text-white transition-colors"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Combined Output & Process Logs */}
          <div className="bg-dark-secondary rounded-lg shadow-dark p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">📊 Combined Output & Process Logs</h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={clearOutput}
                  className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Clear All
                </button>
                <button
                  onClick={loadProcesses}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Refresh
                </button>
              </div>
            </div>
            
            {/* Active Processes Summary */}
            {Object.keys(processes).length > 0 && (
              <div className="mb-4 p-3 bg-blue-900 bg-opacity-30 rounded-lg border border-blue-700">
                <h4 className="font-medium text-blue-300 mb-2">🔄 Active Processes ({Object.keys(processes).length})</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.values(processes).map((process) => (
                    <div key={process.id} className="flex items-center space-x-2 bg-dark-tertiary px-3 py-1 rounded-full border border-dark">
                      <span className={`w-2 h-2 rounded-full ${
                        process.status === 'running' ? 'bg-green-500' :
                        process.status === 'finished' ? 'bg-blue-500' :
                        process.status === 'error' ? 'bg-red-500' :
                        'bg-gray-500'
                      }`}></span>
                      <span className="text-sm font-medium text-white">{process.info.name}</span>
                      <span className="text-xs text-gray-400">{process.id.substring(0, 6)}</span>
                      <div className="flex space-x-1">
                        <button
                          onClick={() => handleSelectProcess(process.id)}
                          className={`text-xs hover:text-blue-400 ${
                            selectedProcess === process.id ? 'text-blue-400' : 'text-blue-500'
                          }`}
                          title="View Logs"
                        >
                          📋
                        </button>
                        {process.status === 'running' && (
                          <button
                            onClick={() => handleKillProcess(process.id)}
                            className="text-xs text-red-400 hover:text-red-300"
                            title="Kill Process"
                          >
                            ⏹️
                          </button>
                        )}
                        <button
                          onClick={() => handleRemoveProcess(process.id)}
                          className="text-xs text-gray-400 hover:text-gray-300"
                          title="Remove"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div 
              ref={outputRef}
              className="bg-black text-green-400 p-4 rounded-md h-96 overflow-y-auto font-mono text-sm custom-scrollbar"
            >
              {output.length === 0 && processLogs.length === 0 ? (
                <div className="text-gray-500 text-center py-12">
                  <div className="text-6xl mb-4">💻</div>
                  <p className="text-lg mb-2">No output yet</p>
                  <p className="text-sm">Execute commands or select a process to see combined output here</p>
                </div>
              ) : (
                <>
                  {/* Command Output */}
                  {output.map((item) => (
                    <div key={`cmd-${item.id}`} className="mb-4 border-l-2 border-blue-600 pl-3">
                      <div className="text-blue-400 mb-1 flex items-center flex-wrap">
                        <span className="text-yellow-400 mr-2">$</span>
                        <span>[{item.timestamp}] {item.type === 'command' ? item.command : item.type}</span>
                        <span className="ml-2 bg-blue-800 text-blue-200 px-2 py-1 rounded text-xs">
                          COMMAND
                        </span>
                        {item.workingDir && (
                          <span className="ml-2 bg-gray-700 text-gray-300 px-2 py-1 rounded text-xs">
                            📁 {item.workingDir}
                          </span>
                        )}
                      </div>
                      {item.stdout && (
                        <div className="text-green-400 whitespace-pre-wrap mb-1">{item.stdout}</div>
                      )}
                      {item.stderr && (
                        <div className="text-red-400 whitespace-pre-wrap mb-1">{item.stderr}</div>
                      )}
                      {item.error && (
                        <div className="text-red-500 whitespace-pre-wrap mb-1">❌ Error: {item.error}</div>
                      )}
                      {item.message && (
                        <div className="text-yellow-400 whitespace-pre-wrap mb-1">{item.message}</div>
                      )}
                      {item.exitCode !== undefined && (
                        <div className={`text-xs mt-1 ${
                          item.exitCode === 0 ? 'text-green-500' : 'text-red-500'
                        }`}>
                          Exit code: {item.exitCode}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Process Logs */}
                  {selectedProcess && processLogs.length > 0 && (
                    <div className="mb-4 border-l-2 border-purple-600 pl-3">
                      <div className="text-purple-400 mb-2 flex items-center">
                        <span className="text-yellow-400 mr-2">🔄</span>
                        <span>Process: {processes[selectedProcess]?.info.name}</span>
                        <span className="ml-2 bg-purple-800 text-purple-200 px-2 py-1 rounded text-xs">
                          PROCESS LOGS
                        </span>
                      </div>
                      {processLogs.map((log, index) => (
                        <div key={`log-${index}`} className={`text-xs mb-1 ${
                          log.type === 'stdout' ? 'text-green-300' :
                          log.type === 'stderr' ? 'text-red-300' :
                          log.type === 'system' ? 'text-blue-300' :
                          log.type === 'error' ? 'text-red-400' :
                          'text-gray-300'
                        }`}>
                          <span className="text-gray-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                          <span className="ml-2">[{log.type}]</span>
                          <span className="ml-2 whitespace-pre-wrap">{log.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Process Monitor Section - Simplified */}
        <div className="space-y-4">
          <div className="bg-dark-secondary rounded-lg shadow-dark p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">Process Monitor</h3>
              <div className="flex items-center space-x-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="mr-1"
                  />
                  <span className="text-sm text-gray-300">Auto-refresh</span>
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
                <div className="text-gray-400 text-sm text-center py-8">
                  <div className="text-4xl mb-2">📊</div>
                  <p>No running processes</p>
                </div>
              ) : (
                Object.values(processes).map((process) => (
                  <div
                    key={process.id}
                    className="p-3 border border-dark rounded-md bg-dark-tertiary hover:bg-gray-600 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate text-white">{process.info.name}</div>
                        <div className={`text-xs ${getStatusColor(process.status)}`}>
                          {process.status}
                        </div>
                        <div className="text-xs text-gray-400">
                          Started: {new Date(process.startTime).toLocaleTimeString()}
                        </div>
                        <div className="text-xs text-gray-400">
                          ID: {process.id.substring(0, 8)}
                        </div>
                      </div>
                      <div className="flex space-x-1 ml-2">
                        {process.status === 'running' && (
                          <button
                            onClick={() => handleKillProcess(process.id)}
                            className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                          >
                            Kill
                          </button>
                        )}
                        <button
                          onClick={() => handleRemoveProcess(process.id)}
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
        </div>
      </div>
    </div>
  );
};

export default Console;

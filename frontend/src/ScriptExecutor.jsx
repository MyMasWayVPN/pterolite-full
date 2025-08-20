import React, { useState, useEffect, useRef } from 'react';
import { executeJavaScript, executePython, runJavaScriptProcess, runPythonProcess, getProcesses, getProcessLogs, killProcess, removeProcess } from './api';

const ScriptExecutor = () => {
  const [activeTab, setActiveTab] = useState('javascript');
  const [code, setCode] = useState('');
  const [output, setOutput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [workingDir, setWorkingDir] = useState('/tmp/pterolite-files');
  const [processes, setProcesses] = useState({});
  const [selectedProcess, setSelectedProcess] = useState(null);
  const [processLogs, setProcessLogs] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [scriptName, setScriptName] = useState('');
  const outputRef = useRef(null);

  // Auto-refresh processes and logs
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        loadProcesses();
        if (selectedProcess) {
          loadProcessLogs(selectedProcess);
        }
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, selectedProcess]);

  // Load processes on mount
  useEffect(() => {
    loadProcesses();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, processLogs]);

  const loadProcesses = async () => {
    try {
      const response = await getProcesses();
      // Filter only script processes
      const scriptProcesses = {};
      Object.entries(response).forEach(([id, process]) => {
        if (process.info.language === 'javascript' || process.info.language === 'python') {
          scriptProcesses[id] = process;
        }
      });
      setProcesses(scriptProcesses);
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

  const handleExecuteOnce = async () => {
    if (!code.trim()) return;

    setIsLoading(true);
    setOutput('Executing...\n');

    try {
      let result;
      if (activeTab === 'javascript') {
        result = await executeJavaScript(code, workingDir);
      } else {
        result = await executePython(code, workingDir);
      }

      let outputText = '';
      if (result.stdout) outputText += result.stdout;
      if (result.stderr) outputText += `\nSTDERR:\n${result.stderr}`;
      if (result.error) outputText += `\nERROR:\n${result.error}`;
      outputText += `\n\nExit Code: ${result.exitCode}`;

      setOutput(outputText);
    } catch (error) {
      setOutput(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunPersistent = async () => {
    if (!code.trim()) return;

    setIsLoading(true);
    try {
      let result;
      const name = scriptName || `${activeTab} Script`;
      
      if (activeTab === 'javascript') {
        result = await runJavaScriptProcess(code, workingDir, name);
      } else {
        result = await runPythonProcess(code, workingDir, name);
      }

      if (result.success) {
        setOutput(`Started persistent process: ${result.processId}\n${result.message}`);
        setScriptName('');
        loadProcesses();
      } else {
        setOutput(`Failed to start process: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      setOutput(`Error: ${error.message}`);
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

  const loadExample = (language) => {
    const examples = {
      javascript: `// JavaScript Example - Web Server
const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => {
  console.log(\`\${new Date().toISOString()} - \${req.method} \${req.url}\`);
  
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<h1>Hello from PteroLite!</h1><p>Server running...</p>');
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
  console.log('This will keep running until stopped...');
});

// Keep alive with periodic messages
setInterval(() => {
  console.log(\`Server alive at \${new Date().toISOString()}\`);
}, 10000);`,

      python: `# Python Example - File Monitor
import time
import os
import json
from datetime import datetime

def monitor_directory(path="/tmp/pterolite-files"):
    print(f"Starting directory monitor for: {path}")
    
    if not os.path.exists(path):
        os.makedirs(path)
    
    last_files = set()
    
    while True:
        try:
            current_files = set(os.listdir(path))
            
            # Check for new files
            new_files = current_files - last_files
            if new_files:
                for file in new_files:
                    print(f"[{datetime.now()}] New file detected: {file}")
            
            # Check for deleted files
            deleted_files = last_files - current_files
            if deleted_files:
                for file in deleted_files:
                    print(f"[{datetime.now()}] File deleted: {file}")
            
            last_files = current_files
            
            # Status update
            print(f"[{datetime.now()}] Monitoring... ({len(current_files)} files)")
            
            time.sleep(5)
            
        except KeyboardInterrupt:
            print("Monitor stopped by user")
            break
        except Exception as e:
            print(f"Error: {e}")
            time.sleep(1)

if __name__ == "__main__":
    monitor_directory()`
    };

    setCode(examples[language]);
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
        <h2 className="text-2xl font-bold text-gray-800 mb-2">⚡ Script Executor & Process Manager</h2>
        <p className="text-gray-600">Execute JavaScript and Python scripts with multi-process support and real-time monitoring</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Script Editor Section */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Code Editor</h3>
              <div className="flex space-x-2">
                <button
                  onClick={() => setActiveTab('javascript')}
                  className={`px-4 py-2 rounded-md ${
                    activeTab === 'javascript'
                      ? 'bg-yellow-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  JavaScript
                </button>
                <button
                  onClick={() => setActiveTab('python')}
                  className={`px-4 py-2 rounded-md ${
                    activeTab === 'python'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Python
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Working Directory</label>
                <input
                  type="text"
                  value={workingDir}
                  onChange={(e) => setWorkingDir(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="/tmp/pterolite-files"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Script Name (for persistent processes)</label>
                <input
                  type="text"
                  value={scriptName}
                  onChange={(e) => setScriptName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={`Optional name for ${activeTab} script`}
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    {activeTab === 'javascript' ? 'JavaScript' : 'Python'} Code
                  </label>
                  <button
                    onClick={() => loadExample(activeTab)}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    Load Example
                  </button>
                </div>
                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full h-64 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm code-editor"
                  placeholder={`Enter your ${activeTab} code here...`}
                />
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={handleExecuteOnce}
                  disabled={isLoading || !code.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Executing...' : 'Execute Once'}
                </button>
                <button
                  onClick={handleRunPersistent}
                  disabled={isLoading || !code.trim()}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Run Persistent
                </button>
                <button
                  onClick={() => setCode('')}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                >
                  Clear Code
                </button>
              </div>
            </div>
          </div>

          {/* Output Section */}
          <div className="bg-white rounded-lg shadow-md p-4">
            <h3 className="text-lg font-semibold mb-4">Execution Output</h3>
            <div 
              ref={outputRef}
              className="bg-black text-green-400 p-4 rounded-md h-64 overflow-y-auto font-mono text-sm custom-scrollbar"
            >
              {output ? (
                <pre className="whitespace-pre-wrap">{output}</pre>
              ) : (
                <div className="text-gray-500">No output yet. Execute some code to see results...</div>
              )}
            </div>
          </div>
        </div>

        {/* Process Monitor Section */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Running Scripts</h3>
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
                <div className="text-gray-500 text-sm">No running scripts</div>
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
                        <div className="flex items-center space-x-2">
                          <span className={`text-xs px-2 py-1 rounded ${
                            process.info.language === 'javascript' 
                              ? 'bg-yellow-100 text-yellow-800' 
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {process.info.language}
                          </span>
                          <span className={`text-xs ${getStatusColor(process.status)}`}>
                            {process.status}
                          </span>
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

          {/* Script Logs */}
          {selectedProcess && (
            <div className="bg-white rounded-lg shadow-md p-4">
              <h3 className="text-lg font-semibold mb-4">
                Script Logs: {processes[selectedProcess]?.info.name}
              </h3>
              <div className="bg-black text-white p-3 rounded-md h-64 overflow-y-auto font-mono text-xs custom-scrollbar">
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
        <h4 className="font-semibold text-blue-800 mb-2">💡 Tips for Multi-Script Running:</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• <strong>Execute Once:</strong> Run script and get immediate output (good for testing)</li>
          <li>• <strong>Run Persistent:</strong> Start script as background process (good for servers, monitors)</li>
          <li>• <strong>Process Monitor:</strong> View all running scripts and their real-time logs</li>
          <li>• <strong>Working Directory:</strong> Scripts can access files in the specified directory</li>
          <li>• <strong>Examples:</strong> Click "Load Example" to see sample persistent scripts</li>
        </ul>
      </div>
    </div>
  );
};

export default ScriptExecutor;

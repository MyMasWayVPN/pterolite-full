const { v4: uuidv4 } = require("uuid");

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

// Create singleton instance
const processManager = new ProcessManager();

module.exports = processManager;

import axios from 'axios';

const API_BASE_URL = '';

const api = axios.create({
  baseURL: API_BASE_URL
});

// Export the api instance for direct use
export { api };

// Container management
export const getContainers = async () => {
  const response = await api.get('/containers');
  return response.data;
};

export const startContainer = async (id) => {
  const response = await api.post(`/containers/${id}/start`);
  return response.data;
};

export const stopContainer = async (id) => {
  const response = await api.post(`/containers/${id}/stop`);
  return response.data;
};

export const createContainer = async (containerData) => {
  const response = await api.post('/containers', containerData);
  return response.data;
};

export const deleteContainer = async (id, removeImage = false) => {
  const response = await api.delete(`/containers/${id}?removeImage=${removeImage}`);
  return response.data;
};

// File management
export const getFiles = async (path = '/tmp/pterolite-files') => {
  const response = await api.get(`/files?path=${encodeURIComponent(path)}`);
  return response.data;
};

export const getFileContent = async (path) => {
  const response = await api.get(`/files/content?path=${encodeURIComponent(path)}`);
  return response.data;
};

export const saveFile = async (path, content) => {
  const response = await api.post('/files/save', { path, content });
  return response.data;
};

export const uploadFile = async (file, targetPath) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('targetPath', targetPath);
  
  const response = await api.post('/files/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const extractZip = async (zipPath, extractPath) => {
  const response = await api.post('/files/extract', { zipPath, extractPath });
  return response.data;
};

export const deleteFile = async (path) => {
  const response = await api.delete(`/files?path=${encodeURIComponent(path)}`);
  return response.data;
};

// Process management
export const getProcesses = async (containerId = null) => {
  const params = containerId ? { containerId } : {};
  const response = await api.get('/processes', { params });
  return response.data;
};

export const getProcessLogs = async (processId, limit = 100) => {
  const response = await api.get(`/processes/${processId}/logs?limit=${limit}`);
  return response.data;
};

export const killProcess = async (processId) => {
  const response = await api.post(`/processes/${processId}/kill`);
  return response.data;
};

export const removeProcess = async (processId) => {
  const response = await api.delete(`/processes/${processId}`);
  return response.data;
};

// Console
export const executeCommand = async (command, workingDir) => {
  const response = await api.post('/console/execute', { command, workingDir });
  return response.data;
};

export const runCommand = async (command, workingDir, name, containerId = null) => {
  const response = await api.post('/console/run', { command, workingDir, name, containerId });
  return response.data;
};

// Script execution - One-time execution
export const executeJavaScript = async (code, workingDir) => {
  const response = await api.post('/scripts/javascript', { code, workingDir });
  return response.data;
};

export const executePython = async (code, workingDir) => {
  const response = await api.post('/scripts/python', { code, workingDir });
  return response.data;
};

// Script execution - Persistent processes
export const runJavaScriptProcess = async (code, workingDir, name) => {
  const response = await api.post('/scripts/javascript/run', { code, workingDir, name });
  return response.data;
};

export const runPythonProcess = async (code, workingDir, name) => {
  const response = await api.post('/scripts/python/run', { code, workingDir, name });
  return response.data;
};

// Startup command management
export const getStartupCommands = async () => {
  const response = await api.get('/startup-commands');
  return response.data;
};

export const saveStartupCommand = async (command) => {
  const response = await api.post('/startup-commands', command);
  return response.data;
};

export const deleteStartupCommand = async (commandId) => {
  const response = await api.delete(`/startup-commands/${commandId}`);
  return response.data;
};

export const runStartupCommand = async (commandId) => {
  const response = await api.post(`/startup-commands/${commandId}/run`);
  return response.data;
};

// Docker image management
export const getDockerImages = async () => {
  const response = await api.get('/docker/images');
  return response.data;
};

export const executeDockerCommand = async (command) => {
  const response = await api.post('/docker/execute', { command });
  return response.data;
};

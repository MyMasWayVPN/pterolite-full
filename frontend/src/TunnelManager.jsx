import React, { useState, useEffect } from 'react';
import { 
  getTunnels, 
  createTunnel, 
  createQuickTunnel, 
  getTunnelLogs, 
  stopTunnel, 
  removeTunnel, 
  installCloudflared, 
  checkCloudflared 
} from './api';

const TunnelManager = ({ selectedContainer, containerFolder }) => {
  const [tunnels, setTunnels] = useState({});
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [cloudflaredInstalled, setCloudflaredInstalled] = useState(false);
  const [cloudflaredVersion, setCloudflaredVersion] = useState('');
  const [installing, setInstalling] = useState(false);
  const [createForm, setCreateForm] = useState({
    port: '',
    name: '',
    subdomain: '',
    type: 'quick', // 'quick', 'named', or 'token'
    token: ''
  });
  const [selectedTunnel, setSelectedTunnel] = useState(null);
  const [tunnelLogs, setTunnelLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    checkCloudflaredStatus();
    loadTunnels();
    
    // Auto-refresh tunnels every 5 seconds
    const interval = setInterval(loadTunnels, 5000);
    return () => clearInterval(interval);
  }, []);

  const checkCloudflaredStatus = async () => {
    try {
      const result = await checkCloudflared();
      setCloudflaredInstalled(result.installed);
      setCloudflaredVersion(result.version || '');
    } catch (error) {
      console.error('Failed to check cloudflared status:', error);
      setCloudflaredInstalled(false);
    }
  };

  const loadTunnels = async () => {
    try {
      const tunnelList = await getTunnels();
      setTunnels(tunnelList);
    } catch (error) {
      console.error('Failed to load tunnels:', error);
    }
  };

  const handleInstallCloudflared = async () => {
    setInstalling(true);
    try {
      const result = await installCloudflared();
      if (result.success) {
        alert('Cloudflared installed successfully!');
        checkCloudflaredStatus();
      } else {
        alert(`Installation failed: ${result.error || result.stderr}`);
      }
    } catch (error) {
      alert(`Installation failed: ${error.message}`);
    } finally {
      setInstalling(false);
    }
  };

  const handleCreateTunnel = async () => {
    if (!createForm.port) {
      alert('Port is required');
      return;
    }

    setLoading(true);
    try {
      let result;
      if (createForm.type === 'quick') {
        result = await createQuickTunnel(createForm.port, createForm.name);
      } else {
        result = await createTunnel(createForm.port, createForm.name, createForm.subdomain);
      }

      if (result.success) {
        alert(`Tunnel created successfully! Check the logs for the tunnel URL.`);
        setShowCreateForm(false);
        setCreateForm({ port: '', name: '', subdomain: '', type: 'quick' });
        loadTunnels();
      } else {
        alert(`Failed to create tunnel: ${result.error}`);
      }
    } catch (error) {
      alert(`Failed to create tunnel: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleStopTunnel = async (tunnelId) => {
    try {
      const result = await stopTunnel(tunnelId);
      if (result.success) {
        alert('Tunnel stopped successfully');
        loadTunnels();
      } else {
        alert(`Failed to stop tunnel: ${result.error}`);
      }
    } catch (error) {
      alert(`Failed to stop tunnel: ${error.message}`);
    }
  };

  const handleRemoveTunnel = async (tunnelId) => {
    if (!confirm('Are you sure you want to remove this tunnel?')) {
      return;
    }

    try {
      const result = await removeTunnel(tunnelId);
      if (result.success) {
        alert('Tunnel removed successfully');
        loadTunnels();
        if (selectedTunnel === tunnelId) {
          setSelectedTunnel(null);
          setShowLogs(false);
        }
      } else {
        alert(`Failed to remove tunnel: ${result.error}`);
      }
    } catch (error) {
      alert(`Failed to remove tunnel: ${error.message}`);
    }
  };

  const handleViewLogs = async (tunnelId) => {
    try {
      const result = await getTunnelLogs(tunnelId, 200);
      setTunnelLogs(result.logs);
      setSelectedTunnel(tunnelId);
      setShowLogs(true);
    } catch (error) {
      alert(`Failed to load tunnel logs: ${error.message}`);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'running':
        return 'bg-green-900 text-green-300 border-green-700';
      case 'stopped':
        return 'bg-red-900 text-red-300 border-red-700';
      case 'stopping':
        return 'bg-yellow-900 text-yellow-300 border-yellow-700';
      case 'error':
        return 'bg-red-900 text-red-300 border-red-700';
      default:
        return 'bg-gray-900 text-gray-300 border-gray-700';
    }
  };

  const extractTunnelUrl = (logs) => {
    for (const log of logs.reverse()) {
      if (log.message.includes('https://') && log.message.includes('.trycloudflare.com')) {
        const match = log.message.match(/(https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com)/);
        if (match) {
          return match[1];
        }
      }
    }
    return null;
  };

  if (!cloudflaredInstalled) {
    return (
      <div className="bg-dark-secondary rounded-lg shadow-dark p-6">
        <div className="text-center">
          <div className="text-6xl text-blue-400 mb-4">🌐</div>
          <h2 className="text-2xl font-bold text-white mb-4">Cloudflare Tunnel</h2>
          <p className="text-gray-300 mb-6">
            Cloudflared is not installed. Install it to create tunnels for your applications.
          </p>
          
          <div className="bg-blue-900 bg-opacity-30 border border-blue-700 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-blue-300 mb-2">What is Cloudflare Tunnel?</h3>
            <ul className="text-sm text-blue-200 text-left space-y-1">
              <li>• Expose local applications to the internet securely</li>
              <li>• No need to open firewall ports</li>
              <li>• Get a public HTTPS URL instantly</li>
              <li>• Perfect for testing and sharing your work</li>
            </ul>
          </div>

          <button
            onClick={handleInstallCloudflared}
            disabled={installing}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {installing ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Installing Cloudflared...
              </div>
            ) : (
              'Install Cloudflared'
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-dark-secondary rounded-lg shadow-dark p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Cloudflare Tunnels</h2>
          <p className="text-gray-300 text-sm">
            Cloudflared {cloudflaredVersion} • Expose your applications to the internet
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
        >
          Create Tunnel
        </button>
      </div>

      {/* Active Tunnels */}
      <div className="space-y-4 mb-6">
        {Object.keys(tunnels).length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl text-gray-400 mb-4">🌐</div>
            <p className="text-gray-400">No active tunnels</p>
            <p className="text-gray-500 text-sm">Create a tunnel to expose your applications</p>
          </div>
        ) : (
          Object.entries(tunnels).map(([id, tunnel]) => {
            const tunnelUrl = extractTunnelUrl(tunnelLogs);
            return (
              <div key={id} className="bg-dark-tertiary rounded-lg p-4 border border-dark">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="font-medium text-white">{tunnel.info.name}</h3>
                      <span className={`px-2 py-1 rounded text-xs font-medium border ${getStatusColor(tunnel.status)}`}>
                        {tunnel.status}
                      </span>
                      {tunnel.info.type === 'quick-tunnel' && (
                        <span className="px-2 py-1 rounded text-xs bg-purple-900 text-purple-300 border border-purple-700">
                          Quick Tunnel
                        </span>
                      )}
                    </div>
                    
                    <div className="text-sm text-gray-300 space-y-1">
                      <p><span className="font-medium">Port:</span> {tunnel.info.port}</p>
                      <p><span className="font-medium">Type:</span> {tunnel.info.type}</p>
                      <p><span className="font-medium">Started:</span> {new Date(tunnel.startTime).toLocaleString()}</p>
                      {tunnel.info.subdomain && (
                        <p><span className="font-medium">Subdomain:</span> {tunnel.info.subdomain}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleViewLogs(id)}
                      className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                    >
                      View Logs
                    </button>
                    {tunnel.status === 'running' && (
                      <button
                        onClick={() => handleStopTunnel(id)}
                        className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        Stop
                      </button>
                    )}
                    <button
                      onClick={() => handleRemoveTunnel(id)}
                      className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create Tunnel Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-dark-secondary rounded-lg p-6 w-full max-w-md mx-4 border border-dark">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">Create Cloudflare Tunnel</h3>
              <button
                onClick={() => setShowCreateForm(false)}
                className="text-gray-400 hover:text-gray-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Tunnel Type</label>
                <select
                  value={createForm.type}
                  onChange={(e) => setCreateForm({...createForm, type: e.target.value})}
                  className="w-full px-3 py-2 bg-dark-tertiary border border-dark text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="quick">Quick Tunnel (Temporary)</option>
                  <option value="named">Named Tunnel (Persistent)</option>
                  <option value="token">Token Tunnel (Manual)</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  {createForm.type === 'quick' 
                    ? 'Creates a temporary tunnel with random URL' 
                    : createForm.type === 'named'
                    ? 'Creates a persistent tunnel with custom subdomain'
                    : 'Use your own Cloudflare Tunnel token'
                  }
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Local Port</label>
                <input
                  type="number"
                  value={createForm.port}
                  onChange={(e) => setCreateForm({...createForm, port: e.target.value})}
                  className="w-full px-3 py-2 bg-dark-tertiary border border-dark text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="3000"
                  min="1"
                  max="65535"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Tunnel Name</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({...createForm, name: e.target.value})}
                  className="w-full px-3 py-2 bg-dark-tertiary border border-dark text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="my-app-tunnel"
                />
              </div>

              {createForm.type === 'named' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Subdomain</label>
                  <input
                    type="text"
                    value={createForm.subdomain}
                    onChange={(e) => setCreateForm({...createForm, subdomain: e.target.value})}
                    className="w-full px-3 py-2 bg-dark-tertiary border border-dark text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="my-app"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Custom subdomain for your tunnel
                  </p>
                </div>
              )}

              {createForm.type === 'token' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Cloudflare Tunnel Token</label>
                  <textarea
                    value={createForm.token}
                    onChange={(e) => setCreateForm({...createForm, token: e.target.value})}
                    className="w-full px-3 py-2 bg-dark-tertiary border border-dark text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="eyJhIjoiNzU2..."
                    rows="3"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Paste your Cloudflare Tunnel token from the dashboard
                  </p>
                </div>
              )}
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowCreateForm(false)}
                className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 rounded-md hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTunnel}
                disabled={!createForm.port || loading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Creating...
                  </div>
                ) : (
                  'Create Tunnel'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tunnel Logs Modal */}
      {showLogs && selectedTunnel && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-dark-secondary rounded-lg p-6 w-full max-w-4xl mx-4 border border-dark max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">
                Tunnel Logs - {tunnels[selectedTunnel]?.info?.name}
              </h3>
              <button
                onClick={() => setShowLogs(false)}
                className="text-gray-400 hover:text-gray-200"
              >
                ✕
              </button>
            </div>

            <div className="bg-dark-tertiary rounded-lg p-4 font-mono text-sm overflow-auto flex-1">
              {tunnelLogs.length === 0 ? (
                <p className="text-gray-400">No logs available</p>
              ) : (
                tunnelLogs.map((log, index) => (
                  <div key={index} className="mb-1">
                    <span className="text-gray-500">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={`ml-2 ${
                      log.type === 'error' ? 'text-red-400' :
                      log.type === 'system' ? 'text-blue-400' :
                      log.type === 'stderr' ? 'text-yellow-400' :
                      'text-gray-300'
                    }`}>
                      [{log.type}]
                    </span>
                    <span className="ml-2 text-gray-200">{log.message}</span>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => handleViewLogs(selectedTunnel)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Refresh Logs
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help Section */}
      <div className="mt-6 bg-blue-900 bg-opacity-30 border border-blue-700 rounded-lg p-4">
        <h4 className="font-semibold text-blue-300 mb-2">💡 How to use Cloudflare Tunnels:</h4>
        <div className="text-sm text-blue-200 space-y-1">
          <p>• <strong>Quick Tunnel:</strong> Creates a temporary tunnel with a random URL (no authentication required)</p>
          <p>• <strong>Named Tunnel:</strong> Creates a persistent tunnel with custom subdomain (requires Cloudflare account)</p>
          <p>• <strong>Port:</strong> The local port where your application is running (e.g., 3000, 8080)</p>
          <p>• <strong>Tunnel URL:</strong> Check the logs to find your public tunnel URL</p>
          <p>• <strong>Security:</strong> Tunnels are secured with HTTPS automatically</p>
        </div>
      </div>
    </div>
  );
};

export default TunnelManager;

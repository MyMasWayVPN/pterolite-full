import { useState, useEffect } from 'react';
import ContainerSelector from './ContainerSelector';
import FileManager from './FileManager';
import Console from './Console';
import ScriptExecutor from './ScriptExecutor';
import StartupManager from './StartupManager';
import DockerImageManager from './DockerImageManager';
import TunnelManager from './TunnelManager';
import Login from './Login';
import { api } from './api';

function App() {
  const [selectedContainer, setSelectedContainer] = useState(null);
  const [showContainerSelector, setShowContainerSelector] = useState(true);
  const [activeTab, setActiveTab] = useState('files');
  const [user, setUser] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Check authentication status on app load
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Check if we have a token in localStorage
        const token = localStorage.getItem('pterolite_token');
        if (token) {
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        }
        
        api.defaults.withCredentials = true;
        
        // Check authentication status
        const response = await api.get('/auth/status');
        
        if (response.data.authenticated) {
          setUser(response.data.user);
          setAuthToken(token || 'authenticated');
          localStorage.setItem('user', JSON.stringify(response.data.user));
        } else {
          // Clear invalid session
          localStorage.removeItem('user');
          localStorage.removeItem('pterolite_token');
          delete api.defaults.headers.common['Authorization'];
          setUser(null);
          setAuthToken(null);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        // Clear invalid session
        localStorage.removeItem('user');
        localStorage.removeItem('pterolite_token');
        delete api.defaults.headers.common['Authorization'];
        setUser(null);
        setAuthToken(null);
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Handle login
  const handleLogin = (userData, token) => {
    if (token) {
      localStorage.setItem('pterolite_token', token);
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    setAuthToken(token || 'authenticated');
    setAuthLoading(false);
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await api.post('/auth/logout', {}, { withCredentials: true });
    } catch (error) {
      console.error('Logout error:', error);
    }
    
    // Clear everything
    localStorage.removeItem('user');
    localStorage.removeItem('pterolite_token');
    localStorage.removeItem('selectedContainer');
    localStorage.removeItem('activeTab');
    delete api.defaults.headers.common['Authorization'];
    
    setUser(null);
    setAuthToken(null);
    setSelectedContainer(null);
    setShowContainerSelector(true);
    setActiveTab('files');
  };

  // Load saved state
  useEffect(() => {
    if (user) {
      const savedContainer = localStorage.getItem('selectedContainer');
      const savedTab = localStorage.getItem('activeTab');
      
      if (savedContainer) {
        try {
          setSelectedContainer(JSON.parse(savedContainer));
          setShowContainerSelector(false);
        } catch (e) {
          console.error('Failed to parse saved container:', e);
        }
      }
      
      if (savedTab) {
        setActiveTab(savedTab);
      }
    }
  }, [user]);

  // Save state when changed
  useEffect(() => {
    if (selectedContainer) {
      localStorage.setItem('selectedContainer', JSON.stringify(selectedContainer));
    }
  }, [selectedContainer]);

  useEffect(() => {
    if (activeTab) {
      localStorage.setItem('activeTab', activeTab);
    }
  }, [activeTab]);

  const handleContainerSelect = (container) => {
    setSelectedContainer(container);
    setShowContainerSelector(false);
  };

  const handleBackToSelector = () => {
    setShowContainerSelector(true);
    setSelectedContainer(null);
    localStorage.removeItem('selectedContainer');
  };

  const containerFolder = selectedContainer 
    ? `/tmp/pterolite-containers/${selectedContainer.Names[0].replace('/', '')}`
    : '/tmp/pterolite-files';

  // Show loading screen
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-white">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!user || !authToken) {
    return <Login onLogin={handleLogin} />;
  }

  // Show container selector
  if (showContainerSelector) {
    return <ContainerSelector onContainerSelect={handleContainerSelect} />;
  }

  // Main Dashboard
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-full mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            {/* Left - Dashboard Title */}
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-white">PteroLite Dashboard</h1>
              <p className="text-sm text-gray-400 ml-2">Server Management & Development Environment</p>
            </div>

            {/* Center - Current Server */}
            <div className="flex items-center space-x-4">
              <div className="text-center">
                <span className="text-sm text-gray-400">Current Server:</span>
                <div className="flex items-center space-x-3 mt-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-white font-medium text-lg">
                      {selectedContainer ? selectedContainer.Names[0].replace('/', '') : 'No Server'}
                    </span>
                    {selectedContainer && (
                      <span className="px-2 py-1 bg-green-600 text-xs rounded text-white font-medium">
                        RUNNING
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleBackToSelector}
                    className="px-4 py-2 bg-blue-600 text-sm rounded text-white hover:bg-blue-700 transition-colors font-medium border border-blue-500 hover:border-blue-400"
                  >
                    🔄 Change Server
                  </button>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Working Directory: {containerFolder}
                </div>
              </div>
            </div>

            {/* Right - Panel Info & User */}
            <div className="text-right">
              <div className="text-sm font-medium text-white">PteroLite Panel</div>
              <div className="flex items-center justify-end space-x-2 text-xs mb-1">
                <span className="text-green-400">Authenticated</span>
                <span className="px-2 py-1 bg-blue-600 rounded text-white">User: {user.username}</span>
              </div>
              <div className="flex items-center justify-end space-x-2">
                <button
                  onClick={handleLogout}
                  className="px-3 py-1 bg-red-600 text-xs rounded text-white hover:bg-red-700 transition-colors"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-full mx-auto px-6">
          <div className="flex space-x-8">
            {[
              { id: 'files', label: '📁 File Manager', icon: '📁' },
              { id: 'console', label: '💻 Console', icon: '💻' },
              { id: 'tunnels', label: '🌐 CF Tunnels', icon: '🌐' },
              { id: 'docker', label: '🐳 Docker Images', icon: '🐳' },
              { id: 'servers', label: '🖥️ My Servers', icon: '🖥️' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.id === 'servers') {
                    handleBackToSelector();
                  } else {
                    setActiveTab(tab.id);
                  }
                }}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-500'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-full mx-auto p-6">
        {activeTab === 'files' && (
          <FileManager 
            selectedContainer={selectedContainer} 
            containerFolder={containerFolder}
          />
        )}
        {activeTab === 'console' && (
          <Console 
            selectedContainer={selectedContainer} 
            containerFolder={containerFolder}
          />
        )}
        {activeTab === 'scripts' && (
          <ScriptExecutor 
            selectedContainer={selectedContainer} 
            containerFolder={containerFolder}
          />
        )}
        {activeTab === 'startup' && (
          <StartupManager 
            selectedContainer={selectedContainer} 
            containerFolder={containerFolder}
          />
        )}
        {activeTab === 'docker' && (
          <DockerImageManager 
            selectedContainer={selectedContainer} 
            containerFolder={containerFolder}
          />
        )}
        {activeTab === 'tunnels' && (
          <TunnelManager 
            selectedContainer={selectedContainer} 
            containerFolder={containerFolder}
          />
        )}
      </main>
    </div>
  );
}

export default App;

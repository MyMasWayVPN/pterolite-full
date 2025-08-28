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
    localStorage.setItem('activeTab', activeTab);
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
      <div className="min-h-screen bg-dark-primary flex items-center justify-center">
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
    return (
      <div className="min-h-screen bg-dark-primary">
        {/* Header */}
        <header className="bg-dark-secondary shadow-dark border-b border-dark">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <div className="flex items-center">
                <span className="text-2xl mr-3">🐳</span>
                <h1 className="text-xl font-bold text-white">PteroLite</h1>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-gray-300">Welcome, {user.username}</span>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </header>

        <ContainerSelector onContainerSelect={handleContainerSelect} />
      </div>
    );
  }

  // Show main dashboard
  return (
    <div className="min-h-screen bg-dark-primary">
      {/* Header */}
      <header className="bg-dark-secondary shadow-dark border-b border-dark">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <button
                onClick={handleBackToSelector}
                className="mr-4 px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                ← Back
              </button>
              <span className="text-2xl mr-3">🐳</span>
              <h1 className="text-xl font-bold text-white">PteroLite</h1>
              {selectedContainer && (
                <span className="ml-4 text-gray-300">
                  Container: {selectedContainer.Names[0].replace('/', '')}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-300">Welcome, {user.username}</span>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-dark-secondary border-b border-dark">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {[
              { id: 'files', label: '📁 Files', icon: '📁' },
              { id: 'console', label: '💻 Console', icon: '💻' },
              { id: 'scripts', label: '⚡ Scripts', icon: '⚡' },
              { id: 'startup', label: '🚀 Startup', icon: '🚀' },
              { id: 'docker', label: '🐳 Docker', icon: '🐳' },
              { id: 'tunnels', label: '🌐 Tunnels', icon: '🌐' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
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

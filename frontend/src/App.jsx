import { useEffect, useState } from 'react'
import { api } from './api.js'
import FileManager from './FileManager.jsx'
import Console from './Console.jsx'
import DockerImageManager from './DockerImageManager.jsx'
import ContainerSelector from './ContainerSelector.jsx'
import TunnelManager from './TunnelManager.jsx'
import Login from './Login.jsx'

export default function App() {
  const [containers, setContainers] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState(() => {
    // Restore saved active tab or default to 'files'
    return localStorage.getItem('activeTab') || 'files';
  })
  const [selectedContainer, setSelectedContainer] = useState(null)
  const [showContainerSelector, setShowContainerSelector] = useState(true)
  const [user, setUser] = useState(null)
  const [authToken, setAuthToken] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  // Check authentication status on app load
  useEffect(() => {
    let isMounted = true;
    
    const checkAuth = async () => {
      try {
        // First check if we have a token in localStorage
        const token = localStorage.getItem('pterolite_token');
        if (token) {
          // Set the authorization header
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        }
        
        // Configure api to always send cookies
        api.defaults.withCredentials = true;
        
        // Check authentication status
        const response = await api.get('/auth/status');
        
        if (isMounted) {
          if (response.data.authenticated) {
            setUser(response.data.user);
            setAuthToken(token || 'cookie-based');
            
            // Update saved user if different
            localStorage.setItem('user', JSON.stringify(response.data.user));
          } else {
            // Not authenticated, clear storage
            localStorage.removeItem('user');
            localStorage.removeItem('pterolite_token');
            delete api.defaults.headers.common['Authorization'];
            setUser(null);
            setAuthToken(null);
          }
          setAuthLoading(false);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        if (isMounted) {
          // Clear invalid session
          localStorage.removeItem('user');
          localStorage.removeItem('pterolite_token');
          delete api.defaults.headers.common['Authorization'];
          setUser(null);
          setAuthToken(null);
          setAuthLoading(false);
        }
      }
    };

    checkAuth();
    
    return () => {
      isMounted = false;
    };
  }, []); // Empty dependency array - only run once on mount

  // Handle login
  const handleLogin = (userData, token) => {
    // Store token in localStorage for persistence
    if (token) {
      localStorage.setItem('pterolite_token', token);
      // Set axios default authorization header
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    
    // Store user data
    localStorage.setItem('user', JSON.stringify(userData));
    
    setUser(userData);
    setAuthToken(token || 'cookie-based');
    setAuthLoading(false); // Ensure loading is false after login
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await api.post('/auth/logout', {}, { withCredentials: true });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear local storage and state
      localStorage.removeItem('user');
      localStorage.removeItem('pterolite_token');
      localStorage.removeItem('selectedContainer');
      localStorage.removeItem('activeTab');
      
      // Clear axios authorization header
      delete api.defaults.headers.common['Authorization'];
      
      setUser(null);
      setAuthToken(null);
      setSelectedContainer(null);
      setShowContainerSelector(true);
      setActiveTab('files');
    }
  };

  // Show loading screen while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen bg-dark-primary flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!user || !authToken) {
    return <Login onLogin={handleLogin} />;
  }

  // Listen for server selection event
  useEffect(() => {
    const handleContainerSelected = (event) => {
      setSelectedContainer(event.detail);
      setShowContainerSelector(false);
    };

    window.addEventListener('containerSelected', handleContainerSelected);
    return () => window.removeEventListener('containerSelected', handleContainerSelected);
  }, []);

  // Validate and restore saved container on mount
  useEffect(() => {
    const validateSavedContainer = async () => {
      const savedContainer = localStorage.getItem('selectedContainer');
      if (savedContainer) {
        try {
          const container = JSON.parse(savedContainer);
          
          // Fetch current containers to validate saved container
          try {
            const res = await api.get('/containers');
            const currentContainers = res.data;
            
            // Find the saved container in current containers
            const validContainer = currentContainers.find(c => c.Id === container.Id);
            
            if (validContainer) {
              // Update with current container data (status might have changed)
              setSelectedContainer(validContainer);
              setShowContainerSelector(false);
              localStorage.setItem('selectedContainer', JSON.stringify(validContainer));
            } else {
              // Container no longer exists, clear saved data
              console.warn('Saved container no longer exists, clearing selection');
              localStorage.removeItem('selectedContainer');
              setSelectedContainer(null);
              setShowContainerSelector(true);
            }
          } catch (apiError) {
            console.error('Failed to validate saved container:', apiError);
            // If API fails, still use saved container but show warning
            setSelectedContainer(container);
            setShowContainerSelector(false);
          }
        } catch (parseError) {
          console.error('Failed to parse saved container:', parseError);
          localStorage.removeItem('selectedContainer');
        }
      }
    };

    validateSavedContainer();
  }, []);

  // Save selected container to localStorage
  useEffect(() => {
    if (selectedContainer) {
      localStorage.setItem('selectedContainer', JSON.stringify(selectedContainer));
    }
  }, [selectedContainer]);

  // Save active tab to localStorage
  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  // Periodically refresh selected container data
  useEffect(() => {
    if (selectedContainer && !showContainerSelector) {
      const refreshContainer = async () => {
        try {
          const res = await api.get('/containers');
          const currentContainers = res.data;
          const updatedContainer = currentContainers.find(c => c.Id === selectedContainer.Id);
          
          if (updatedContainer) {
            // Only update if there are changes to avoid unnecessary re-renders
            if (JSON.stringify(updatedContainer) !== JSON.stringify(selectedContainer)) {
              setSelectedContainer(updatedContainer);
            }
          } else {
            // Container was deleted, show selector
            console.warn('Selected container was deleted, showing container selector');
            setSelectedContainer(null);
            setShowContainerSelector(true);
            localStorage.removeItem('selectedContainer');
          }
        } catch (error) {
          console.error('Failed to refresh container data:', error);
        }
      };

      // Refresh immediately and then every 30 seconds
      refreshContainer();
      const interval = setInterval(refreshContainer, 30000);
      
      return () => clearInterval(interval);
    }
  }, [selectedContainer, showContainerSelector]);
  
  const fetchContainers = async () => { 
    setLoading(true); 
    try { 
      const res = await api.get('/containers'); 
      setContainers(res.data) 
    } catch(e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }
  
  const startContainer = async (id) => { 
    await api.post('/containers/'+id+'/start'); 
    fetchContainers() 
  }
  
  const stopContainer = async (id) => { 
    await api.post('/containers/'+id+'/stop'); 
    fetchContainers() 
  }

  const handleChangeContainer = () => {
    setShowContainerSelector(true);
    setSelectedContainer(null);
    localStorage.removeItem('selectedContainer');
  };

  const getContainerFolder = (container) => {
    if (!container) return '/tmp/pterolite-files';
    const containerName = container.Names?.[0]?.replace('/', '') || container.Id.substring(0, 12);
    return `/tmp/pterolite-containers/${containerName}`;
  };
  
  useEffect(() => {
    if (activeTab === 'servers') {
      fetchContainers(); 
      const iv = setInterval(fetchContainers, 5000); 
      return () => clearInterval(iv)
    }
  }, [activeTab])

  // Show container selector if no container is selected
  if (showContainerSelector || !selectedContainer) {
    return (
      <ContainerSelector 
        onContainerSelect={setSelectedContainer}
        selectedContainer={selectedContainer}
      />
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'servers':
        return (
          <div className="bg-dark-secondary rounded-lg shadow-dark p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-white">My Servers</h2>
              <button 
                onClick={fetchContainers}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Refresh
              </button>
            </div>
            
            {loading ? (
              <p className="text-gray-300">Loading servers...</p>
            ) : containers.length === 0 ? (
              <p className="text-gray-400">No servers found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full table-auto">
                  <thead>
                    <tr className="bg-dark-tertiary">
                      <th className="px-4 py-2 text-left text-white">Name</th>
                      <th className="px-4 py-2 text-left text-white">Image</th>
                      <th className="px-4 py-2 text-left text-white">Status</th>
                      <th className="px-4 py-2 text-left text-white">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {containers.map((container) => (
                      <tr key={container.Id} className="border-t border-dark hover:bg-dark-tertiary transition-colors">
                        <td className="px-4 py-2 text-gray-300">
                          {container.Names?.[0]?.replace('/', '') || 'Unnamed'}
                        </td>
                        <td className="px-4 py-2 text-gray-300">{container.Image}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-1 rounded text-sm ${
                            container.State === 'running' 
                              ? 'bg-green-900 text-green-300 border border-green-700' 
                              : 'bg-red-900 text-red-300 border border-red-700'
                          }`}>
                            {container.State}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          {container.State === 'running' ? (
                            <button
                              onClick={() => stopContainer(container.Id)}
                              className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                            >
                              Stop
                            </button>
                          ) : (
                            <button
                              onClick={() => startContainer(container.Id)}
                              className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                            >
                              Start
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      case 'files':
        return <FileManager selectedContainer={selectedContainer} containerFolder={getContainerFolder(selectedContainer)} />
      case 'console':
        return <Console selectedContainer={selectedContainer} containerFolder={getContainerFolder(selectedContainer)} />
      case 'docker-images':
        return <DockerImageManager selectedContainer={selectedContainer} containerFolder={getContainerFolder(selectedContainer)} />
      case 'tunnels':
        return <TunnelManager selectedContainer={selectedContainer} containerFolder={getContainerFolder(selectedContainer)} />
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-dark-primary">
      <div className="container mx-auto">
        {/* Header */}
        <div className="bg-dark-secondary shadow-dark">
          <div className="px-4 py-4">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold text-white">PteroLite Dashboard</h1>
                <p className="text-gray-300 mt-1">Server Management & Development Environment</p>
              </div>
              <div className="flex items-center space-x-6">
                {/* Current Server Info */}
                {selectedContainer && (
                  <div className="text-right">
                    <div className="text-sm text-gray-300 mb-1">Current Server:</div>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-white">
                        {selectedContainer.Names?.[0]?.replace('/', '') || 'Unnamed'}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs ${
                        selectedContainer.State === 'running' 
                          ? 'bg-green-900 text-green-300 border border-green-700' 
                          : 'bg-red-900 text-red-300 border border-red-700'
                      }`}>
                        {selectedContainer.State}
                      </span>
                      <button
                        onClick={handleChangeContainer}
                        className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Change Server
                      </button>
                    </div>
                    <div className="text-xs text-dark-muted mt-1">
                      Folder: <code className="bg-dark-tertiary px-1 py-0.5 rounded text-dark-primary">{getContainerFolder(selectedContainer)}</code>
                    </div>
                  </div>
                )}
                
                {/* User Info */}
                <div className="text-right border-l border-dark pl-6">
                  <div className="text-sm text-gray-300 mb-1">Logged in as:</div>
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-white">{user.username}</span>
                    <span className="px-2 py-1 rounded text-xs bg-blue-900 text-blue-300 border border-blue-700">
                      {user.role || 'Admin'}
                    </span>
                    <button
                      onClick={handleLogout}
                      className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      Logout
                    </button>
                  </div>
                  <div className="text-xs text-dark-muted mt-1">
                    Secure authenticated session
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Navigation Tabs */}
          <div className="border-t border-dark">
            <nav className="flex space-x-8 px-4">
              {[
                { id: 'files', name: 'File Manager', icon: '📁' },
                { id: 'console', name: 'Console', icon: '💻' },
                { id: 'tunnels', name: 'CF Tunnels', icon: '🌐' },
                { id: 'docker-images', name: 'Docker Images', icon: '🐳' },
                { id: 'servers', name: 'My Servers', icon: '📋' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-400 text-blue-400'
                      : 'border-transparent text-dark-muted hover:text-dark-secondary hover:border-dark'
                  }`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.name}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {renderTabContent()}
        </div>
      </div>
    </div>
  )
}

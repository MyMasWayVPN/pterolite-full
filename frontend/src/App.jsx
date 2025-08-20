import { useEffect, useState } from 'react'
import { api } from './api.js'
import FileManager from './FileManager.jsx'
import Console from './Console.jsx'
import DockerImageManager from './DockerImageManager.jsx'
import ContainerSelector from './ContainerSelector.jsx'

export default function App() {
  const [containers, setContainers] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('files')
  const [selectedContainer, setSelectedContainer] = useState(null)
  const [showContainerSelector, setShowContainerSelector] = useState(true)
  
  // Listen for container selection event
  useEffect(() => {
    const handleContainerSelected = (event) => {
      setSelectedContainer(event.detail);
      setShowContainerSelector(false);
    };

    window.addEventListener('containerSelected', handleContainerSelected);
    return () => window.removeEventListener('containerSelected', handleContainerSelected);
  }, []);

  // Check if container is selected on mount
  useEffect(() => {
    const savedContainer = localStorage.getItem('selectedContainer');
    if (savedContainer) {
      try {
        const container = JSON.parse(savedContainer);
        setSelectedContainer(container);
        setShowContainerSelector(false);
      } catch (error) {
        console.error('Failed to parse saved container:', error);
      }
    }
  }, []);

  // Save selected container to localStorage
  useEffect(() => {
    if (selectedContainer) {
      localStorage.setItem('selectedContainer', JSON.stringify(selectedContainer));
    }
  }, [selectedContainer]);
  
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
    if (activeTab === 'containers') {
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
      case 'containers':
        return (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Docker Containers</h2>
              <button 
                onClick={fetchContainers}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Refresh
              </button>
            </div>
            
            {loading ? (
              <p>Loading containers...</p>
            ) : containers.length === 0 ? (
              <p className="text-gray-500">No containers found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full table-auto">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-2 text-left">Name</th>
                      <th className="px-4 py-2 text-left">Image</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {containers.map((container) => (
                      <tr key={container.Id} className="border-t">
                        <td className="px-4 py-2">
                          {container.Names?.[0]?.replace('/', '') || 'Unnamed'}
                        </td>
                        <td className="px-4 py-2">{container.Image}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-1 rounded text-sm ${
                            container.State === 'running' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {container.State}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          {container.State === 'running' ? (
                            <button
                              onClick={() => stopContainer(container.Id)}
                              className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                            >
                              Stop
                            </button>
                          ) : (
                            <button
                              onClick={() => startContainer(container.Id)}
                              className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
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
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto">
        {/* Header */}
        <div className="bg-white shadow-sm">
          <div className="px-4 py-4">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">PteroLite Dashboard</h1>
                <p className="text-gray-600 mt-1">Container Management & Development Environment</p>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-600 mb-1">Current Container:</div>
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-gray-900">
                    {selectedContainer.Names?.[0]?.replace('/', '') || 'Unnamed'}
                  </span>
                  <span className={`px-2 py-1 rounded text-xs ${
                    selectedContainer.State === 'running' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {selectedContainer.State}
                  </span>
                  <button
                    onClick={handleChangeContainer}
                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Change Container
                  </button>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Folder: <code>{getContainerFolder(selectedContainer)}</code>
                </div>
              </div>
            </div>
          </div>
          
          {/* Navigation Tabs */}
          <div className="border-t">
            <nav className="flex space-x-8 px-4">
              {[
                { id: 'files', name: 'File Manager', icon: '📁' },
                { id: 'console', name: 'Console', icon: '💻' },
                { id: 'docker-images', name: 'Docker Images', icon: '🐳' },
                { id: 'containers', name: 'All Containers', icon: '📋' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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

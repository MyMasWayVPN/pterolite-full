import { useState, useEffect } from 'react'
import { api } from './api.js'

export default function FileManager({ selectedContainer, containerFolder }) {
  const [files, setFiles] = useState([])
  const [currentPath, setCurrentPath] = useState(() => {
    // Try to restore saved path for this container, fallback to containerFolder
    const containerName = selectedContainer?.Names?.[0]?.replace('/', '') || 'default'
    const savedPath = localStorage.getItem(`fileManagerPath_${containerName}`)
    return savedPath || containerFolder || '/tmp/pterolite-files'
  })
  const [loading, setLoading] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileContent, setFileContent] = useState('')
  const [showEditor, setShowEditor] = useState(false)
  const [uploadFile, setUploadFile] = useState(null)
  const [containerName, setContainerName] = useState(null)
  const [containerBaseFolder, setContainerBaseFolder] = useState('/tmp/pterolite-files')

  // Get container name from selected container
  const getContainerName = () => {
    if (selectedContainer && selectedContainer.Names && selectedContainer.Names[0]) {
      return selectedContainer.Names[0].replace('/', '')
    }
    return null
  }

  const fetchFiles = async (path = currentPath) => {
    setLoading(true)
    try {
      const containerName = getContainerName()
      let url = `/files?path=${encodeURIComponent(path)}`
      if (containerName) {
        url += `&container=${encodeURIComponent(containerName)}`
      }
      
      const response = await api.get(url)
      setFiles(response.data.files)
      setCurrentPath(response.data.currentPath)
      setContainerName(response.data.containerName)
      setContainerBaseFolder(response.data.containerFolder)
    } catch (error) {
      console.error('Error fetching files:', error)
      if (error.response && error.response.status === 403) {
        alert('Access denied: ' + error.response.data.error)
      } else {
        alert('Error loading files: ' + error.message)
      }
    } finally {
      setLoading(false)
    }
  }

  const openFile = async (file) => {
    if (file.isDirectory) {
      fetchFiles(file.path)
      return
    }

    try {
      const containerName = getContainerName()
      let url = `/files/content?path=${encodeURIComponent(file.path)}`
      if (containerName) {
        url += `&container=${encodeURIComponent(containerName)}`
      }
      
      const response = await api.get(url)
      setFileContent(response.data.content)
      setSelectedFile(file)
      setShowEditor(true)
    } catch (error) {
      console.error('Error opening file:', error)
      if (error.response && error.response.status === 403) {
        alert('Access denied: ' + error.response.data.error)
      } else {
        alert('Error opening file: ' + error.message)
      }
    }
  }

  const saveFile = async () => {
    if (!selectedFile) return

    try {
      const containerName = getContainerName()
      await api.post('/files/save', {
        path: selectedFile.path,
        content: fileContent,
        container: containerName
      })
      alert('File saved successfully!')
      fetchFiles()
    } catch (error) {
      console.error('Error saving file:', error)
      if (error.response && error.response.status === 403) {
        alert('Access denied: ' + error.response.data.error)
      } else {
        alert('Error saving file: ' + error.message)
      }
    }
  }

  const deleteFile = async (file) => {
    if (!confirm(`Are you sure you want to delete ${file.name}?`)) return

    try {
      const containerName = getContainerName()
      let url = `/files?path=${encodeURIComponent(file.path)}`
      if (containerName) {
        url += `&container=${encodeURIComponent(containerName)}`
      }
      
      await api.delete(url)
      alert('File deleted successfully!')
      fetchFiles()
    } catch (error) {
      console.error('Error deleting file:', error)
      if (error.response && error.response.status === 403) {
        alert('Access denied: ' + error.response.data.error)
      } else {
        alert('Error deleting file: ' + error.message)
      }
    }
  }

  const uploadFileHandler = async (e) => {
    e.preventDefault()
    if (!uploadFile) return

    const formData = new FormData()
    formData.append('file', uploadFile)
    formData.append('targetPath', currentPath)
    
    const containerName = getContainerName()
    if (containerName) {
      formData.append('container', containerName)
    }

    try {
      const response = await api.post('/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      alert('File uploaded successfully!')
      setUploadFile(null)
      fetchFiles()

      // If it's a ZIP file, ask if user wants to extract it
      if (uploadFile.name.toLowerCase().endsWith('.zip')) {
        if (confirm('Do you want to extract this ZIP file?')) {
          await api.post('/files/extract', {
            zipPath: response.data.path,
            extractPath: currentPath,
            container: containerName
          })
          alert('ZIP file extracted successfully!')
          fetchFiles()
        }
      }
    } catch (error) {
      console.error('Error uploading file:', error)
      if (error.response && error.response.status === 403) {
        alert('Access denied: ' + error.response.data.error)
      } else {
        alert('Error uploading file: ' + error.message)
      }
    }
  }

  const createFolder = async () => {
    const folderName = prompt('Enter folder name:')
    if (!folderName) return

    try {
      const containerName = getContainerName()
      await api.post('/files/mkdir', {
        path: currentPath,
        name: folderName,
        container: containerName
      })
      alert('Folder created successfully!')
      fetchFiles()
    } catch (error) {
      console.error('Error creating folder:', error)
      if (error.response && error.response.status === 403) {
        alert('Access denied: ' + error.response.data.error)
      } else {
        alert('Error creating folder: ' + error.message)
      }
    }
  }

  const goUp = () => {
    // Prevent going above container base folder
    if (currentPath === containerBaseFolder) {
      alert('You cannot go above the container folder')
      return
    }
    
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/'
    
    // Double check that parent path is still within container folder
    if (containerBaseFolder && !parentPath.startsWith(containerBaseFolder)) {
      alert('Access denied: Cannot go outside container folder')
      return
    }
    
    fetchFiles(parentPath)
  }

  useEffect(() => {
    fetchFiles()
  }, [])

  // Update current path when container changes
  useEffect(() => {
    if (containerFolder && containerFolder !== currentPath) {
      setCurrentPath(containerFolder);
      fetchFiles(containerFolder);
    }
  }, [containerFolder]);

  // Save current path to localStorage when it changes
  useEffect(() => {
    const containerName = getContainerName() || 'default'
    if (currentPath && containerName) {
      localStorage.setItem(`fileManagerPath_${containerName}`, currentPath)
    }
  }, [currentPath, selectedContainer]);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4 text-white">📁 File Manager</h2>
      
      {/* Server Info & Current Path */}
      <div className="mb-4 p-3 bg-dark-secondary rounded-lg border border-dark">
        {selectedContainer && (
          <div className="mb-2">
            <strong className="text-white">Server:</strong> 
            <span className="ml-2 text-green-400">{selectedContainer.Names?.[0]?.replace('/', '') || 'Unknown'}</span>
            <span className="ml-2 text-gray-400">({selectedContainer.State})</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <strong className="text-white">Current Path:</strong> 
            <code className="ml-2 text-blue-400 bg-dark-tertiary px-2 py-1 rounded">{currentPath}</code>
          </div>
          <div className="flex space-x-2">
            {currentPath !== containerBaseFolder && (
              <button 
                onClick={goUp}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors"
              >
                ⬆️ Go Up
              </button>
            )}
            <button 
              onClick={createFolder}
              className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition-colors"
            >
              📁 New Folder
            </button>
          </div>
        </div>
        {containerBaseFolder !== '/tmp/pterolite-files' && (
          <div className="mt-2 text-sm text-yellow-400">
            🔒 Access restricted to: <code className="bg-dark-tertiary px-1 rounded">{containerBaseFolder}</code>
          </div>
        )}
      </div>

      {/* Upload Form */}
      <form onSubmit={uploadFileHandler} className="mb-6 p-4 bg-dark-secondary border border-dark rounded-lg">
        <h3 className="font-bold mb-3 text-white">📤 Upload File</h3>
        <input
          type="file"
          onChange={(e) => setUploadFile(e.target.files[0])}
          className="mb-3 w-full px-3 py-2 bg-dark-tertiary border border-dark text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={!uploadFile}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
        >
          Upload
        </button>
        <p className="text-sm text-gray-400 mt-2">
          💡 ZIP files will be automatically extracted if you choose to.
        </p>
      </form>

      {/* File List */}
      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading files...</p>
        </div>
      ) : (
        <div className="bg-dark-secondary border border-dark rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-dark-tertiary">
              <tr>
                <th className="text-left p-3 text-white font-medium">Name</th>
                <th className="text-left p-3 text-white font-medium">Size</th>
                <th className="text-left p-3 text-white font-medium">Modified</th>
                <th className="text-left p-3 text-white font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file, index) => (
                <tr key={index} className="border-t border-dark hover:bg-dark-tertiary transition-colors">
                  <td className="p-3">
                    <span className={file.isDirectory ? 'font-bold text-blue-400' : 'text-gray-300'}>
                      {file.isDirectory ? '📁' : '📄'} {file.name}
                    </span>
                  </td>
                  <td className="p-3 text-gray-300">
                    {file.isDirectory ? '-' : formatFileSize(file.size)}
                  </td>
                  <td className="p-3 text-gray-300">
                    {new Date(file.modified).toLocaleString()}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => openFile(file)}
                      className="px-3 py-1 bg-blue-600 text-white rounded text-sm mr-2 hover:bg-blue-700 transition-colors"
                    >
                      {file.isDirectory ? 'Open' : 'Edit'}
                    </button>
                    <button
                      onClick={() => deleteFile(file)}
                      className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition-colors"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* File Editor Modal */}
      {showEditor && selectedFile && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-dark-secondary border border-dark p-6 rounded-lg w-4/5 h-4/5 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">✏️ Editing: {selectedFile.name}</h3>
              <div>
                <button
                  onClick={saveFile}
                  className="px-4 py-2 bg-green-600 text-white rounded mr-2 hover:bg-green-700 transition-colors"
                >
                  💾 Save
                </button>
                <button
                  onClick={() => setShowEditor(false)}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                >
                  ✕ Close
                </button>
              </div>
            </div>
            <textarea
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              className="flex-1 w-full p-3 bg-dark-tertiary border border-dark text-white rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="File content..."
            />
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { setFiles, setLoadingFiles, setSelectedFile, clearSelectedFile, logout } from '../store/types'
import { apiFetch } from '../api'
import { useWebSocket } from '../api'

export function FileManagerPage() {
  const dispatch = useDispatch()
  const { files, isLoadingFiles, selectedFile, isAuthenticated } = useSelector((s) => s)
  const { connected, logs } = useWebSocket()

  const [currentPath, setCurrentPath] = useState('.')
  const [dirs, setDirs] = useState([])
  const [filesList, setFilesList] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [renameMode, setRenameMode] = useState(false)
  const [renamingPath, setRenamingPath] = useState('')
  const [newName, setNewName] = useState('')

  // Load files on mount
  useEffect(() => {
    ;(async () => {
      try {
        const result = await apiFetch(`/files?path=${currentPath}`)
        setFiles(result.path || currentPath, result.items || [])
        setError('')
      } catch (e) {
        setError(e.message)
      }
    })()
  }, [currentPath, dispatch])

  // WebSocket sync
  useEffect(() => {
    if (!connected) return
    ;(async () => {
      try {
        const result = await apiFetch(`/files?path=${currentPath}`)
        dispatch(setFiles(result.path || currentPath, result.items || []))
      } catch {}
    })()
  }, [connected, dispatch, currentPath])

  const refresh = async () => {
    setLoading(true)
    try {
      const result = await apiFetch(`/files?path=${currentPath}`)
      dispatch(setFiles(result.path || currentPath, result.items || []))
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleMkdir = async () => {
    if (!newName.trim()) return
    setLoading(true)
    try {
      await apiFetch('/files/mkdir', {
        method: 'POST',
        body: JSON.stringify({ path: `${currentPath}/${newName.trim()}` }),
      })
      setNewName('')
      refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async (name) => {
    if (!confirm(`Remove ${name}?`)) return
    setLoading(true)
    try {
      await apiFetch('/files/remove', {
        method: 'POST',
        body: JSON.stringify({ path: `${currentPath}/${name}` }),
      })
      refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRename = async () => {
    if (!renamingPath || !newName.trim()) return
    setLoading(true)
    try {
      await apiFetch('/files/rename', {
        method: 'POST',
        body: JSON.stringify({ fromPath: `${currentPath}/${renamingPath}`, toPath: `${currentPath}/${newName.trim()}` }),
      })
      setRenameMode(false)
      setRenamingPath('')
      setNewName('')
      refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      const blob = await file.arrayBuffer()
      const formData = new FormData()
      formData.append('dir', currentPath)
      formData.append('originalName', file.name)
      formData.append('base64', Buffer.from(blob).toString('base64'))
      await apiFetch('/files/upload', {
        method: 'POST',
        body: formData,
      })
      setUploadProgress(0)
      refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleFileClick = (item) => {
    const isDir = item.isDirectory
    if (isDir) {
      setCurrentPath(`${currentPath}/${item.name}`)
      setFilesList([])
      ;(async () => {
        try {
          await apiFetch(`/files?path=${currentPath}`)
        } catch {}
      })()
    } else {
      // Read file content
      ;(async () => {
        try {
          const result = await apiFetch(`/files/read?path=${currentPath}/${item.name}`)
          setSelectedFile({
            path: `${currentPath}/${item.name}`,
            name: item.name,
            content: result.content || '',
            size: result.size,
            isDirectory: false,
          })
        } catch (e) {
          setError(e.message)
        }
      })()
    }
  }

  const handleSelectionChange = (itemPath) => {
    setSelectedFile((prev) => {
      if (prev && prev.path === itemPath) return null
      return { path: itemPath, name: itemPath.split('/').pop(), content: '', size: 0, isDirectory: true }
    })
  }

  const handleLogout = () => {
    dispatch(logout())
  }

  return (
    <div className="file-manager">
      <h1>File Manager</h1>

      <div className="fm-toolbar">
        <span>Path: {currentPath}</span>
        <button className="btn btn-secondary" onClick={handleMkdir}>New Folder</button>
        <button className="btn btn-secondary" onClick={handleUpload}>
          Upload
          <input type="file" style={{ display: 'none' }} onChange={handleUpload} />
        </button>
        {renameMode && (
          <>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Rename to..."
            />
            <button className="btn btn-primary" onClick={handleRename}>Rename</button>
            <button className="btn" onClick={() => setRenameMode(false)}>Cancel</button>
          </>
        )}
        <button className="btn btn-danger" onClick={handleLogout}>Logout</button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="fm-content">
        <div className="fm-path-bar">
          {currentPath.split('/').filter(Boolean).map((part, i) => (
            <span key={i}>
              {part}{' '}
              {i < currentPath.split('/').filter(Boolean).length - 1 && '→'}
            </span>
          ))}
        </div>

        <div className="fm-grid">
          {loading ? (
            <p>Loading...</p>
          ) : filesList.length === 0 ? (
            <p>No files in {currentPath}</p>
          ) : (
            <ul>
              {filesList.map((item) => (
                <li key={item.name} className={selectedFile?.path === `${currentPath}/${item.name}` ? 'selected' : ''} onClick={() => handleFileClick(item)}>
                  <span>{item.name}</span>
                  {item.isDirectory && <span title="Folder">📁</span>}
                  {item.size && !item.isDirectory && <span title={`${item.size} bytes`}>📄</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Selected file editor */}
      {selectedFile && (
        <div className="fm-editor">
          <h3>{selectedFile.name}</h3>
          {selectedFile.isDirectory ? (
            <p>This is a folder</p>
          ) : (
            <textarea
              rows={10}
              cols={80}
              value={selectedFile.content || ''}
              onChange={(e) => {
                // Could add save handler
              }}
            />
            <div className="fm-editor-actions">
              <button className="btn btn-primary" onClick={() => {
                // Save changes
                if (selectedFile.content !== e.target.value) {
                  apiFetch('/files/write', {
                    method: 'POST',
                    body: JSON.stringify({ path: selectedFile.path, content: e.target.value })
                  }).then(() => refresh()).catch(e => console.error(e))
                }
              }}>
                Save
              </button>
              <button className="btn" onClick={() => {
                clearSelectedFile()
              }}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
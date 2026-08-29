import React, { useState, useEffect } from 'react';
import { FileInfo } from '../types';

export function FileBrowser() {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  useEffect(() => {
    fetchFiles();
  }, [currentPath]);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:3000/api/files' + (currentPath ? `?path=${encodeURIComponent(currentPath)}` : ''));
      const data = await response.json();
      setFiles(data);
    } catch (error) {
      console.error('Failed to fetch files:', error);
    }
    setLoading(false);
  };

  const handleFileClick = (file: FileInfo) => {
    if (file.type === 'directory') {
      setCurrentPath(file.path);
    } else {
      setEditingFile(file.path);
      readFile(file.path);
    }
  };

  const readFile = async (path: string) => {
    try {
      const response = await fetch('http://localhost:3000/api/files/' + encodeURIComponent(path));
      const data = await response.json();
      setEditContent(data.content || '');
    } catch (error) {
      console.error('Failed to read file:', error);
      setEditContent('');
    }
  };

  const handleSave = async () => {
    if (editingFile) {
      try {
        await fetch('http://localhost:3000/api/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: editingFile, content: editContent })
        });
        setEditingFile(null);
      } catch (error) {
        console.error('Failed to save file:', error);
      }
    }
  };

  const handleDelete = async (path: string) => {
    if (window.confirm('Delete this file?')) {
      try {
        await fetch('http://localhost:3000/api/files/' + encodeURIComponent(path), {
          method: 'DELETE'
        });
        fetchFiles();
        setEditingFile(null);
      } catch (error) {
        console.error('Failed to delete file:', error);
      }
    }
  };

  const goUp = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    setCurrentPath(parts.join('/'));
  };

  const formatSize = (size: number) => {
    if (size === 0) return '-';
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
    return (size / 1024 / 1024).toFixed(1) + ' MB';
  };

  return (
    <div className="file-browser">
      <div className="file-header">
        <h2>File Browser</h2>
        <div className="file-path">
          <button onClick={() => setCurrentPath('')}>/</button>
          {currentPath.split('/').map((part, i, arr) => (
            <span key={i}>/{part}</span>
          ))}
        </div>
      </div>

      <div className="file-list">
        {currentPath && (
          <div className="file-item" onClick={() => goUp()}>
            <span className="file-name">..</span>
          </div>
        )}
        
        {loading ? (
          <div className="file-item">Loading...</div>
        ) : files.length === 0 ? (
          <div className="file-item">Empty directory</div>
        ) : (
          files.map(file => (
            <div 
              key={file.path} 
              className="file-item" 
              onClick={() => handleFileClick(file)}
            >
              <span className={`file-type ${file.type}`}>
                {file.type === 'directory' ? '📁' : '📄'}
              </span>
              <span className="file-name">{file.name}</span>
              <span className="file-size">{formatSize(file.size)}</span>
            </div>
          ))
        )}
      </div>

      {editingFile && (
        <div className="file-editor">
          <div className="file-editor-header">
            <h3>{editingFile}</h3>
            <div className="file-editor-actions">
              <button onClick={handleSave}>Save</button>
              <button onClick={() => setEditingFile(null)}>Close</button>
            </div>
          </div>
          
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="file-editor-text"
          />
        </div>
      )}
    </div>
  );
}
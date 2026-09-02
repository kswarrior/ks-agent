import { useState } from 'react';
import { FileNode } from '../types';

interface FilesProps {
  files?: FileNode[];
}

export function Files({ files = [] }: FilesProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const renderFile = (file: FileNode, parentPath = '') => {
    const path = parentPath ? `${parentPath}/${file.name}` : file.name;
    const isExpanded = expanded.has(path);

    return (
      <div key={path} style={{ marginLeft: parentPath ? '24px' : '0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
          {file.type === 'directory' && (
            <button
              className="btn"
              onClick={() => {
                if (isExpanded) {
                  const newSet = new Set(expanded);
                  newSet.delete(path);
                  setExpanded(newSet);
                } else {
                  const newSet = new Set(expanded);
                  newSet.add(path);
                  setExpanded(newSet);
                }
              }}
            >
              {isExpanded ? '📂' : '📁'}
            </button>
          )}
          {file.type === 'file' && <span>📄</span>}
          <span style={{ fontSize: '0.85rem' }}>{file.name}</span>
          {file.size && <span style={{ color: 'var(--text-faint)', fontSize: '0.75rem' }}>({(file.size / 1024).toFixed(1)} KB)</span>}
        </div>
        {file.type === 'directory' && isExpanded && file.children && (
          <div>{renderFiles(file.children, path)}</div>
        )}
      </div>
    );
  };

  const renderFiles = (files: FileNode[], parentPath = '') => {
    return files.map((file) => renderFile(file, parentPath)).sort((a, b) => {
      const aName = a.key as string;
      const bName = b.key as string;
      const aDir = a.props?.children ? true : false;
      const bDir = b.props?.children ? true : false;
      if (aDir && !bDir) return -1;
      if (!aDir && bDir) return 1;
      return aName.localeCompare(bName);
    });
  };

  return (
    <div className="card">
      <h2>File Browser</h2>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '8px' }}>
        Navigate server files using the tree below
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
        {files.length === 0 ? (
          <p>No files available</p>
        ) : (
          renderFiles(files)
        )}
      </div>
    </div>
  );
}
import React, { useEffect, useState } from 'react'
import { ServerStatus } from '../types/server'

interface ServerRowProps {
  status: ServerStatus
  onToggle: (id: string) => void
}

export const ServersTable: React.FC<ServerRowProps> = ({ status, onToggle }) => {
  const [isRunning, setIsRunning] = useState(false)

  useEffect(() => {
    setIsRunning(status.ready)
  }, [status.ready])

  return (
    <tr>
      <td>{status.message}</td>
      <td>
        {status.ready ? (
          <span className="badge bg-success">Online</span>
        ) : (
          <span className="badge bg-danger">Offline</span>
        )}
      </td>
      <td>
        <button
          className="btn btn-sm btn-outline-primary"
          onClick={() => onToggle('server-1')}
          disabled={isRunning}
        >
          {isRunning ? 'Stop' : 'Start'}
        </button>
      </td>
    </tr>
  )
}
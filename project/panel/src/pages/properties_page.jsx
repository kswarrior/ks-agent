import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { setPropLoading, updateProperties } from '../types.js'
import { apiFetch } from '../api'

export function PropertiesPage() {
  const dispatch = useDispatch()
  const { properties, propertiesLoading } = useSelector((s) => s)
  const [editing, setEditing] = useState(false)
  const [currentContent, setCurrentContent] = useState('')

  // Load server.properties on mount
  useEffect(() => {
    ;(async () => {
      dispatch(setPropLoading(true))
      try {
        const result = await apiFetch('/properties')
        setCurrentContent(result.content || '')
        dispatch(updateProperties(result, false))
      } catch (e) {
        dispatch(updateProperties({ error: e.message }), false)
      } finally {
        dispatch(setPropLoading(false))
      }
    })()
  }, [dispatch])

  const handleSave = async () => {
    dispatch(setPropLoading(true))
    try {
      await apiFetch('/properties', {
        method: 'POST',
        body: JSON.stringify({ content: currentContent }),
      })
      dispatch(updateProperties({ content: currentContent }, false))
      setEditing(false)
    } catch (e) {
      dispatch(updateProperties({ error: e.message }), false)
    } finally {
      dispatch(setPropLoading(true))
    }
  }

  const handleCancel = () => {
    setEditing(false)
    setCurrentContent(currentContent)
  }

  if (propertiesLoading) {
    return (
      <div className="properties-page">
        <h1>Server Properties</h1>
        <p>Loading...</p>
      </div>
    )
  }

  if (properties.error) {
    return (
      <div className="properties-page">
        <h1>Server Properties</h1>
        <div className="error">{properties.error}</div>
      </div>
    )
  }

  return (
    <div className="properties-page">
      <h1>Server Properties</h1>

      <div className="card">
        <h2>server.properties</h2>
        <p style={{ color: '#889bb6', marginBottom: '12px' }}>
          Modify the server configuration below. Changes will take effect after restarting the server.
        </p>

        {editing ? (
          <textarea
            rows={20}
            cols={80}
            value={currentContent}
            onChange={(e) => setCurrentContent(e.target.value)}
            style={{ fontFamily: 'monospace', width: '100%' }}
          />
        ) : (
          <pre style={{ 
            background: '#1a252f', 
            padding: '16px', 
            borderRadius: '6px', 
            overflow: 'auto',
            fontSize: '13px',
            maxHeight: '400px'
          }}>
            {currentContent}
          </pre>
        )}

        <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
          {editing && (
            <>
              <button className="btn btn-primary" onClick={handleSave}>
                Save
              </button>
              <button className="btn" onClick={handleCancel}>
                Cancel
              </button>
            </>
          )}
          {!editing && (
            <button className="btn btn-primary" onClick={() => setEditing(true)}>
              Edit Properties
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: '24px' }}>
        <h2>Quick Settings</h2>
        <p style={{ color: '#889bb6', marginBottom: '12px' }}>
          Common server settings can be edited in the editor above.
        </p>
        <ul style={{ color: '#b3c1d2', paddingLeft: '20px' }}>
          <li>server-name - The name of your server</li>
          <li>motd - Message of the day shown to players</li>
          <li>max-players - Maximum number of online players</li>
          <li>difficulty - 0: peaceful, 1: easy, 2: normal, 3: hard</li>
          <li>gamemode - 0: survival, 1: creative, 2: adventure, 3: spectator</li>
          <li>online-mode - Set to true for online mode (requires internet)</li>
        </ul>
      </div>
    </div>
  )
}
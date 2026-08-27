import { useState, useMemo, useRef, useEffect } from 'react'
import type { Activity } from '../types'
import { IconActivity, IconFile, IconTerminal, IconEdit, IconPlus, IconChevronDown, IconCheck, IconX, IconRotate } from '../icons'

type FilterKey = Activity['toolType'] | 'all'

function getToolLabel(type: Activity['toolType']): string {
  switch (type) {
    case 'read_file':
      return 'Read'
    case 'write_file':
      return 'Write'
    case 'edit_file':
      return 'Edit'
    case 'run_shell':
      return 'Shell'
    case 'list_files':
      return 'List'
    case 'create_plan':
      return 'Plan'
    case 'complete_plan_step':
      return 'Step'
    case 'ask_question':
      return 'Ask'
    default:
      return type
  }
}

function getToolBadgeStyle(type: Activity['toolType']): { bg: string; color: string; border: string } {
  switch (type) {
    case 'read_file':
      return { bg: '#60a5fa1a', color: '#60a5fa', border: '#60a5fa30' }
    case 'write_file':
      return { bg: '#86efac1a', color: '#86efac', border: '#86efac30' }
    case 'edit_file':
      return { bg: '#facc151a', color: '#facc15', border: '#facc1530' }
    case 'run_shell':
      return { bg: '#c084fc1a', color: '#c084fc', border: '#c084fc30' }
    case 'list_files':
      return { bg: '#9ca3af1a', color: '#9ca3af', border: '#9ca3af30' }
    case 'create_plan':
      return { bg: '#f973161a', color: '#f97316', border: '#f9731630' }
    case 'complete_plan_step':
      return { bg: '#86efac1a', color: '#86efac', border: '#86efac30' }
    case 'ask_question':
      return { bg: '#f472b61a', color: '#f472b6', border: '#f472b630' }
    default:
      return { bg: '#1a1a1a', color: '#9a9a9a', border: '#252525' }
  }
}

function getToolIcon(type: Activity['toolType']) {
  switch (type) {
    case 'read_file':
      return <IconFile size={12} />
    case 'write_file':
      return <IconPlus size={12} />
    case 'edit_file':
      return <IconEdit size={12} />
    case 'run_shell':
      return <IconTerminal size={12} />
    case 'list_files':
      return <IconFile size={12} />
    case 'create_plan':
      return <IconActivity size={12} />
    case 'complete_plan_step':
      return <IconCheck size={12} />
    case 'ask_question':
      return <IconActivity size={12} />
    default:
      return <IconActivity size={12} />
  }
}

function getCommandDisplay(type: Activity['toolType'], args: Record<string, unknown>): string {
  switch (type) {
    case 'read_file':
      return (args.path as string) || ''
    case 'write_file':
      return (args.path as string) || ''
    case 'edit_file':
      return (args.path as string) || ''
    case 'run_shell':
      return (args.command as string) || ''
    case 'list_files':
      return (args.path as string) || '.'
    case 'create_plan':
      return (args.title as string) || ''
    case 'complete_plan_step':
      return `step ${args.index}`
    case 'ask_question':
      return (args.question as string) || (args.header as string) || ''
    default:
      return ''
  }
}

function getResultDisplay(activity: Activity): string {
  if (activity.result) return activity.result
  return activity.summary || ''
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return ts
  }
}

export function ActivityPane({ activities }: { activities: Activity[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  const sortedActivities = useMemo(
    () => [...activities].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [activities]
  )

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: activities.length }
    for (const a of activities) c[a.toolType] = (c[a.toolType] || 0) + 1
    return c
  }, [activities])

  const filtered = useMemo(() => {
    if (filter === 'all') return sortedActivities
    return sortedActivities.filter((a) => a.toolType === filter)
  }, [sortedActivities, filter])

  // Dropdown options: All, Write, Read, Edit, Shell — per latest request (write/read/shell etc) + List for explore
  const dropdownFilters: Array<{ key: FilterKey; label: string; count: number }> = useMemo(() => {
    return [
      { key: 'all' as FilterKey, label: 'All', count: counts.all || 0 },
      { key: 'write_file' as FilterKey, label: 'Write', count: counts['write_file'] || 0 },
      { key: 'read_file' as FilterKey, label: 'Read', count: counts['read_file'] || 0 },
      { key: 'edit_file' as FilterKey, label: 'Edit', count: counts['edit_file'] || 0 },
      { key: 'run_shell' as FilterKey, label: 'Shell', count: counts['run_shell'] || 0 },
    ]
  }, [counts])

  const activeFilterLabel = useMemo(() => {
    const found = dropdownFilters.find((f) => f.key === filter)
    return found ? found.label : getToolLabel(filter as Activity['toolType'])
  }, [filter, dropdownFilters])

  const activeFilterCount = useMemo(() => {
    const found = dropdownFilters.find((f) => f.key === filter)
    return found ? found.count : filtered.length
  }, [filter, dropdownFilters, filtered.length])

  useEffect(() => {
    if (!dropdownOpen) return
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDropdownOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [dropdownOpen])

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  if (sortedActivities.length === 0) {
    return (
      <div className="activity-pane">
        <div className="rsb-empty" style={{ flexDirection: 'column', gap: 10, padding: '24px 12px', textAlign: 'center' }}>
          <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            <span className="act-empty-pill" style={{ background: '#60a5fa1a', color: '#60a5fa', border: '1px solid #60a5fa30' }}>Read</span>
            <span className="act-empty-pill" style={{ background: '#86efac1a', color: '#86efac', border: '1px solid #86efac30' }}>Write</span>
            <span className="act-empty-pill" style={{ background: '#facc151a', color: '#facc15', border: '1px solid #facc1530' }}>Edit</span>
            <span className="act-empty-pill" style={{ background: '#c084fc1a', color: '#c084fc', border: '1px solid #c084fc30' }}>Shell</span>
          </span>
          <span>No activity yet</span>
          <span style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.5 }}>Write, Edit, Read, Shell, List<br />events will appear here live</span>
        </div>
      </div>
    )
  }

  return (
    <div className="activity-pane">
      <div className="activity-summary">
        <span className="activity-summary-count">
          {activities.length} event{activities.length !== 1 ? 's' : ''}
        </span>

        <div className="act-dropdown" ref={dropdownRef}>
          <button
            className="act-dropdown-btn"
            aria-haspopup="menu"
            aria-expanded={dropdownOpen}
            onClick={() => setDropdownOpen((v) => !v)}
          >
            <span className="act-dropdown-label">{activeFilterLabel}</span>
            <span className="act-dropdown-count">{activeFilterCount}</span>
            <IconChevronDown size={12} style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease', flexShrink: 0 }} />
          </button>
          {dropdownOpen && (
            <div className="act-dropdown-menu" role="menu" aria-label="Filter activity">
              {dropdownFilters.map((f) => {
                const isActive = filter === f.key
                return (
                  <button
                    key={f.key}
                    role="menuitem"
                    className={`act-dropdown-item${isActive ? ' active' : ''}`}
                    onClick={() => {
                      setFilter(f.key)
                      setDropdownOpen(false)
                    }}
                  >
                    <span className="act-dropdown-item-label">{f.label}</span>
                    <span className="act-dropdown-item-count">{f.count}</span>
                    {isActive && <IconCheck size={12} style={{ marginLeft: 4, flexShrink: 0 }} />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="activity-list">
        {filtered.length === 0 ? (
          <div className="rsb-empty" style={{ padding: '16px 0', fontSize: 13 }}>No {filter !== 'all' ? getToolLabel(filter as Activity['toolType']) : ''} events</div>
        ) : (
          filtered.map((activity) => {
            const label = getToolLabel(activity.toolType)
            const badgeStyle = getToolBadgeStyle(activity.toolType)
            const commandDisplay = getCommandDisplay(activity.toolType, activity.args)
            const isExpanded = expandedId === activity.id
            const resultDisplay = getResultDisplay(activity)

            return (
              <div key={activity.id} className="activity-item">
                <button className={`activity-row${isExpanded ? ' expanded' : ''}`} onClick={() => toggleExpand(activity.id)}>
                  <span
                    className="activity-badge"
                    style={{ background: badgeStyle.bg, color: badgeStyle.color, borderColor: badgeStyle.border }}
                    title={label}
                  >
                    <span className="activity-badge-icon">{getToolIcon(activity.toolType)}</span>
                    <span className="activity-badge-label">{label}</span>
                  </span>
                  <span className="activity-args" title={commandDisplay}>{commandDisplay}</span>
                  <span className="activity-status">
                    {activity.ok === false ? (
                      <span className="act-status-icon error"><IconX size={10} /></span>
                    ) : activity.ok === true ? (
                      <span className="act-status-icon ok"><IconCheck size={10} /></span>
                    ) : (
                      <span className="act-status-icon running"><IconRotate size={10} className="spin" /></span>
                    )}
                  </span>
                  <span className="activity-chevron">
                    <IconChevronDown size={12} style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }} />
                  </span>
                </button>
                {isExpanded && (
                  <div className="activity-detail">
                    <div className="activity-detail-header">
                      <span className="activity-detail-time">{formatTime(activity.timestamp)}</span>
                      <span className={`activity-detail-status${activity.ok === false ? ' error' : activity.ok === true ? ' ok' : ' running'}`}>
                        {activity.ok === false ? 'Error' : activity.ok === true ? 'Success' : 'Running'}
                      </span>
                    </div>
                    {commandDisplay && (
                      <div className="activity-detail-section">
                        <strong>{activity.toolType === 'run_shell' ? 'Command' : activity.toolType === 'ask_question' ? 'Question' : 'Path'}</strong>
                        <pre className={activity.toolType === 'run_shell' ? 'activity-terminal-command' : ''}>{activity.toolType === 'run_shell' ? `$ ${commandDisplay}` : commandDisplay}</pre>
                      </div>
                    )}
                    {resultDisplay && (
                      <div className="activity-detail-section">
                        <strong>Output</strong>
                        {activity.toolType === 'run_shell' ? (
                          <pre className="activity-terminal-output">{resultDisplay}</pre>
                        ) : (
                          <pre>{resultDisplay}</pre>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

import { useState } from 'react'
import type { Activity } from '../types'
import { IconActivity, IconFile, IconTerminal, IconEdit, IconPlus, IconX, IconChevronDown, IconRotate, IconCheck } from '../icons'

function getToolLabel(type: Activity['toolType']): string {
  switch (type) {
    case 'read_file':
      return 'read'
    case 'write_file':
      return 'write'
    case 'edit_file':
      return 'edit'
    case 'run_shell':
      return 'shell'
    case 'list_files':
      return 'list'
    case 'create_plan':
      return 'plan'
    case 'complete_plan_step':
      return 'step'
    default:
      return type
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
    default:
      return <IconActivity size={12} />
  }
}

function getCommandDisplay(type: Activity['toolType'], args: Record<string, unknown>): string {
  switch (type) {
    case 'read_file':
      return args.path as string || ''
    case 'write_file':
      return args.path as string || ''
    case 'edit_file':
      return args.path as string || ''
    case 'run_shell':
      return args.command as string || ''
    case 'list_files':
      return args.path as string || '.'
    case 'create_plan':
      return args.title as string || ''
    case 'complete_plan_step':
      return `step ${args.index}`
    default:
      return ''
  }
}

function getResultDisplay(activity: Activity): string {
  if (activity.result) {
    return activity.result
  }
  return activity.summary || ''
}

export function ActivityPane({ activities }: { activities: Activity[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const sortedActivities = [...activities].sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  if (sortedActivities.length === 0) {
    return <div className="rsb-empty">No activity yet</div>
  }

  return (
    <div className="activity-pane">
      <div className="activity-list">
        {sortedActivities.map((activity) => {
          const label = getToolLabel(activity.toolType)
          const commandDisplay = getCommandDisplay(activity.toolType, activity.args)
          const isExpanded = expandedId === activity.id
          const resultDisplay = getResultDisplay(activity)

          return (
            <div key={activity.id} className="activity-item">
              <button
                className={`activity-row${isExpanded ? ' expanded' : ''}`}
                onClick={() => toggleExpand(activity.id)}
              >
                <span className="activity-icon">
                  {getToolIcon(activity.toolType)}
                </span>
                <span className="activity-label">
                  {label}
                </span>
                <span className="activity-args">{commandDisplay}</span>
                <span className="activity-chevron">
                  <IconChevronDown size={12} style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                </span>
              </button>
              {isExpanded && (
                <div className="activity-detail">
                  <div className="activity-detail-header">
                    <span className="activity-detail-time">
                      {new Date(activity.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={`activity-detail-status${activity.ok === false ? ' error' : ''}`}>
                      {activity.ok === false ? 'Error' : activity.ok === true ? 'Success' : 'Running'}
                    </span>
                  </div>
                  {commandDisplay && (
                    <div className="activity-detail-section">
                      <strong>Command</strong>
                      <pre>{commandDisplay}</pre>
                    </div>
                  )}
                  {resultDisplay && (
                    <div className="activity-detail-section">
                      <strong>Result</strong>
                      <pre>{resultDisplay}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
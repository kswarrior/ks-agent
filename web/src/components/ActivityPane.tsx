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
    case 'grep':
      return 'Grep'
    case 'glob':
      return 'Glob'
    case 'create_plan':
      return 'Plan'
    case 'complete_plan_step':
      return 'Step'
    case 'ask_question':
      return 'Ask'
    case 'open_preview':
      return 'Preview'
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
    case 'grep':
      return { bg: '#38bdf81a', color: '#38bdf8', border: '#38bdf830' }
    case 'glob':
      return { bg: '#a78bfa1a', color: '#a78bfa', border: '#a78bfa30' }
    case 'create_plan':
      return { bg: '#f973161a', color: '#f97316', border: '#f9731630' }
    case 'complete_plan_step':
      return { bg: '#86efac1a', color: '#86efac', border: '#86efac30' }
    case 'ask_question':
      return { bg: '#f472b61a', color: '#f472b6', border: '#f472b630' }
    case 'open_preview':
      return { bg: '#22c55e1a', color: '#22c55e', border: '#22c55e30' }
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
    case 'grep':
      return <IconFile size={12} />
    case 'glob':
      return <IconFile size={12} />
    case 'create_plan':
      return <IconActivity size={12} />
    case 'complete_plan_step':
      return <IconCheck size={12} />
    case 'ask_question':
      return <IconActivity size={12} />
    case 'open_preview':
      return <IconActivity size={12} />
    default:
      return <IconActivity size={12} />
  }
}

function getCommandDisplay(type: Activity['toolType'], args: Record<string, unknown>): string {
  switch (type) {
    case 'read_file':
      return (args.path as string) ? `${args.path as string}${args.offset ? `:${args.offset}` : ''}${args.limit ? `+${args.limit}` : ''}` : ''
    case 'write_file':
      return (args.path as string) || ''
    case 'edit_file':
      return (args.path as string) || ''
    case 'grep':
      return (args.pattern as string) ? `${args.pattern as string}${args.include ? ` in ${args.include}` : ''}` : ''
    case 'glob':
      return (args.pattern as string) || ''
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
    case 'open_preview':
      return args.port ? `:${args.port}` : ''
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const HL_KEYWORDS: Record<string, string[]> = {
  javascript: ['break','case','catch','class','const','continue','debugger','default','delete','do','else','export','extends','false','finally','for','function','if','import','in','instanceof','let','new','null','return','super','switch','this','throw','true','try','typeof','var','void','while','with','yield','await','async','static','get','set','of','from','as'],
  typescript: ['break','case','catch','class','const','continue','debugger','default','delete','do','else','export','extends','false','finally','for','function','if','import','in','instanceof','let','new','null','return','super','switch','this','throw','true','try','typeof','var','void','while','with','yield','await','async','static','get','set','of','from','as','implements','interface','package','private','protected','public','enum','type','namespace','module','declare','abstract','readonly','keyof','infer','unknown','any','never','string','number','boolean'],
  python: ['and','as','assert','break','class','continue','def','del','elif','else','except','False','finally','for','from','global','if','import','in','is','lambda','None','nonlocal','not','or','pass','raise','return','True','try','while','with','yield','async','await'],
  tsx: ['break','case','catch','class','const','continue','debugger','default','delete','do','else','export','extends','false','finally','for','function','if','import','in','instanceof','let','new','null','return','super','switch','this','throw','true','try','typeof','var','void','while','with','yield','await','async','static','get','set','of','from','as'],
  jsx: ['break','case','catch','class','const','continue','debugger','default','delete','do','else','export','extends','false','finally','for','function','if','import','in','instanceof','let','new','null','return','super','switch','this','throw','true','try','typeof','var','void','while','with','yield','await','async','static','get','set','of','from','as'],
}

function getLangFromPath(p: string): string {
  const ext = p.split('.').pop()?.toLowerCase() ?? ''
  if (['ts','mts','cts'].includes(ext)) return 'typescript'
  if (['tsx'].includes(ext)) return 'tsx'
  if (['js','mjs','cjs'].includes(ext)) return 'javascript'
  if (['jsx'].includes(ext)) return 'jsx'
  if (['py'].includes(ext)) return 'python'
  if (['css','scss','less'].includes(ext)) return 'css'
  if (['json'].includes(ext)) return 'json'
  if (['html','htm'].includes(ext)) return 'html'
  return 'typescript'
}

function highlightLine(line: string, lang: string): string {
  if (!line) return ''
  const placeholders: string[] = []
  const store = (s: string, cls: string) => {
    const token = `__HL_${placeholders.length}__`
    placeholders.push(`<span class="${cls}">${escapeHtml(s)}</span>`)
    return token
  }
  let w = line
  // strings
  w = w.replace(/`(?:\\.|[^`\\])*`/g, m => store(m, 'hl-string'))
  w = w.replace(/"(?:\\.|[^"\\])*"/g, m => store(m, 'hl-string'))
  w = w.replace(/'(?:\\.|[^'\\])*'/g, m => store(m, 'hl-string'))
  w = w.replace(/\/\/.*$/g, m => store(m, 'hl-comment'))
  w = w.replace(/\/\*.*\*\//g, m => store(m, 'hl-comment'))
  w = w.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const kws = HL_KEYWORDS[lang]
  if (kws && kws.length) {
    const pat = new RegExp(`\\b(${kws.join('|')})\\b`, 'g')
    w = w.replace(pat, '<span class="hl-keyword">$1</span>')
  }
  w = w.replace(/\b(\d+(\.\d+)?)\b/g, '<span class="hl-number">$1</span>')
  placeholders.forEach((html, i) => {
    const token = `__HL_${i}__`
    w = w.split(token).join(html)
  })
  return w
}

function CodeWithLineNumbers({ code, startLine = 1, variant = 'default', lang = 'typescript' }: { code: string; startLine?: number; variant?: 'default' | 'old' | 'new'; lang?: string }) {
  const lines = code.split('\n')
  const maxShow = 300
  const displayLines = lines.length > maxShow ? lines.slice(0, maxShow) : lines
  const truncated = lines.length > maxShow
  const bg = variant === 'old' ? '#fef2f2' : variant === 'new' ? '#f0fdf4' : 'var(--input)'
  const border = variant === 'old' ? '#fecaca' : variant === 'new' ? '#bbf7d0' : 'var(--border)'
  const gutterBg = variant === 'default' ? 'var(--surface-2)' : variant === 'old' ? '#fee2e2' : '#dcfce7'
  const gutterColor = variant === 'default' ? 'var(--text-faint)' : variant === 'old' ? '#b91c1c' : '#15803d'
  return (
    <div style={{ display: 'flex', border: `1px solid ${border}`, borderRadius: 6, overflow: 'auto', background: bg, maxHeight: 260, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 11.5, lineHeight: 1.5 }}>
      <div style={{ background: gutterBg, borderRight: `1px solid ${border}`, padding: '6px 6px', textAlign: 'right', color: gutterColor, userSelect: 'none', fontSize: 11, lineHeight: 1.5, minWidth: 36, flexShrink: 0, position: 'sticky', left: 0 }}>
        {displayLines.map((_, i) => (
          <div key={i} style={{ lineHeight: 1.5, whiteSpace: 'nowrap' }}>{startLine + i}</div>
        ))}
        {truncated && <div style={{ color: gutterColor, fontStyle: 'italic' }}>…</div>}
      </div>
      <div style={{ flex: 1, minWidth: 0, padding: '6px 10px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5, overflow: 'visible' }}>
        {displayLines.map((line, i) => (
          <div key={i} style={{ lineHeight: 1.5, minHeight: '1.5em' }} dangerouslySetInnerHTML={{ __html: line ? highlightLine(line, lang) : '<br>' }} />
        ))}
        {truncated && <div style={{ color: 'var(--text-faint)', fontStyle: 'italic', marginTop: 6 }}>…[{lines.length - maxShow} more lines not shown]</div>}
      </div>
    </div>
  )
}

function isSkillReadActivity(a: Activity): boolean {
  if (a.toolType !== 'read_file') return false
  if (a.ok === false) return false
  const raw = String((a.args as any)?.path ?? '').toLowerCase().trim()
  if (!raw) return false
  const norm = raw.replace(/^\.\//, '').replace(/^\//, '').replace(/^skills\//, '').replace(/^\.skills\//, '')
  const base = norm.split('/').pop() || norm
  const knownBases = new Set(['skill.md', 'frontend.md', 'react.md', 'ts.md', 'ejs.md', 'testing.md', 'debugging.md', 'refactoring.md', 'code-review.md'])
  if (knownBases.has(base)) return true
  if (norm.includes('skill') && norm.endsWith('.md')) return true
  if (norm.startsWith('frontend/') && norm.endsWith('.md')) return true
  if (raw.includes('frontend/skill.md') || raw.includes('frontend/react.md') || raw.includes('frontend/ts.md') || raw.includes('frontend/ejs.md')) return true
  return false
}

function getSkillDisplayName(rawPath: string): string {
  const raw = String(rawPath ?? '').trim()
  const norm = raw.replace(/^\.\//, '').replace(/^\//, '').replace(/^skills\//, '').toLowerCase()
  if (norm === 'frontend/skill.md') return 'Frontend'
  if (norm === 'frontend/react.md') return 'Frontend React'
  if (norm === 'frontend/ts.md') return 'Frontend TS'
  if (norm === 'frontend/ejs.md') return 'Frontend EJS'
  if (norm === 'testing.md') return 'Testing'
  if (norm === 'debugging.md') return 'Debugging'
  if (norm === 'refactoring.md') return 'Refactoring'
  if (norm === 'code-review.md') return 'Code Review'
  if (norm.endsWith('skill.md')) {
    const base = norm.split('/').pop()?.replace('.md','') || norm
    return base.charAt(0).toUpperCase() + base.slice(1)
  }
  // fallback: show normalized path
  return raw.replace(/^skills\//,'').replace(/^\.\//,'')
}

export function ActivityPane({ activities }: { activities: Activity[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const [skillOpen, setSkillOpen] = useState(false)
  const skillRef = useRef<HTMLDivElement | null>(null)

  // Derive skill activities and visible (non-skill) activities
  const skillActivities = useMemo(() => activities.filter(isSkillReadActivity), [activities])

  const distinctSkills = useMemo(() => {
    const map = new Map<string, { display: string; raw: string; count: number; lastTs: string }>()
    for (const a of skillActivities) {
      const raw = String((a.args as any)?.path ?? '').trim()
      const norm = raw.replace(/^\.\//, '').replace(/^\//, '').replace(/^skills\//, '').toLowerCase()
      const key = norm || raw.toLowerCase()
      const display = getSkillDisplayName(raw)
      const existing = map.get(key)
      if (existing) {
        existing.count += 1
        if (new Date(a.timestamp).getTime() > new Date(existing.lastTs).getTime()) existing.lastTs = a.timestamp
      } else {
        map.set(key, { display, raw: raw.replace(/^skills\//,''), count: 1, lastTs: a.timestamp })
      }
    }
    // sort by lastTs desc
    return Array.from(map.values()).sort((a,b) => new Date(b.lastTs).getTime() - new Date(a.lastTs).getTime())
  }, [skillActivities])

  const visibleActivities = useMemo(() => {
    const sorted = [...activities].filter(a => !isSkillReadActivity(a)).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    return sorted
  }, [activities])

  const sortedVisible = visibleActivities

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: visibleActivities.length }
    for (const a of visibleActivities) c[a.toolType] = (c[a.toolType] || 0) + 1
    return c
  }, [visibleActivities])

  const filtered = useMemo(() => {
    if (filter === 'all') return sortedVisible
    return sortedVisible.filter((a) => a.toolType === filter)
  }, [sortedVisible, filter])

  const dropdownFilters: Array<{ key: FilterKey; label: string; count: number }> = useMemo(() => {
    return [
      { key: 'all' as FilterKey, label: 'All', count: counts.all || 0 },
      { key: 'write_file' as FilterKey, label: 'Write', count: counts['write_file'] || 0 },
      { key: 'read_file' as FilterKey, label: 'Read', count: counts['read_file'] || 0 },
      { key: 'edit_file' as FilterKey, label: 'Edit', count: counts['edit_file'] || 0 },
      { key: 'run_shell' as FilterKey, label: 'Shell', count: counts['run_shell'] || 0 },
      { key: 'open_preview' as FilterKey, label: 'Preview', count: counts['open_preview'] || 0 },
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

  useEffect(() => {
    if (!skillOpen) return
    function onClickOutside(e: MouseEvent) {
      if (skillRef.current && !skillRef.current.contains(e.target as Node)) {
        setSkillOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSkillOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [skillOpen])

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  const skillButton = (
    <div className="act-dropdown" ref={skillRef} style={{ position: 'relative' }}>
      <button
        className="btn btn-primary"
        style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, lineHeight: 1 }}
        aria-haspopup="menu"
        aria-expanded={skillOpen}
        onClick={() => setSkillOpen(v => !v)}
      >
        <span>Skills</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, padding: '0 5px', background: 'rgba(255,255,255,0.22)', borderRadius: 99, fontSize: 11, fontWeight: 800 }}>{distinctSkills.length}</span>
        <IconChevronDown size={12} style={{ transform: skillOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease', flexShrink: 0 }} />
      </button>
      {skillOpen && (
        <div className="act-dropdown-menu" role="menu" aria-label="Skills used" style={{ minWidth: 220, right: 0 }}>
          {distinctSkills.length === 0 ? (
            <div style={{ padding: '12px 10px', fontSize: 13, color: 'var(--text-faint)', textAlign: 'center' }}>No skills used yet</div>
          ) : (
            distinctSkills.map((s) => (
              <div key={s.raw} className="act-dropdown-item" style={{ cursor: 'default', justifyContent: 'space-between' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#86efac', flexShrink: 0, boxShadow: '0 0 6px rgba(134,239,172,0.6)' }} />
                  <span className="act-dropdown-item-label" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.display}</span>
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)' }} title={s.raw}>{s.raw}</span>
                  <span className="act-dropdown-item-count">{s.count}</span>
                </span>
              </div>
            ))
          )}
          {distinctSkills.length > 0 && (
            <div style={{ padding: '6px 10px 4px', fontSize: 11, color: 'var(--text-faint)', borderTop: '1px solid var(--border)', marginTop: 4 }}>
              {skillActivities.length} skill read{skillActivities.length !== 1 ? 's' : ''} total — hidden from activity list
            </div>
          )}
        </div>
      )}
    </div>
  )

  if (sortedVisible.length === 0) {
    return (
      <div className="activity-pane">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          {skillButton}
        </div>
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
          {visibleActivities.length} event{visibleActivities.length !== 1 ? 's' : ''}
        </span>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          {skillButton}
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
                    {activity.toolType === 'edit_file' && (
                      <>
                        {(() => {
                          const oldStr = String((activity.args as any)?.old_string ?? (activity.args as any)?.oldString ?? '')
                          const newStr = String((activity.args as any)?.new_string ?? (activity.args as any)?.newString ?? '')
                          const isReplaceAll = !!(activity.args as any)?.replace_all
                          const isAddition = !oldStr.trim()
                          const filePath = String((activity.args as any)?.path ?? '')
                          const lang = getLangFromPath(filePath)
                          return (
                            <>
                              <div className="activity-detail-section">
                                <strong>Old {isReplaceAll ? '(replace all)' : ''}{isAddition ? ' — empty (addition)' : ''}</strong>
                                {oldStr ? (
                                  <CodeWithLineNumbers code={oldStr} startLine={1} variant={isAddition ? 'default' : 'old'} lang={lang} />
                                ) : (
                                  <div style={{ padding: '6px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic' }}>(empty — new addition)</div>
                                )}
                              </div>
                              <div className="activity-detail-section">
                                <strong>New</strong>
                                {newStr ? (
                                  <CodeWithLineNumbers code={newStr} startLine={1} variant="new" lang={lang} />
                                ) : (
                                  <div style={{ padding: '6px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic' }}>(empty)</div>
                                )}
                              </div>
                            </>
                          )
                        })()}
                      </>
                    )}
                    {activity.toolType === 'write_file' && (() => {
                      const content = String((activity.args as any)?.content ?? '')
                      if (!content) return null
                      const filePath = String((activity.args as any)?.path ?? '')
                      const lang = getLangFromPath(filePath)
                      return (
                        <div className="activity-detail-section">
                          <strong>Content</strong>
                          <CodeWithLineNumbers code={content} startLine={1} variant="default" lang={lang} />
                        </div>
                      )
                    })()}
                    {activity.toolType === 'read_file' && (() => {
                      const offset = Number((activity.args as any)?.offset ?? (activity.args as any)?.start ?? 1) || 1
                      const raw = resultDisplay || ''
                      const firstNL = raw.indexOf('\n')
                      let content = firstNL >= 0 ? raw.slice(firstNL + 1) : ''
                      // strip truncation footers
                      const truncIdx = content.indexOf('\n\n…[')
                      if (truncIdx >= 0) content = content.slice(0, truncIdx)
                      const trunc2 = content.indexOf('\n\n…[slice')
                      if (trunc2 >= 0) content = content.slice(0, trunc2)
                      content = content.replace(/\n\n\[fallback: read from.*\]$/s, '').trimEnd()
                      if (!content || /^(file not found|binary file|is a directory|file too large)/i.test(content.trim())) return null
                      const filePath = String((activity.args as any)?.path ?? '')
                      const lang = getLangFromPath(filePath)
                      return (
                        <div className="activity-detail-section">
                          <strong>Content {offset !== 1 ? `(lines ${offset}–${offset + content.split('\n').length - 1})` : ''}</strong>
                          <CodeWithLineNumbers code={content} startLine={offset} variant="default" lang={lang} />
                        </div>
                      )
                    })()}
                    {resultDisplay && activity.toolType !== 'edit_file' && activity.toolType !== 'write_file' && activity.toolType !== 'read_file' && (
                      <div className="activity-detail-section">
                        <strong>Output</strong>
                        {activity.toolType === 'run_shell' ? (
                          <pre className="activity-terminal-output">{resultDisplay}</pre>
                        ) : (
                          <pre>{resultDisplay}</pre>
                        )}
                      </div>
                    )}
                    {resultDisplay && (activity.toolType === 'edit_file' || activity.toolType === 'write_file') && (
                      <div className="activity-detail-section">
                        <strong>Result</strong>
                        <pre style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontFamily: 'ui-monospace, monospace', fontSize: 11.5, color: 'var(--text-dim)', maxHeight: 120, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{resultDisplay}</pre>
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

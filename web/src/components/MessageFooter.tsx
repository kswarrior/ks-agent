import { useEffect, useRef, useState } from 'react'
import { formatDuration } from '../format'
import type { ModelEntry } from '../types'

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  )
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }
  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.top = '-1000px'
  field.style.opacity = '0'
  document.body.appendChild(field)
  field.select()
  const copied = document.execCommand('copy')
  field.remove()
  if (!copied) throw new Error('Copy failed')
}

export function MessageFooter({
  content,
  model,
  modelId,
  durationMs
}: {
  content: string
  model?: ModelEntry
  modelId?: string | null
  durationMs?: number | null
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)
  const duration = typeof durationMs === 'number' ? formatDuration(durationMs) : ''
  const modelName = model?.name || modelId || ''
  const providerName = model?.providerName ?? ''

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [])

  const copy = async () => {
    try {
      await copyText(content)
      setCopied(true)
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="msg-footer">
      <button
        type="button"
        className={`msg-footer-copy ${copied ? 'copied' : ''}`}
        onClick={() => void copy()}
        aria-label={copied ? 'Copied to clipboard' : 'Copy message'}
        title={copied ? 'Copied' : 'Copy'}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
      <div className="msg-footer-meta">
        {providerName && <span className="msg-footer-provider">{providerName}</span>}
        {modelName && (
          <span className="msg-footer-model" title={model?.modelId || modelName}>
            {modelName}
          </span>
        )}
        {duration && <span className="msg-footer-time">{duration}</span>}
      </div>
    </div>
  )
}

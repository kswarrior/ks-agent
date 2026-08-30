import { memo, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getText())
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 1200)
    } catch {}
  }

  return (
    <button className="copy-btn" onClick={handleCopy}>
      {copied ? 'copied' : 'copy'}
    </button>
  )
}

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => {
            const text = String(children)
            const match = /language-(\w+)/.exec(className || '')
            if (!match && !text.includes('\n')) return <code className={className}>{children}</code>
            return (
              <>
                <div className="code-head">
                  <span>{match?.[1] || 'code'}</span>
                  <CopyButton getText={() => text.replace(/\n$/, '')} />
                </div>
                <pre>
                  <code className={className}>{children}</code>
                </pre>
              </>
            )
          },
          a: ({ href, children }) => {
            const safeHref = (() => {
              if (!href) return '#'
              const h = String(href).trim()
              if (/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(h)) return h
              if (/^javascript:/i.test(h) || /^data:/i.test(h) || /^vbscript:/i.test(h)) return '#'
              // allow relative without protocol
              if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(h)) return h
              return '#'
            })()
            return (
              <a href={safeHref} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            )
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})

import { memo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="copy-btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(getText())
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        } catch {}
      }}
    >
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
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})

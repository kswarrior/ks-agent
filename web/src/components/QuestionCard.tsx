import { useState } from 'react'
import type { Question } from '../types'
import { IconSend, IconCheck } from '../icons'

interface Props {
  question: Question
  onAnswer: (id: string, answer: string) => Promise<void>
}

export function QuestionCard({ question, onAnswer }: Props) {
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pending = question.status === 'pending'

  async function handleOption(opt: string) {
    if (!pending || busy) return
    setBusy(true)
    setError(null)
    try {
      await onAnswer(question.id, opt)
    } catch (e: any) {
      setError(e.message || 'Failed to answer')
    } finally {
      setBusy(false)
    }
  }

  async function handleCustom() {
    const val = custom.trim()
    if (!val || !pending || busy) return
    if (val.length > 2000) {
      setError('Answer too long')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onAnswer(question.id, val)
      setCustom('')
    } catch (e: any) {
      setError(e.message || 'Failed to answer')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`q-card${pending ? ' pending' : ' answered'}`}>
      <div className="q-head">
        <span className="q-header" title={question.header}>{question.header}</span>
        {pending ? <span className="q-badge">Needs answer</span> : <span className="q-badge done"><IconCheck size={11} /> Answered</span>}
      </div>
      <p className="q-question">{question.question}</p>

      {question.options.length > 0 && (
        <div className="q-options">
          {question.options.map((opt) => {
            const isSelected = !pending && question.answer === opt
            return (
              <button
                key={opt}
                className={`q-opt${isSelected ? ' selected' : ''}`}
                onClick={() => handleOption(opt)}
                disabled={!pending || busy}
                title={opt}
              >
                {opt}
              </button>
            )
          })}
        </div>
      )}

      {pending && question.allowCustom && (
        <div className="q-custom">
          <input
            className="input q-custom-input"
            placeholder={question.customPlaceholder || 'Type custom answer…'}
            value={custom}
            onChange={(e) => { setCustom(e.target.value); setError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCustom() } }}
            disabled={busy}
          />
          <button className="btn btn-primary q-custom-send" onClick={handleCustom} disabled={busy || !custom.trim()} aria-label="Send answer" title="Send answer">
            <IconSend size={14} />
          </button>
        </div>
      )}

      {!pending && question.answer && (
        <div className="q-answer">
          <span className="q-answer-label">Your answer:</span>
          <span className="q-answer-text">{question.answer}</span>
        </div>
      )}

      {error && <p className="field-error">{error}</p>}
      {pending && <p className="q-hint">Choose an option or type a custom answer</p>}
    </div>
  )
}

export function QuestionList({ questions, onAnswer }: { questions: Question[]; onAnswer: (id: string, answer: string) => Promise<void> }) {
  if (questions.length === 0) return null
  return (
    <div className="q-list">
      {questions.map((q) => (
        <QuestionCard key={q.id} question={q} onAnswer={onAnswer} />
      ))}
    </div>
  )
}

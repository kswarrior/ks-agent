import { useEffect, useMemo, useState } from 'react'
import type { Question } from '../types'

interface CardProps {
  question: Question
  index: number
  total: number
  canGoBack: boolean
  onBack: () => void
  onConfirm: (answer: string) => Promise<void>
}

function SingleQuestionCard({ question, index, total, canGoBack, onBack, onConfirm }: CardProps) {
  const [selected, setSelected] = useState<string | null>(() => {
    if (question.status === 'answered' && question.selectedOption) return question.selectedOption
    if (question.status === 'answered' && question.answer && question.options.includes(question.answer)) {
      return question.answer
    }
    return null
  })
  const [custom, setCustom] = useState(() => {
    if (question.status === 'answered' && question.answer && !question.options.includes(question.answer)) {
      return question.answer
    }
    return ''
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (question.status === 'answered') {
      if (question.selectedOption) setSelected(question.selectedOption)
      else if (question.answer && question.options.includes(question.answer)) setSelected(question.answer)
      else setSelected(null)
      if (question.answer && !question.options.includes(question.answer)) setCustom(question.answer)
      else setCustom('')
    } else {
      setSelected(null)
      setCustom('')
    }
    setError(null)
    setBusy(false)
  }, [question.id, question.status, question.answer, question.selectedOption])

  const pending = question.status === 'pending'
  const customTrim = custom.trim()
  const hasCustom = question.allowCustom && customTrim.length > 0
  const hasSelection = selected !== null
  const canConfirm = !busy && (hasCustom || hasSelection)
  const chosenAnswer = hasCustom ? customTrim : (selected ?? '')

  async function handleConfirm() {
    const ans = chosenAnswer.trim()
    if (!ans) {
      setError('Please select an option or type an answer')
      return
    }
    if (ans.length > 2000) {
      setError('Answer too long')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onConfirm(ans)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit answer')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`q-card ${pending ? 'pending' : 'answered'}`}>
      <div className="q-head">
        <span className="q-header" title={question.header}>{question.header}</span>
        <span className="q-progress">[{index + 1}/{total}]</span>
        {pending && <span className="q-badge">waiting</span>}
        {!pending && <span className="q-badge done">answered</span>}
      </div>
      <p className="q-question">{question.question}</p>

      {question.options.length > 0 && (
        <div className="q-options">
          {question.options.map((opt, idx) => {
            const isSelected = selected === opt
            return (
              <button
                key={`${idx}:${opt}`}
                className={`q-opt${isSelected ? ' selected' : ''}`}
                onClick={() => {
                  setSelected(opt)
                  setError(null)
                }}
                disabled={busy}
                title={opt}
              >
                {opt}
              </button>
            )
          })}
        </div>
      )}

      {question.allowCustom && (
        <div className="q-custom">
          <input
            className="input q-custom-input"
            placeholder={question.customPlaceholder || 'Type custom answer…'}
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value)
              if (e.target.value.trim()) setSelected(null)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (canConfirm) void handleConfirm()
              }
            }}
            disabled={busy}
          />
        </div>
      )}

      {question.status === 'answered' && question.answer && !pending && (
        <p className="q-answer-line">
          Answer: <strong>{question.answer}</strong>
        </p>
      )}

      {error && <p className="field-error">{error}</p>}
      {pending && <p className="q-hint">Choose an option or type a custom answer</p>}

      <div className="q-actions">
        {canGoBack ? (
          <button className="btn" onClick={onBack} disabled={busy}>
            ← Back
          </button>
        ) : (
          <span />
        )}
        {pending && (
          <button className="btn btn-primary" onClick={() => void handleConfirm()} disabled={!canConfirm}>
            {busy ? 'Saving…' : 'Confirm'}
          </button>
        )}
      </div>
    </div>
  )
}

export function QuestionList({
  questions,
  onAnswer
}: {
  questions: Question[]
  onAnswer: (id: string, answer: string) => Promise<void>
}) {
  const sorted = useMemo(() => [...questions].sort((a, b) => a.createdAt - b.createdAt), [questions])
  const total = sorted.length
  const pending = sorted.filter((q) => q.status === 'pending')
  const firstPendingIdx = sorted.findIndex((q) => q.status === 'pending')
  const [currentIdx, setCurrentIdx] = useState(() => (firstPendingIdx >= 0 ? firstPendingIdx : 0))

  useEffect(() => {
    if (currentIdx >= total) setCurrentIdx(Math.max(0, total - 1))
  }, [total, currentIdx])

  if (total === 0 || pending.length === 0) return null

  const current = sorted[currentIdx]
  if (!current) return null

  const canGoBack = currentIdx > 0
  const handleBack = () => {
    if (currentIdx > 0) setCurrentIdx(currentIdx - 1)
  }

  const handleConfirm = async (answer: string) => {
    const curIdx = currentIdx
    await onAnswer(current.id, answer)
    let nextIdx = -1
    for (let i = curIdx + 1; i < sorted.length; i++) {
      if (sorted[i].status === 'pending') {
        nextIdx = i
        break
      }
    }
    if (nextIdx === -1) {
      for (let i = 0; i < curIdx; i++) {
        if (sorted[i].status === 'pending') {
          nextIdx = i
          break
        }
      }
    }
    if (nextIdx >= 0) setCurrentIdx(nextIdx)
  }

  return (
    <div className="q-list">
      <SingleQuestionCard
        key={current.id}
        question={current}
        index={currentIdx}
        total={total}
        canGoBack={canGoBack}
        onBack={handleBack}
        onConfirm={handleConfirm}
      />
    </div>
  )
}

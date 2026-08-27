import { useEffect, useState } from 'react'
import type { Question } from '../types'
import { IconSend, IconChevronLeft } from '../icons'

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
    // if already answered and selectedOption matches, pre-select
    if (question.status === 'answered' && question.selectedOption) return question.selectedOption
    if (question.status === 'answered' && question.answer && question.options.includes(question.answer)) return question.answer
    return null
  })
  const [custom, setCustom] = useState(() => {
    if (question.status === 'answered' && question.answer && !question.options.includes(question.answer)) return question.answer
    return ''
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // when question changes (navigating), reset local state to reflect its current answer
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
  // For answered questions viewed via Back, we still allow changing, so treat as editable
  const editable = true

  const customTrim = custom.trim()
  const hasCustom = question.allowCustom && customTrim.length > 0
  const hasSelection = selected !== null
  const canConfirm = editable && !busy && (hasCustom || hasSelection) && (pending || hasCustom || hasSelection)

  // Determine the answer to submit: custom takes precedence if non-empty and allowCustom, otherwise selected
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
    } catch (e: any) {
      setError(e.message || 'Failed to submit answer')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`q-card pending`}>
      <div className="q-head">
        <span className="q-header" title={question.header}>{question.header}</span>
        <span className="q-progress">[{index + 1}/{total}]</span>
      </div>
      <p className="q-question">{question.question}</p>

      {question.options.length > 0 && (
        <div className="q-options">
          {question.options.map((opt) => {
            const isSelected = selected === opt
            return (
              <button
                key={opt}
                className={`q-opt${isSelected ? ' selected' : ''}`}
                onClick={() => { setSelected(opt); setError(null) }}
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
            onChange={(e) => { setCustom(e.target.value); if (e.target.value.trim()) setSelected(null); setError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (canConfirm) handleConfirm() } }}
            disabled={busy}
          />
        </div>
      )}

      {error && <p className="field-error">{error}</p>}
      <p className="q-hint">Choose an option or type a custom answer</p>

      <div className="q-actions">
        {canGoBack ? (
          <button className="btn" onClick={onBack} disabled={busy}>
            <IconChevronLeft size={14} /> Back
          </button>
        ) : <span />}
        <button className="btn btn-primary" onClick={handleConfirm} disabled={!canConfirm}>
          {busy ? 'Saving…' : 'Confirm'}
        </button>
      </div>
    </div>
  )
}

export function QuestionList({ questions, onAnswer }: { questions: Question[]; onAnswer: (id: string, answer: string) => Promise<void> }) {
  const sorted = [...questions].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const total = sorted.length
  if (total === 0) return null

  const pending = sorted.filter(q => q.status === 'pending')
  if (pending.length === 0) return null

  const firstPendingIdx = sorted.findIndex(q => q.status === 'pending')
  const [currentIdx, setCurrentIdx] = useState<number>(() => (firstPendingIdx >= 0 ? firstPendingIdx : 0))

  // Keep currentIdx valid when total changes or when current becomes out of bounds
  useEffect(() => {
    if (currentIdx >= total) setCurrentIdx(Math.max(0, total - 1))
    // If currentIdx points to a question that no longer exists, jump to first pending
    if (currentIdx < total && sorted[currentIdx] == null) {
      const next = sorted.findIndex(q => q.status === 'pending')
      if (next >= 0) setCurrentIdx(next)
    }
    // If there was no pending before but now there is (new question added), jump to it if current is not pending
    if (pending.length > 0 && sorted[currentIdx]?.status !== 'pending') {
      // Don't auto-jump if user intentionally went Back to an answered question to edit.
      // Only auto-jump if the current question was the one that just got answered and we are still on it.
      // We detect this by checking if the current question's previous status was pending and now answered.
      // For simplicity, we don't auto-jump here; navigation is handled explicitly in handleConfirm
    }
  }, [total, currentIdx, sorted])

  // Ensure initial current points to first pending when component first mounts or when a new batch arrives and current is answered
  // This is handled by the initial state, and handleConfirm will advance

  const current = sorted[currentIdx]
  if (!current) return null

  const canGoBack = currentIdx > 0
  const handleBack = () => {
    if (currentIdx > 0) setCurrentIdx(currentIdx - 1)
  }

  const handleConfirm = async (answer: string) => {
    const curIdx = currentIdx
    await onAnswer(current.id, answer)
    // After answering, move to next pending (card gone)
    // Find next pending after curIdx in the *current* sorted snapshot where cur is now considered answered
    // Since onAnswer will cause parent to update questions to answered, we compute next based on the assumption that current will be answered
    let nextIdx = -1
    for (let i = curIdx + 1; i < sorted.length; i++) {
      // current will be answered, so skip it; look for next pending
      if (sorted[i].status === 'pending') { nextIdx = i; break }
    }
    if (nextIdx === -1) {
      // wrap around to first pending before curIdx
      for (let i = 0; i < curIdx; i++) if (sorted[i].status === 'pending') { nextIdx = i; break }
    }
    if (nextIdx >= 0) {
      setCurrentIdx(nextIdx)
    } else {
      // No more pending after this answer - check if there are other pendings that were not after curIdx
      // The current question just became answered, so pending will be empty next render and wizard will disappear (cards gone)
      // Keep currentIdx as is; next render will return null because pending.length===0
    }
  }

  // If current is answered and user arrived via Back, we still show it (editable). The progress shows [idx+1/total]
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

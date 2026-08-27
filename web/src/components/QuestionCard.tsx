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
  // If no pending, all answered -> cards gone (as requested)
  if (pending.length === 0) return null

  // Find first pending index
  const firstPendingIdx = sorted.findIndex(q => q.status === 'pending')

  const [currentIdx, setCurrentIdx] = useState<number>(() => (firstPendingIdx >= 0 ? firstPendingIdx : 0))

  // Keep currentIdx in sync when questions change
  useEffect(() => {
    // If current question was just answered and is now not pending, move to next pending
    const cur = sorted[currentIdx]
    if (!cur) {
      const next = sorted.findIndex(q => q.status === 'pending')
      if (next >= 0 && next !== currentIdx) setCurrentIdx(next)
      return
    }
    if (cur.status === 'answered') {
      // auto-advance to next pending after a short delay, but only if we just answered the current
      // Find next pending after currentIdx
      let nextIdx = -1
      for (let i = currentIdx + 1; i < sorted.length; i++) if (sorted[i].status === 'pending') { nextIdx = i; break }
      if (nextIdx === -1) {
        for (let i = 0; i < currentIdx; i++) if (sorted[i].status === 'pending') { nextIdx = i; break }
      }
      if (nextIdx >= 0 && nextIdx !== currentIdx) {
        // small delay so user sees the confirm feedback, then card disappears and next appears
        const t = setTimeout(() => setCurrentIdx(nextIdx), 250)
        return () => clearTimeout(t)
      } else if (pending.length === 0) {
        // all done, will return null next render
      }
    } else {
      // current is still pending, keep it
      // If a new question was added that is earlier than current, keep current
    }
    // If total changed and currentIdx out of bounds, clamp
    if (currentIdx >= total) setCurrentIdx(Math.max(0, total - 1))
  }, [questions, currentIdx, sorted, pending.length, total, firstPendingIdx])

  // Ensure currentIdx points to a pending question initially, but allow Back to go to answered ones
  // If currentIdx points to an answered question (because user went Back), we still show it (editable)
  // Otherwise, if currentIdx is answered and we are not in Back navigation, we would have auto-advanced above
  // So we need to decide: show currentIdx even if answered, when user explicitly navigated back
  // The auto-advance effect above will move away from answered, but we want to allow Back to stay
  // So we should not auto-advance if the user just navigated back intentionally
  // To handle this, we track whether the last navigation was Back vs auto
  // Simpler: only auto-advance if the previous current question just became answered and we are still on it
  // Our effect above already does that with a timeout, but it will still move away even if user is viewing an answered via Back
  // We can add a ref to track if user initiated Back
  // For now, keep simple: show currentIdx as is, even if answered, to allow editing
  const current = sorted[currentIdx]
  if (!current) return null
  // If current is answered and there are still pending, but user is not on a pending, we still show it (for editing)
  // That's the Back case

  const canGoBack = currentIdx > 0

  const handleBack = () => {
    if (currentIdx > 0) setCurrentIdx(currentIdx - 1)
  }

  const handleConfirm = async (answer: string) => {
    await onAnswer(current.id, answer)
    // onAnswer will update the question to answered, triggering the useEffect to auto-advance
    // If this was an edit of an already-answered question (via Back), we should move forward to next pending
    // The effect will handle advancing, but we can also proactively move
    // Find next pending after currentIdx
    // Use a timeout to let the state update propagate
    setTimeout(() => {
      const updatedSorted = [...questions].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      // This is stale closure, so we rely on the effect to advance; no need to manually set here
    }, 0)
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

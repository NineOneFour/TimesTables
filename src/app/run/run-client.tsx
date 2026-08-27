'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import ReferenceTable, {
  type ReferenceCell,
} from '@/components/reference-table'
import type { AttemptInput, Fact, SessionMode } from '@/lib/types'
import styles from './run.module.css'

interface Reference {
  factors: number[]
  cells: ReferenceCell[]
}

interface NewSession {
  sessionId: number
  mode: SessionMode
  timeLimitMs: number
  problems: Fact[]
}

type Phase = 'loading' | 'running' | 'saving' | 'error'

export default function RunClient({
  mode,
  sourceSessionId,
  reference,
}: {
  mode: SessionMode
  sourceSessionId: number | null
  /** Non-null only while the reference chart is switched on in settings. */
  reference: Reference | null
}) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<NewSession | null>(null)
  const [index, setIndex] = useState(0)
  const [value, setValue] = useState('')

  const attemptsRef = useRef<AttemptInput[]>([])
  const shownAtRef = useRef(0)
  const finishedRef = useRef(false)
  const startedRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const submitRef = useRef<((answer: number | null) => void) | null>(null)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    fetch('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode, sourceSessionId }),
    })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? 'Could not start')
        setSession(payload as NewSession)
        setPhase('running')
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Could not start')
        setPhase('error')
      })
  }, [mode, sourceSessionId])

  const finish = useCallback(
    async (sessionId: number) => {
      setPhase('saving')
      try {
        const response = await fetch(`/api/sessions/${sessionId}/complete`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ attempts: attemptsRef.current }),
        })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? 'Could not save')
        router.replace(`/results/${sessionId}`)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not save')
        setPhase('error')
      }
    },
    [router],
  )

  /*
    One effect per problem: it starts the invisible timer and, on cleanup,
    cancels it. `record` closes over the index this effect was created for, so
    a timeout always lands on the problem that was actually on screen.
  */
  useEffect(() => {
    if (phase !== 'running' || !session) return
    const problem = session.problems[index]
    if (!problem) return

    shownAtRef.current = performance.now()
    inputRef.current?.focus()

    const record = (answerGiven: number | null) => {
      if (finishedRef.current) return
      const responseMs = performance.now() - shownAtRef.current
      const correctAnswer = problem.a * problem.b
      attemptsRef.current.push({
        a: problem.a,
        b: problem.b,
        answerGiven,
        responseMs,
        result:
          answerGiven === null
            ? 'timeout'
            : answerGiven === correctAnswer
              ? 'correct'
              : 'incorrect',
      })

      if (index + 1 >= session.problems.length) {
        finishedRef.current = true
        void finish(session.sessionId)
        return
      }
      setValue('')
      setIndex(index + 1)
    }

    submitRef.current = record
    const timer = window.setTimeout(() => record(null), session.timeLimitMs)
    return () => window.clearTimeout(timer)
  }, [phase, session, index, finish])

  /* Abandoned runs leave no session row behind. */
  useEffect(() => {
    return () => {
      if (finishedRef.current || !session) return
      void fetch(`/api/sessions/${session.sessionId}/abandon`, {
        method: 'POST',
        keepalive: true,
      })
    }
  }, [session])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    const trimmed = value.trim()
    if (trimmed === '') return
    submitRef.current?.(Number(trimmed))
  }

  if (phase === 'error') {
    return (
      <main className={styles.stage}>
        <div className={styles.failure}>
          <h1>Practice could not start</h1>
          <p className="note">{error}</p>
          <Link className="btn" href="/">
            Back to start
          </Link>
        </div>
      </main>
    )
  }

  if (phase === 'loading' || !session) {
    return (
      <main className={styles.stage}>
        <p className={styles.quiet}>Getting ready</p>
      </main>
    )
  }

  if (phase === 'saving') {
    return (
      <main className={styles.stage}>
        <p className={styles.quiet}>Working out your results</p>
      </main>
    )
  }

  const problem = session.problems[index]

  return (
    <main
      className={`${styles.stage} ${reference ? styles.stageWithAid : ''}`}
      onClick={() => inputRef.current?.focus()}
    >
      <div className={styles.prompt}>
        <div className={styles.problem} aria-live="off">
          {problem.a}
          <span className={styles.times}>×</span>
          {problem.b}
        </div>
        <input
          ref={inputRef}
          className={styles.answer}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={3}
          aria-label={`Answer for ${problem.a} times ${problem.b}`}
          value={value}
          onChange={(event) =>
            setValue(event.target.value.replace(/[^0-9]/g, ''))
          }
          onKeyDown={handleKeyDown}
          autoFocus
        />
      </div>
      {reference && (
        <aside className={styles.aid} aria-label="Times table reference">
          <ReferenceTable
            factors={reference.factors}
            cells={reference.cells}
            compact
          />
        </aside>
      )}
    </main>
  )
}

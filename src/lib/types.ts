export type AttemptResult = 'correct' | 'incorrect' | 'timeout'

export type MasteryStatus =
  | 'unknown'
  | 'weak'
  | 'developing'
  | 'strong'
  | 'mastered'

export type SessionMode = 'standard' | 'remediation'

/** A single multiplication fact, tracked per presentation order. 7x8 != 8x7. */
export interface Fact {
  a: number
  b: number
}

export interface FactRecord extends Fact {
  pairKey: string
  masteryScore: number
  masteryStatus: MasteryStatus
  totalAttempts: number
  correctAttempts: number
  incorrectAttempts: number
  timeouts: number
  totalResponseMs: number
  /** Recency-weighted response time, ms. Null until first attempt. */
  recentResponseMs: number | null
  lastSeen: string | null
  lastResult: AttemptResult | null
  /** Newest-first list of the last 10 results. */
  recentResults: AttemptResult[]
}

export interface AttemptInput {
  a: number
  b: number
  answerGiven: number | null
  responseMs: number
  result: AttemptResult
}

export interface AttemptRecord extends AttemptInput {
  id: number
  sessionId: number
  correctAnswer: number
  timeLimitMs: number
  createdAt: string
}

export interface SessionRecord {
  id: number
  mode: SessionMode
  startedAt: string
  completedAt: string | null
  timeLimitMs: number
  presented: number
  correct: number
  incorrect: number
  timeouts: number
  totalResponseMs: number
  sourceSessionId: number | null
}

export interface Settings {
  include11: boolean
  include12: boolean
  timeLimitMs: number
  /** Show the reference table beside the problem during a run. */
  showTableDuringRun: boolean
}

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CompositionBar } from '@/components/charts'
import SiteNav from '@/components/site-nav'
import {
  RESULT_CLASSES,
  RESULT_LABELS,
  factLabel,
  longDateTime,
  percent,
  seconds,
} from '@/lib/format'
import { getSessionSummary } from '@/lib/results'
import { getTimerEventForSession } from '@/lib/timer'
import styles from '../results.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Session results' }

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const sessionId = Number(id)
  if (!Number.isInteger(sessionId)) notFound()

  const summary = getSessionSummary(sessionId)
  if (!summary || !summary.session.completedAt) notFound()

  const timerChange = getTimerEventForSession(sessionId)
  const isRemediation = summary.session.mode === 'remediation'
  const difficultFactCount = new Set(
    summary.difficult.map((attempt) => `${attempt.a}x${attempt.b}`),
  ).size

  return (
    <div className="shell">
      <SiteNav />
      <div className="stack">
        <header>
          <p className="eyebrow">
            {isRemediation ? 'Focused practice' : 'Session results'}
          </p>
          <h1>
            {summary.correct} of {summary.presented} correct
          </h1>
          <p className="note" style={{ marginTop: 8 }}>
            {longDateTime(summary.session.completedAt)} ·{' '}
            {seconds(summary.session.timeLimitMs, 0)} allowed per problem
          </p>
        </header>

        <section className="panel">
          <div className={styles.hero}>
            <div>
              <p className="eyebrow">Score</p>
              <p className={styles.score}>
                <span className={styles.scoreValue}>{summary.score.correct}</span>
                <span className={styles.scoreOutOf}>/{summary.score.outOf}</span>
              </p>
            </div>
            <div className={styles.composition}>
              <p className="eyebrow" style={{ marginBottom: 6 }}>
                How the {summary.presented} problems went
              </p>
              <CompositionBar
                correct={summary.correct}
                incorrect={summary.incorrect}
                timeouts={summary.timeouts}
              />
            </div>
          </div>
        </section>

        {/* Both accuracy readings are shown, each named, so neither is ambiguous. */}
        <section className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Accuracy — answered</span>
            <span className={styles.statValue}>
              {percent(summary.accuracyAttempted)}
            </span>
            <span className={styles.statHint}>
              {summary.correct} correct of {summary.attempted} answered
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Accuracy — all presented</span>
            <span className={styles.statValue}>
              {percent(summary.accuracyPresented)}
            </span>
            <span className={styles.statHint}>
              {summary.correct} correct of {summary.presented} presented,
              counting unanswered as wrong
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Average response</span>
            <span className={styles.statValue}>
              {seconds(summary.avgResponseAnsweredMs)}
            </span>
            <span className={styles.statHint}>
              Across the {summary.attempted} problems that got an answer
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Average per problem</span>
            <span className={styles.statValue}>
              {seconds(summary.avgResponseAllMs)}
            </span>
            <span className={styles.statHint}>
              Including unanswered problems, which use the full{' '}
              {seconds(summary.session.timeLimitMs, 0)}
            </span>
          </div>
        </section>

        {timerChange && (
          <div className={styles.timerNotice}>
            <p className={styles.timerNoticeTitle}>
              Time per problem is now {seconds(timerChange.toMs, 0)}, was{' '}
              {seconds(timerChange.fromMs, 0)}
            </p>
            <p className="note">{timerChange.reason}.</p>
          </div>
        )}

        <section className="panel">
          <div className="panelHeader">
            <h2>What was difficult</h2>
            <span className="eyebrow">{difficultFactCount} facts</span>
          </div>
          {summary.difficult.length === 0 ? (
            <p className="empty">
              Nothing was missed or slow in this session.
            </p>
          ) : (
            <div className="tableWrap">
              <table className="dataTable">
                <caption>
                  Incorrect, unanswered, or correct but close to the time limit.
                </caption>
                <thead>
                  <tr>
                    <th>Fact</th>
                    <th className="numeric">Answer</th>
                    <th className="numeric">Correct</th>
                    <th>Result</th>
                    <th className="numeric">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.difficult.map((attempt) => (
                    <tr key={attempt.id}>
                      <td className="factCell">
                        {factLabel(attempt.a, attempt.b)}
                      </td>
                      <td className="numeric">
                        {attempt.answerGiven ?? '—'}
                      </td>
                      <td className="numeric">{attempt.correctAnswer}</td>
                      <td className={RESULT_CLASSES[attempt.result]}>
                        {RESULT_LABELS[attempt.result]}
                        {attempt.result === 'correct' && ' — slow'}
                      </td>
                      <td className="numeric">{seconds(attempt.responseMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="btnRow">
          {summary.difficult.length > 0 && (
            <Link
              className="btn btnPrimary"
              href={`/run?mode=remediation&from=${sessionId}`}
            >
              Practice these {difficultFactCount} facts
            </Link>
          )}
          <Link className="btn" href="/run">
            Start another session
          </Link>
          <Link className="btn" href="/trends">
            See trends
          </Link>
        </div>
      </div>
    </div>
  )
}

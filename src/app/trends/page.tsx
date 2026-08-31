import Link from 'next/link'
import { LineChart, MasteryGrid } from '@/components/charts'
import type { LinePoint } from '@/components/charts'
import SiteNav from '@/components/site-nav'
import { activeFactors, getActiveFactRecords } from '@/lib/facts'
import {
  MASTERY_SWATCH,
  calendarDay,
  factLabel,
  masteryLabel,
  percent,
  seconds,
  shortDate,
} from '@/lib/format'
import { parseKidId, requireKid, requireSession } from '@/lib/dal'
import { getSettings } from '@/lib/settings'
import { getTimerEvents } from '@/lib/timer'
import {
  getCorrectButSlow,
  getDailyPerformance,
  getDailySessionCounts,
  getExtremeFacts,
  getFactTrends,
  getFrequentlyIncorrect,
  getFrequentlyTimedOut,
  getMasteryDistribution,
  getMasteryEvents,
  getOverviewStats,
  getSessionTrend,
} from '@/lib/trends'
import type { FactTrend } from '@/lib/trends'
import styles from './trends.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Trends' }

const TREND_LABELS: Record<FactTrend['direction'], string> = {
  improving: 'Improving',
  regressing: 'Needs attention',
  steady: 'Steady',
  'insufficient-data': 'Not enough data',
}

const TREND_CLASSES: Record<FactTrend['direction'], string> = {
  improving: 'trendImproving',
  regressing: 'trendRegressing',
  steady: 'trendSteady',
  'insufficient-data': 'trendInsufficient',
}

/*
  One page for both roles. A kid resolves only to themselves and a parent to a
  child they own, so who may read this is settled by requireKid rather than by
  having two versions of the page.
*/
export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ kid?: string }>
}) {
  const viewer = await requireSession()
  const { kid: kidParam } = await searchParams
  const kid = await requireKid(parseKidId(kidParam))
  const kidId = kid.id

  const settings = getSettings(kidId)
  const overview = getOverviewStats(kidId)
  const sessions = getSessionTrend(kidId)
  const distribution = getMasteryDistribution(kidId)
  const records = getActiveFactRecords(kidId, settings)
  const { weakest, strongest } = getExtremeFacts(kidId)
  // Disabled factors keep their history but are not what to work on next.
  const factTrends = getFactTrends(kidId).filter((f) => f.inActivePool)
  const improving = factTrends.filter((f) => f.direction === 'improving')
  const regressing = factTrends.filter((f) => f.direction === 'regressing')
  const frequentlyIncorrect = getFrequentlyIncorrect(kidId).slice(0, 10)
  const frequentlyTimedOut = getFrequentlyTimedOut(kidId).slice(0, 10)
  const correctButSlow = getCorrectButSlow(kidId).slice(0, 10)
  const dailySessions = getDailySessionCounts(kidId, 30)
  const dailyPerformance = getDailyPerformance(kidId, 30)
  const masteryEvents = getMasteryEvents(kidId, 25)
  const timerEvents = getTimerEvents(kidId, 10)

  // Keeps a parent on the child they are reading when following a link.
  const resultsHref = (sessionId: number) =>
    viewer.role === 'parent'
      ? `/results/${sessionId}?kid=${kidId}`
      : `/results/${sessionId}`

  /*
    Plotted per day rather than per session. One point per session made the
    charts a scatter of isolated values — a six-problem remediation run sat
    beside a fifty-problem session as an equal — and excluding remediation left
    barely anything to draw. Each point here is every problem answered that day.
  */
  const accuracyPoints: LinePoint[] = dailyPerformance.map((row) => ({
    label: calendarDay(row.day),
    value: row.accuracyPresented * 100,
    detail: `${row.correct}/${row.presented} correct`,
  }))

  const responsePoints: LinePoint[] = dailyPerformance.map((row) => ({
    label: calendarDay(row.day),
    value: row.avgAnsweredMs === null ? null : row.avgAnsweredMs / 1000,
    detail:
      row.avgAnsweredMs === null
        ? 'nothing answered'
        : `${seconds(row.avgAnsweredMs)} average`,
  }))

  const responseMax = Math.max(
    ...responsePoints.map((point) => point.value ?? 0),
    settings.timeLimitMs / 1000,
  )

  return (
    <div className="shell">
      <SiteNav
        role={viewer.role}
        current="/trends"
        kidId={kidId}
        kidName={viewer.role === 'parent' ? kid.name : undefined}
      />
      <div className="stack">
        <header>
          <p className="eyebrow">Analysis</p>
          <h1>What is improving, what to work on next</h1>
        </header>

        <section className={styles.overview}>
          <div className={styles.overviewItem}>
            <span className={styles.overviewLabel}>Sessions completed</span>
            <span className={styles.overviewValue}>
              {overview.totalSessions}
            </span>
          </div>
          <div className={styles.overviewItem}>
            <span className={styles.overviewLabel}>Problems answered</span>
            <span className={styles.overviewValue}>
              {overview.totalAttempts}
            </span>
          </div>
          <div className={styles.overviewItem}>
            <span className={styles.overviewLabel}>Facts with data</span>
            <span className={styles.overviewValue}>{overview.factsTracked}</span>
          </div>
          <div className={styles.overviewItem}>
            <span className={styles.overviewLabel}>Time per problem</span>
            <span className={styles.overviewValue}>
              {seconds(overview.currentTimeLimitMs, 0)}
            </span>
          </div>
        </section>

        {/* The times table itself, coloured by mastery — the whole picture at once. */}
        <section className="panel">
          <div className="panelHeader">
            <h2>Mastery across the table</h2>
            <span className="eyebrow">Current standing</span>
          </div>
          <MasteryGrid
            factors={activeFactors(settings)}
            cells={records.map((record) => ({
              a: record.a,
              b: record.b,
              status: record.masteryStatus,
              score: record.masteryScore,
              attempts: record.totalAttempts,
            }))}
          />
          <div className={styles.distribution}>
            {distribution.map((entry) => (
              <span key={entry.status} className={styles.distributionItem}>
                <span className={`swatch ${MASTERY_SWATCH[entry.status]}`} />
                {masteryLabel(entry.status)}
                <span className={styles.distributionCount}>{entry.count}</span>
              </span>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panelHeader">
            <h2>Practice by day</h2>
            <span className="eyebrow">Started and finished</span>
          </div>
          {dailySessions.length === 0 ? (
            <p className="empty">No practice sessions yet.</p>
          ) : (
            <div className="tableWrap" style={{ marginTop: 16 }}>
              <table className="dataTable">
                <caption>
                  Newest first, by the day each session was started. Includes
                  focused practice runs. A run left unfinished counts as started
                  but not completed.
                </caption>
                <thead>
                  <tr>
                    <th>Day</th>
                    <th className="numeric">Started</th>
                    <th className="numeric">Completed</th>
                    <th className="numeric">Unfinished</th>
                  </tr>
                </thead>
                <tbody>
                  {dailySessions.map((row) => (
                    <tr key={row.day}>
                      <td>{calendarDay(row.day)}</td>
                      <td className="numeric">{row.started}</td>
                      <td className="numeric">{row.completed}</td>
                      <td className="numeric">
                        {row.started - row.completed === 0 ? (
                          <span className="muted">0</span>
                        ) : (
                          row.started - row.completed
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panelHeader">
            <h2>Session history</h2>
            <span className="eyebrow">Charts all practice · table scored only</span>
          </div>
          <div className={styles.charts}>
            <LineChart
              caption="Accuracy by day — correct of every problem presented"
              points={accuracyPoints}
              min={0}
              max={100}
              unit="percent"
              emptyNote="Two days of practice are needed before a trend can be drawn."
            />
            <LineChart
              caption="Average response time by day — answered problems only"
              points={responsePoints}
              min={0}
              max={Math.ceil(responseMax)}
              unit="seconds"
              color="var(--good)"
              emptyNote="Two days with at least one answered problem are needed before a trend can be drawn."
            />
          </div>
          {sessions.length === 0 ? (
            <p className="empty">No completed sessions yet.</p>
          ) : (
            <div className="tableWrap" style={{ marginTop: 24 }}>
              <table className="dataTable">
                <caption>
                  Every scored session, newest first. Focused practice runs are
                  excluded — they are not 50-question challenges.
                </caption>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="numeric">Score</th>
                    <th className="numeric">Answered</th>
                    <th className="numeric">All presented</th>
                    <th className="numeric">Unanswered</th>
                    <th className="numeric">Avg response</th>
                    <th className="numeric">Limit</th>
                  </tr>
                </thead>
                <tbody>
                  {[...sessions].reverse().map((session) => (
                    <tr key={session.sessionId}>
                      <td>
                        <Link href={resultsHref(session.sessionId)}>
                          {shortDate(session.completedAt)}
                        </Link>
                      </td>
                      <td className="numeric">
                        {session.correct}/{session.presented}
                      </td>
                      <td className="numeric">
                        {percent(session.accuracyAttempted)}
                      </td>
                      <td className="numeric">
                        {percent(session.accuracyPresented)}
                      </td>
                      <td className="numeric">{session.timeouts}</td>
                      <td className="numeric">
                        {seconds(session.avgResponseAnsweredMs)}
                      </td>
                      <td className="numeric">
                        {seconds(session.timeLimitMs, 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className={styles.twoUp}>
          <section className="panel">
            <div className="panelHeader">
              <h2>Work on these next</h2>
              <span className="eyebrow">Lowest mastery</span>
            </div>
            <FactMasteryTable rows={weakest} emptyText="No facts measured yet." />
          </section>
          <section className="panel">
            <div className="panelHeader">
              <h2>Strongest facts</h2>
              <span className="eyebrow">Highest mastery</span>
            </div>
            <FactMasteryTable
              rows={strongest}
              emptyText="No facts measured yet."
            />
          </section>
        </div>

        <div className={styles.twoUp}>
          <section className="panel">
            <div className="panelHeader">
              <h2>Recently improved</h2>
              <span className="eyebrow">Last 7 days vs before</span>
            </div>
            <FactTrendTable
              rows={improving}
              emptyText="No fact has enough attempts in both weeks yet."
            />
          </section>
          <section className="panel">
            <div className="panelHeader">
              <h2>Recently regressing</h2>
              <span className="eyebrow">Last 7 days vs before</span>
            </div>
            <FactTrendTable
              rows={regressing}
              emptyText="Nothing has slipped in the last week."
            />
          </section>
        </div>

        <section className="panel">
          <div className="panelHeader">
            <h2>Recurring problems</h2>
            <span className="eyebrow">Last 30 days</span>
          </div>
          <div className={styles.twoUp} style={{ marginTop: 12 }}>
            <CountTable
              title="Answered incorrectly"
              rows={frequentlyIncorrect}
              emptyText="No wrong answers in the last 30 days."
            />
            <CountTable
              title="Ran out of time"
              rows={frequentlyTimedOut}
              emptyText="No timeouts in the last 30 days."
            />
            <CountTable
              title="Correct but slow"
              rows={correctButSlow}
              emptyText="Nothing correct-but-slow in the last 30 days."
            />
          </div>
        </section>

        <div className={styles.twoUp}>
          <section className="panel">
            <div className="panelHeader">
              <h2>Mastery changes</h2>
              <span className="eyebrow">Most recent first</span>
            </div>
            {masteryEvents.length === 0 ? (
              <p className="empty">No classification changes recorded yet.</p>
            ) : (
              <div className="tableWrap">
                <table className="dataTable">
                  <thead>
                    <tr>
                      <th>Fact</th>
                      <th>Change</th>
                      <th className="numeric">Score</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {masteryEvents.map((event) => (
                      <tr key={event.id}>
                        <td className="factCell">
                          {factLabel(event.a, event.b)}
                        </td>
                        <td>
                          <span className="chip">
                            <span
                              className={`swatch ${MASTERY_SWATCH[event.fromStatus]}`}
                            />
                            {masteryLabel(event.fromStatus)}
                          </span>
                          {' → '}
                          <span className="chip">
                            <span
                              className={`swatch ${MASTERY_SWATCH[event.toStatus]}`}
                            />
                            {masteryLabel(event.toStatus)}
                          </span>
                        </td>
                        <td className="numeric">
                          {Math.round(event.masteryScore)}
                        </td>
                        <td>{shortDate(event.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panelHeader">
              <h2>Time limit changes</h2>
              <span className="eyebrow">Adaptive, both directions</span>
            </div>
            {timerEvents.length === 0 ? (
              <p className="empty">
                The limit has not changed from{' '}
                {seconds(settings.timeLimitMs, 0)} yet.
              </p>
            ) : (
              <div className="tableWrap">
                <table className="dataTable">
                  <thead>
                    <tr>
                      <th>Change</th>
                      <th>Why</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timerEvents.map((event) => (
                      <tr key={event.id}>
                        <td className="factCell">
                          {seconds(event.fromMs, 0)} → {seconds(event.toMs, 0)}
                        </td>
                        <td style={{ whiteSpace: 'normal' }}>{event.reason}</td>
                        <td>{shortDate(event.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function FactMasteryTable({
  rows,
  emptyText,
}: {
  rows: ReturnType<typeof getExtremeFacts>['weakest']
  emptyText: string
}) {
  if (rows.length === 0) return <p className="empty">{emptyText}</p>
  return (
    <div className="tableWrap">
      <table className="dataTable">
        <thead>
          <tr>
            <th>Fact</th>
            <th>Mastery</th>
            <th className="numeric">Score</th>
            <th className="numeric">Accuracy</th>
            <th className="numeric">Recent time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((record) => (
            <tr key={`${record.a}x${record.b}`}>
              <td className="factCell">{factLabel(record.a, record.b)}</td>
              <td>
                <span className="chip">
                  <span
                    className={`swatch ${MASTERY_SWATCH[record.masteryStatus]}`}
                  />
                  {masteryLabel(record.masteryStatus)}
                </span>
              </td>
              <td className="numeric">{Math.round(record.masteryScore)}</td>
              <td className="numeric">
                {percent(
                  record.totalAttempts === 0
                    ? null
                    : record.correctAttempts / record.totalAttempts,
                )}
              </td>
              <td className="numeric">{seconds(record.recentResponseMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FactTrendTable({
  rows,
  emptyText,
}: {
  rows: FactTrend[]
  emptyText: string
}) {
  if (rows.length === 0) return <p className="empty">{emptyText}</p>
  return (
    <div className="tableWrap">
      <table className="dataTable">
        <caption>
          This week against the week before, accuracy weighted over speed.
        </caption>
        <thead>
          <tr>
            <th>Fact</th>
            <th className="numeric">This week</th>
            <th className="numeric">Before</th>
            <th className="numeric">Time now</th>
            <th className="numeric">Time before</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.a}x${row.b}`}>
              <td className="factCell">{factLabel(row.a, row.b)}</td>
              <td className="numeric">{percent(row.recent.accuracy)}</td>
              <td className="numeric">{percent(row.previous.accuracy)}</td>
              <td className="numeric">{seconds(row.recent.avgAnsweredMs)}</td>
              <td className="numeric">{seconds(row.previous.avgAnsweredMs)}</td>
              <td className={TREND_CLASSES[row.direction]}>
                {TREND_LABELS[row.direction]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CountTable({
  title,
  rows,
  emptyText,
}: {
  title: string
  rows: ReturnType<typeof getFrequentlyIncorrect>
  emptyText: string
}) {
  return (
    <div>
      <p className="eyebrow" style={{ marginBottom: 10 }}>
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="empty">{emptyText}</p>
      ) : (
        <table className="dataTable">
          <thead>
            <tr>
              <th>Fact</th>
              <th className="numeric">Times</th>
              <th className="numeric">Of</th>
              <th className="numeric">Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.a}x${row.b}`}>
                <td className="factCell">{factLabel(row.a, row.b)}</td>
                <td className="numeric">{row.count}</td>
                <td className="numeric">{row.attempts}</td>
                <td className="numeric">{percent(row.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

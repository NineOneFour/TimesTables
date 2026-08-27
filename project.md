# Multiplication Practice App

## Project Overview

Build a simple, distraction-free multiplication practice application designed around **speed, accuracy, and adaptive practice**.

The application presents a child with timed multiplication problems and records performance over time. The actual practice run must remain intentionally minimal. All scoring, feedback, analytics, trends, and adaptive behavior happen behind the scenes or after the run.

The primary design philosophy is:

> **Practice without distraction. Analyze afterward. Adapt the next session.**

---

## Core Practice Session

A standard practice session consists of:

- **50 multiplication problems**
- One problem displayed at a time
- An answer input
- Keyboard-first interaction
- A configurable time limit per problem
- Initial time limit: **15 seconds**

Example run screen:

```text
7 × 8

[        ]
```

This is essentially everything that should appear during an active run.

### Answer Flow

1. Display a multiplication problem.
2. Automatically focus the answer input.
3. The user types the answer.
4. Pressing `Enter` submits the answer.
5. Immediately display the next problem.
6. Clear and automatically refocus the input.
7. Continue until all 50 problems have been presented.

The interaction should be extremely fast. There should be no unnecessary delay between submitting an answer and receiving the next problem.

### Timeout Behavior

Each problem has a time limit.

Initially:

```text
15 seconds
```

If the user does not submit an answer before time expires:

- Record the problem as unanswered/timed out.
- Automatically advance to the next problem.
- Do not display any timeout notification.
- Do not display the correct answer.
- Start the full timer for the next problem.

The timer should run completely invisibly.

---

# Distraction-Free Run

This is a hard UX requirement.

During an active practice session, **nothing should be displayed except the multiplication problem and answer input**.

Do NOT display:

- Timer
- Countdown
- Progress bar
- Current question number
- Number of questions remaining
- Score
- Accuracy
- Correct/incorrect feedback
- Previous answer
- Correct answer
- Streak
- Animations
- Rewards
- Points
- Mastery level
- Performance indicators
- Encouragement messages
- Warnings
- Sounds indicating correctness
- Color changes based on correctness

The user should not know whether the previous answer was correct during the run.

The experience should remain:

```text
SEE PROBLEM
     ↓
TYPE ANSWER
     ↓
PRESS ENTER
     ↓
NEXT PROBLEM
```

All analysis happens afterward.

---

# Multiplication Fact Pool

By default, multiplication problems use factors:

```text
1 through 9
```

Zero should **never** be included.

The application should provide configuration options to independently enable:

- 11
- 12

For example:

```text
Base Pool: 1–9

Include 11: Yes/No
Include 12: Yes/No
```

If both are enabled, the effective pool becomes:

```text
1–9, 11, 12
```

Historical information about 11 and 12 should be retained if either is later disabled.

Disabling a factor removes it from practice selection. It should **not delete its historical performance data**.

---

# Multiplication Facts

Each multiplication fact should be treated as an individually tracked item.

Examples:

```text
7 × 8
8 × 7
6 × 9
9 × 6
```

Commutative facts may share information for analysis where useful, but should still be independently measurable.

For example:

```text
7 × 8
```

and:

```text
8 × 7
```

are related, but the application should still be capable of detecting if the user performs differently depending on presentation order.

---

# Persistent Fact Records

Each multiplication fact should have a persistent record representing the application's current understanding of the user's ability with that fact.

This record should act as the **current source of truth** for adaptive problem selection.

Conceptually, a fact should contain information such as:

```text
factor_a
factor_b

mastery_score
mastery_status

total_attempts
correct_attempts
incorrect_attempts
timeouts

average_response_time
recent_response_time

last_seen
last_result

recent_performance
```

Exact schema and implementation are left to the coding agent.

---

# Attempt History

Do not rely exclusively on aggregate fact records.

Every presented problem should also create an individual historical attempt record.

An attempt should capture enough information to reconstruct performance over time, including conceptually:

```text
fact
session
answer_given
correct_answer
correct / incorrect / timeout
response_time
timestamp
```

This history enables trend analysis.

The relationship should conceptually be:

```text
Fact Record
    ↓
Current understanding of mastery

Attempt Records
    ↓
Historical evidence

Session Record
    ↓
Groups attempts into individual practice runs
```

The fact record represents **where the user is now**.

Attempt history represents **how they got there**.

---

# Mastery System

Mastery is **fluid**.

A multiplication fact must never permanently become mastered or permanently become weak.

The system should maintain an underlying continuous mastery measurement.

Human-readable categories should be derived from that measurement:

```text
Unknown
Weak
Developing
Strong
Mastered
```

`Unknown` represents facts where insufficient information exists to make a meaningful determination.

Once enough data exists, facts should naturally move between:

```text
Weak
Developing
Strong
Mastered
```

Movement must work in both directions.

Examples:

```text
Weak → Developing → Strong → Mastered
```

and:

```text
Mastered → Strong → Developing
```

A fact's classification should reflect **current demonstrated ability**, not an achievement permanently unlocked in the past.

---

# Mastery Inputs

Mastery should consider multiple signals rather than correctness alone.

Important signals include:

### Accuracy

How consistently is the fact answered correctly?

### Response Time

A correct answer in 3 seconds demonstrates greater fluency than a correct answer in 14 seconds.

Both are correct, but they represent different levels of mastery.

### Timeouts

Repeated inability to answer within the allowed time strongly indicates that the fact requires additional practice.

### Consistency

Several successful attempts should matter more than one unusually good attempt.

### Recent Performance

Recent attempts should have greater influence than very old attempts.

### Regression

Previously mastered facts should move back toward heavier practice if performance begins deteriorating.

### Improvement

Facts should naturally move toward lighter practice as accuracy, speed, and consistency improve.

---

# Avoid Excessive Mastery Swings

Individual attempts should influence mastery without causing extreme changes.

For example:

A single incorrect answer to:

```text
4 × 5
```

should not immediately turn a historically mastered fact into a weak fact.

Likewise, correctly answering a historically difficult problem once should not immediately mark it mastered.

Mastery should respond to **patterns of performance**.

---

# Adaptive Problem Selection

Problem selection should become increasingly personalized as historical data becomes available.

Initially, when most facts are `Unknown`, problems should receive relatively even exposure.

As sufficient data becomes available, selection should become weighted toward areas requiring practice.

Target weighting:

| Classification | Selection Weight |
|---|---:|
| Weak | 40% |
| Developing | 30% |
| Strong | 20% |
| Mastered | 10% |

These percentages represent **selection weights, not strict per-session quotas**.

A 50-question session should not necessarily contain exactly:

```text
20 Weak
15 Developing
10 Strong
5 Mastered
```

Instead, those ratios should influence randomized selection.

This preserves variety while heavily favoring useful practice.

---

# Unknown Facts

New facts should begin as:

```text
Unknown
```

Do not automatically classify a fact as weak simply because no performance history exists.

Unknown facts should receive enough exposure for the system to establish an initial mastery measurement.

As data accumulates, they should transition naturally into one of the established mastery categories.

---

# Adaptive Practice Philosophy

The application should prioritize the child's available practice time toward facts that provide the greatest learning benefit.

A fact that is:

- frequently incorrect,
- frequently timed out,
- or consistently slow

should appear more frequently.

A fact that is:

- consistently correct,
- quickly answered,
- and stable over time

should appear less frequently.

Mastered facts must **never completely disappear**.

They should continue receiving occasional exposure so the system can detect regression.

Conceptually:

```text
Performance
    ↓
Update Fact Mastery
    ↓
Adjust Selection Weight
    ↓
Future Practice
    ↓
New Performance
    ↓
Repeat
```

---

# Recency

Recent performance should matter more than historical performance.

For example, if `6 × 8` was historically strong but has recently been:

- answered incorrectly,
- answered significantly slower,
- or timed out,

its mastery should gradually decrease and its selection weight should increase.

Conversely, a historically weak fact that has been consistently answered correctly and quickly should gradually move toward stronger classifications.

Old data should remain available for long-term trends but should have less influence over current mastery.

---

# Session Results

After all 50 questions are completed, leave practice mode and display detailed results.

This is the first point at which performance information should become visible.

The results should include at minimum:

```text
Total Problems
Correct
Incorrect
Unanswered / Timed Out
Overall Score
Accuracy
Average Response Time
```

Incorrect and unanswered problems should be distinguished.

For example:

```text
50 Problems

43 Correct
4 Incorrect
3 Unanswered

Accuracy: 91%
Score: 43 / 50
Average Response Time: 5.8 seconds
```

Accuracy should make clear whether it represents:

- percentage of attempted questions answered correctly, or
- percentage of all presented questions answered correctly.

Avoid presenting ambiguous statistics.

---

# Post-Session Problem Feedback

After the run, show which facts caused difficulty.

Useful information includes:

```text
Fact
Answer Given
Correct Answer
Result
Response Time
```

Example:

| Fact | Answer | Correct | Result | Time |
|---|---:|---:|---|---:|
| 7 × 8 | 48 | 56 | Incorrect | 9.2s |
| 6 × 9 | 56 | 54 | Incorrect | 11.4s |
| 8 × 7 | — | 56 | Timeout | 15.0s |

This information should only appear **after the session**.

---

# Trends

Historical attempt and session data should be used to provide useful trends over time.

The goal is not simply to tell the child or parent what happened today.

The application should help answer:

> **What is improving, and what should we work on next?**

Useful trend information includes:

- Accuracy over time
- Average response time over time
- Session scores over time
- Weakest multiplication facts
- Strongest multiplication facts
- Recently improved facts
- Recently regressing facts
- Facts frequently answered incorrectly
- Facts frequently timing out
- Facts that are correct but consistently slow
- Changes in mastery classification over time

---

# Fact-Level Trends

Individual facts should have enough historical information to identify meaningful improvement.

For example:

```text
7 × 8

This Week:
90% accuracy
5.1 second average response

Previous:
55% accuracy
9.4 second average response

Trend:
Improving
```

Another fact might show:

```text
6 × 9

Recent Accuracy:
58%

Average Response:
10.8 seconds

Trend:
Needs Attention
```

The exact wording and visualization are implementation details, but the underlying information should be available.

---

# Practice Timer Progression

The initial per-problem time limit is:

```text
15 seconds
```

The system should support progressively shorter limits as overall ability improves.

Potential progression:

```text
15
12
10
8
6
5 seconds
```

The timer should not become shorter because of one unusually strong session.

Changes should be based on demonstrated performance across multiple sessions.

Likewise, the system should be capable of increasing the time limit again if the current difficulty is producing excessive timeouts or poor performance.

Timer progression should therefore be adaptive rather than a permanent one-way unlock system.

Regardless of the configured limit, **the timer remains invisible during practice**.

---

# Practice Missed Problems

After viewing session results, provide an option to practice the facts that caused difficulty.

This follow-up practice can focus on:

- Incorrect answers
- Timed-out problems
- Particularly slow correct answers

This should be treated as focused remediation rather than another scored 50-question challenge.

The philosophy is:

```text
Challenge identifies the problem.
Practice works on the problem.
Future challenges measure improvement.
```

---

# UX Priorities

The application should prioritize:

1. Extremely fast keyboard interaction
2. Zero distraction during a run
3. Useful post-session feedback
4. Long-term performance tracking
5. Adaptive practice based on actual ability
6. Simple interfaces appropriate for a child
7. Useful information for a parent helping the child improve

The application should **not** become gamified simply for the sake of gamification.

Avoid unnecessary:

- Points
- Coins
- Badges
- Leaderboards
- Achievement systems
- Streak pressure
- Animated rewards

The meaningful reward should be visible improvement in speed and mastery.

---

# Core Product Principle

The application has three primary responsibilities:

```text
TEST QUIETLY

ANALYZE AFTERWARD

ADAPT TOMORROW
```

During a challenge, the application should get out of the child's way.

Afterward, it should provide enough information to understand exactly where improvement is occurring and where additional practice is needed.

Over time, the 50-question session should increasingly reflect the child's individual strengths and weaknesses, spending the greatest portion of limited practice time on the multiplication facts that will benefit most from additional repetition.
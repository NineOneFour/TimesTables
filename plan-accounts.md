# Implementation plan: parent and kid accounts

Status: **implemented**. Kept as the design record; see the notes at the end for
where the build departed from the plan.

Turns the app from a single-household single-profile tool into a multi-tenant one:
a parent signs in, creates accounts for their kids, and controls each kid's
settings from the parent side. Kids sign in with a PIN and can see their own
results and trends, but not settings and not each other.

## 1. Access model

Two credential types, one cookie format, three permissions.

| Actor  | Signs in with              | May read                     | May write                          |
| ------ | -------------------------- | ---------------------------- | ---------------------------------- |
| Parent | email + password           | any kid they own             | kid accounts, any owned kid's settings |
| Kid    | PIN, scoped to a household | only themselves              | only their own practice attempts   |

Ownership is two levels deep — `parent -> kid -> data` — so every request must
establish not just "who is this" but "is this kid theirs". That second check is
the one that matters: a missed scope in a single-household app blends siblings,
but here it crosses families.

Route permissions collapse to one rule, because kids can see their own trends:

- `/`, `/run`, `/results/[id]`, `/trends`, `/table` — scoped by `kidId`; a parent
  may pass any kid they own, a kid only themselves.
- `/settings`, `/kids/*` — parent role only.

That means **no kid-safe fork of the 511-line `src/app/trends/page.tsx`**. It
takes a `kidId` and the boundary decides which ones are legal.

## 2. Data model

### New tables

```sql
CREATE TABLE IF NOT EXISTS parents (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT    NOT NULL UNIQUE,
  passwordHash TEXT    NOT NULL,   -- scrypt, salt embedded
  createdAt    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS kids (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  parentId  INTEGER NOT NULL REFERENCES parents (id) ON DELETE CASCADE,
  name      TEXT    NOT NULL,
  pinHash   TEXT    NOT NULL,      -- scrypt, same helper as passwords
  createdAt TEXT    NOT NULL,
  UNIQUE (parentId, name)
);

CREATE INDEX IF NOT EXISTS idx_kids_parent ON kids (parentId);

-- Failed sign-in attempts, for PIN lockout. Cheap to prune.
CREATE TABLE IF NOT EXISTS auth_failures (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  scope     TEXT NOT NULL,          -- 'kid:<id>' or 'parent:<email>'
  createdAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_failures_scope ON auth_failures (scope, createdAt);
```

### Changed tables

`settings` stops being a singleton. Today it is
`id INTEGER PRIMARY KEY CHECK (id = 1)` with a seeded row
(`src/lib/db.ts:32`); it becomes one row per kid:

```sql
CREATE TABLE IF NOT EXISTS settings (
  kidId              INTEGER PRIMARY KEY REFERENCES kids (id) ON DELETE CASCADE,
  include11          INTEGER NOT NULL DEFAULT 0,
  include12          INTEGER NOT NULL DEFAULT 0,
  timeLimitMs        INTEGER NOT NULL DEFAULT 15000,
  showTableDuringRun INTEGER NOT NULL DEFAULT 0,
  updatedAt          TEXT    NOT NULL
);
```

A row is inserted when a kid is created, so `getSettings(kidId)` never has to
cope with a missing row.

`facts` is the only structurally hard one. Its primary key is `(a, b)`
(`src/lib/db.ts:55`) and must become `(kidId, a, b)`. SQLite cannot `ALTER` a
primary key, so this needs a create-copy-drop-rename rather than the existing
`addColumnIfMissing` helper.

`sessions`, `attempts`, `mastery_events`, `timer_events` each gain
`kidId INTEGER NOT NULL REFERENCES kids (id)`, which `addColumnIfMissing`
already handles. Add indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_sessions_kid  ON sessions  (kidId, completedAt);
CREATE INDEX IF NOT EXISTS idx_attempts_kid  ON attempts  (kidId, createdAt);
```

`attempts` gets `kidId` denormalised rather than being joined through
`sessions` on every read — `src/lib/trends.ts` queries `attempts` directly in
several places (lines 40, 120, 245, 327) and threading a join through all of
them is both more code and more chances to miss one.

## 3. Migration of existing data

Runs inside the existing `migrate()` in `src/lib/db.ts`, guarded so it is a
no-op on a database that already has a `parents` table.

1. Create the new tables.
2. If `sessions`/`facts` hold rows but no `kids` row exists, this is an
   existing single-profile database. Create a placeholder parent
   (`id = 1`, email from `BOOTSTRAP_EMAIL` or a sentinel that forces a password
   reset on first sign-in) and one kid under it.
3. Backfill `kidId = 1` on every existing row in `sessions`, `attempts`,
   `mastery_events`, `timer_events`.
4. Copy the singleton `settings` row to `settings(kidId = 1)`.
5. Rebuild `facts` with the new primary key, copying every existing row with
   `kidId = 1`.

No data loss, and a fresh install skips straight to the bootstrap flow.

## 4. Authentication

**No new dependencies.** The runtime tree is three packages today
(`next`, `react`, `better-sqlite3`) and `node:crypto` covers everything needed:
`scrypt` for password and PIN hashing, `createHmac` + `timingSafeEqual` for
signing and verifying the session cookie. Auth libraries in this space
(next-auth, lucia, better-auth) all expect an adapter layer that the raw
`better-sqlite3` access here does not have.

New files:

- `src/lib/crypto.ts` — `hashSecret()`, `verifySecret()` over `scrypt` with a
  per-secret random salt; `signPayload()`, `verifyPayload()` over HMAC-SHA256.
  Verification must use `timingSafeEqual`, never `===`.
- `src/lib/auth.ts` — `createSession()`, `readSession()`, `destroySession()`.
  Stateless signed cookie carrying `{ role: 'parent' | 'kid', parentId, kidId?, exp }`.
- `src/lib/accounts.ts` — parent and kid CRUD, credential checks, lockout.

### Next 16 specifics

Checked against `node_modules/next/dist/docs`, since the APIs differ from
older App Router material:

- `cookies()` is **async** — `const store = await cookies()`. Set with
  `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`, explicit `expires`.
- **`middleware.ts` is now `proxy.ts`** (`01-app/01-getting-started/16-proxy.md`)
  and the docs are explicit that it "should not be used as a full session
  management or authorization solution" — only optimistic redirects. So
  authorization lives in the data-access layer, not in `proxy.ts`. A `proxy.ts`
  is optional here and probably not worth adding at all.
- Sign-in and account management use **Server Actions** with `useActionState`,
  not new API routes. Only the existing practice endpoints stay as route handlers.
- `unauthorized()` / `forbidden()` are **experimental**, gated behind
  `experimental.authInterrupts`. Skip them; use `redirect()` on pages and plain
  401/403 responses in route handlers. Not worth an experimental flag in an
  open-source project.

### Secret handling

`SESSION_SECRET` from the environment, generated with `openssl rand -base64 32`.
The app should refuse to boot without it rather than falling back to a default —
a shipped default secret in a public repo is a forged-cookie hole.

Two deploy chores this creates, both easy to miss:

- `.gitignore` has no `.env` entry. Add one.
- `deploy.sh` rsyncs with `--delete`, so the server's `.env` would be wiped.
  Add `--exclude '/.env'`, **anchored with the leading slash** like the existing
  excludes and for the same reason documented in that file's header comment.

### PIN safety

A 4-digit PIN checked globally is trivially brute-forced across a shared
instance ("find the kid whose PIN is 1234"). So:

- The kid sign-in screen is **household-scoped**: a long-lived `householdId`
  cookie is set when a parent first signs in on that device, and the kid's PIN
  is only ever compared against that parent's kids. No household cookie means
  no kid sign-in on that device until a parent signs in once.
- PINs are hashed with the same `scrypt` helper as passwords. Never stored plain.
- Lockout via `auth_failures`: N failures within a window blocks that kid, with
  the counter keyed on the kid, not the IP.

## 5. Authorization chokepoint

One module, modelled on the DAL pattern the Next docs recommend
(`01-app/02-guides/authentication.md`, "Creating a Data Access Layer"), wrapped
in React's `cache()` so it runs once per render pass:

```ts
// src/lib/dal.ts
import 'server-only'

export const requireSession = cache(async () => { /* ... redirect('/signin') */ })
export const requireParent  = cache(async () => { /* ... role must be 'parent' */ })

/** The only sanctioned way to turn a requested kidId into a usable one. */
export const resolveKid = cache(async (requested?: number) => { /* ... */ })
```

`resolveKid` is the whole security model in one function: a kid session may only
resolve to its own `kidId`; a parent session may resolve to any kid where
`kids.parentId` matches the session's `parentId`; anything else throws.

Two rules that make a missing scope a compile error rather than a silent leak:

1. Every function in `src/lib` that touches the database takes `kidId` as an
   explicit **first argument**.
2. Nothing under `src/lib` reads the cookie to discover the current kid. Only
   pages, route handlers, and server actions call `resolveKid`, then pass the
   result down.

Without rule 2 an "ambient current kid" creeps in and the scoping becomes
unauditable.

## 6. Threading `kidId` through the library

Mechanical but broad: ~29 SQL statements across 7 files, and ~25 exported
functions currently take no owner at all.

| File          | Functions needing `kidId`                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `settings.ts` | `getSettings`, `updateSettings`                                                                                                    |
| `facts.ts`    | `getAllFactRecords`, `getActiveFactRecords`                                                                                        |
| `sessions.ts` | `createStandardSession`, `createRemediationSession`, `getDifficultFacts`, `completeSession`, `getSession`, `getSessionAttempts`, `deleteAbandonedSession` |
| `results.ts`  | `getSessionSummary`, `getLatestCompletedSessionId`                                                                                  |
| `timer.ts`    | `evaluateTimerProgression`, `logManualTimerChange`, `getTimerEvents`, `getTimerEventForSession`                                     |
| `trends.ts`   | all 9 exports                                                                                                                      |

Pure helpers stay untouched: `mastery.ts`, `format.ts`, `selection.ts`,
`reference.ts`, and the non-DB parts of `facts.ts` take records as arguments and
never query.

Where an id is passed in from a URL (`getSession`, `getSessionSummary`,
`deleteAbandonedSession`), the `kidId` goes into the `WHERE` clause rather than
being asserted afterwards, so another kid's session id returns "not found"
instead of leaking a row.

### Three specific traps

1. **`src/lib/trends.ts:246`** — `LEFT JOIN facts f ON f.a = a.a AND f.b = a.b`
   needs `AND f.kidId = a.kidId`. Once `facts` holds rows for several kids this
   join silently fans out and multiplies rows. It produces wrong numbers, not an
   error, and it is the single most likely bug in this whole change.
2. **`src/lib/sessions.ts`** — the fact upsert's `ON CONFLICT (a, b)` must become
   `ON CONFLICT (kidId, a, b)` to match the new primary key, and `selectFact`
   (`sessions.ts:142`) needs the `kidId` predicate.
3. **`src/lib/timer.ts`** — `evaluateTimerProgression` writes settings via
   `updateSettings` after each session, so the adaptive limit and the parent's
   manual edit both target the same per-kid row. Its recent-sessions query
   (`timer.ts:59`) must be kid-scoped or one kid's performance moves another
   kid's timer.

## 7. Routes

New:

- `/signin` — parent email + password (server action).
- `/signin/kid` — household-scoped kid PIN entry.
- `/setup` — first-run bootstrap; creates the first parent when `parents` is
  empty, and refuses once it is not.
- `/kids` — parent's dashboard: kid list, add/edit/remove, link into each kid's
  stats and settings.

Changed:

- `src/app/page.tsx` — currently the kid's door with links to Trends and
  Settings. Splits by role: parents land on `/kids`, kids get the door with
  "Start practice" plus their own results and trends, and no settings link.
- `src/components/site-nav.tsx` — `LINKS` is a hardcoded array including
  Settings. Becomes role-aware, and carries the active kid for parents.
- `/settings` — moves behind `requireParent`, and takes a `?kidId=`.
- `src/app/api/settings/route.ts`, `api/sessions/route.ts`,
  `api/sessions/[id]/complete`, `api/sessions/[id]/abandon` — each gains a
  `resolveKid` call and returns 401/403 rather than acting unscoped. The
  settings endpoint is parent-only; the session endpoints are the kid's own.

Also: **`deploy.sh`'s smoke test loop asserts `200` for `/`, `/table`,
`/settings`, `/trends`, `/api/settings`.** All of those become redirects or
401s once auth lands, so the deploy will fail its own smoke test. Update it to
expect the redirect, or point it at a genuinely public health route.

## 8. Sequencing

Build the boundary before the surface, so the scoping pass has something to
fail against.

| # | Step                                                            | Est.      |
| - | --------------------------------------------------------------- | --------- |
| 1 | `crypto.ts`, `auth.ts`, `dal.ts`; schema + migration            | 1 day     |
| 2 | Parent auth: `/setup`, `/signin`, session cookie, env secret     | 1 day     |
| 3 | Kid PIN tier: household scoping, hashing, lockout, `/signin/kid` | 0.5 day   |
| 4 | Thread `kidId` through `src/lib` and the API routes              | 0.5–1 day |
| 5 | `/kids` dashboard, per-kid settings and stats                    | 1 day     |
| 6 | Role-aware nav, kid door, route guards, `deploy.sh` fixes        | 0.5 day   |

**4–5 days** total. Nothing architecturally hard; the risk is concentrated
almost entirely in step 4, and step 1 exists to make step 4 type-check.

## 9. Decisions taken, and what was rejected

- **Kids get their own PIN logins**, so they can practise unsupervised, rather
  than a parent handing over a device with an "active kid" cookie. Costs the
  extra half day in step 3 and the household-scoping design.
- **Kids see their own results and trends**, only settings are parent-only. This
  is what keeps `/trends` a single page.
- **Hand-rolled auth over an auth library** — keeps the dependency tree at three
  packages and fits the existing raw-SQL data layer.
- **Stateless signed cookie over a sessions table** — simpler, and per-session
  revocation is not worth a table for a household app. Revisit if remote logout
  is ever wanted.
- **Authorization in the DAL, not `proxy.ts`** — on the Next docs'
  own advice.
- **No `experimental.authInterrupts`** — `redirect()` and status codes do the
  job without an experimental flag.

## 10. Open question, as resolved

`secure: true` on the session cookie means the browser will not send it over
plain HTTP, and this app deploys to `http://<host>` on a LAN. Settled as the
documented escape hatch: `Secure` is on by default and a LAN deployment sets
`INSECURE_COOKIES=1` to opt out knowingly. Browsers exempt `localhost`, so
development is unaffected either way. Gating on `NODE_ENV` was rejected because
it removes the protection on precisely the deployment that is exposed.

## 11. What the build changed

Things learned while implementing, worth keeping with the plan:

- **The `facts` rebuild became a rebuild of every practice table.** `ALTER TABLE
  ADD COLUMN` cannot add a `NOT NULL` foreign key without inventing a default
  for the existing rows, so the create-copy-drop-rename that `facts` needed
  anyway was applied to all six. Row ids are carried across so `/results/<id>`
  links and `sourceSessionId` survive. Verified against the real database: 23
  sessions, 1050 attempts, 81 facts and 244 mastery events preserved, foreign
  key check clean, migration idempotent.
- **`auth_failures` could not use `datetime('now', ...)`.** Timestamps are stored
  as ISO 8601 (`...T16:33:50.859Z`) while `datetime('now')` yields
  `... 16:33:50`, and `T` sorts above the space — so a naive comparison matches
  every row from the same calendar day and would have held a lockout until
  midnight. The lockout window uses
  `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)` instead. **The same latent quirk
  exists in the pre-existing trend windows** (`trends.ts`, `timer.ts`), where it
  widens a 7- or 30-day window to the start of its first day. Left alone
  deliberately: changing it would move numbers users have already seen.
- **A startup check was needed for `SESSION_SECRET`.** Validating it lazily was
  not enough — with no secret, every page still rendered (an absent cookie needs
  no verification) and the failure only surfaced as an opaque 500 at the first
  sign-in. `src/instrumentation.ts` now fails the server's startup check with an
  error naming the variable.
- **`MIN_PASSWORD_LENGTH` and `PIN_LENGTH` moved to `src/lib/account-limits.ts`.**
  Client components need them, and `accounts.ts` reaches the database; the limits
  needed a home with no server-only imports. `accounts.ts` re-exports them.
- **`server-only` is not in the dependency tree**, so the server-only modules are
  not marked with it. They import `next/headers` or `better-sqlite3`, which
  already fail in a client component.
- **The complete endpoint distinguishes 404 from 409.** Scoping alone left
  "another child's session id" surfacing as a 500 from the lib's throw, which
  reads as a server fault in the logs rather than a refused request.
- **A parent cannot start a practice run.** `/run` and the session endpoints
  require a kid session, so attempts are never recorded against a parent. The
  run buttons on `/results/[id]` are hidden for parents accordingly.

### Verification

- 46-check isolation suite over two households: credentials, PIN scoping,
  lockout, per-kid settings, per-kid practice writes, the `LEFT JOIN` fan-out,
  cross-kid session reads, per-kid timer adaptation, and delete cascade.
- Authorization matrix over HTTP for parent, kid and cross-household callers on
  every page and endpoint.
- Cookie tampering: payload rewritten to another parent, role escalated to a kid,
  expiry extended, signature stripped, emptied, replaced and flipped, plus a
  validly signed expired cookie. All refused.
- Migration, claim and fresh-install paths, and `deploy.sh`'s smoke test against
  both a fresh and a set-up instance.

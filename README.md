# Times Tables

Distraction-free multiplication practice for kids, with per-fact mastery tracking
for the parent helping them. A parent signs in, sets up an account for each
child, and controls their practice settings and reads their progress from the
parent side.

The design rule is that the practice run itself shows **nothing** except the
problem and a place to type: no score, no streak, no countdown, no
right/wrong flash. All the measurement happens behind the scenes and is read
afterwards, on separate screens.

> Practice without distraction. Analyse afterward. Adapt the next session.

## How it works

A run is 50 problems, one at a time, keyboard-first — type the answer, press
Enter. Each problem has a time limit (15s by default) that is never displayed;
running out counts as an unanswered attempt and moves on.

**Mastery** is a single 0–100 score per fact, updated with an exponentially
weighted moving average so recent attempts dominate without old ones being
thrown away. Answer *quality* is graded against the time limit that was actually
in force, so a 5s answer under a 6s limit is not scored like a 5s answer under a
15s limit. Bands (Weak → Developing → Strong → Mastered) are derived from the
score, and movement is unrestricted in both directions — a fact can regress.

Facts are tracked **per ordered pair**: `7 × 8` and `8 × 7` are separate records,
because they are not always equally fluent.

Problem selection weights the 50 slots towards the facts that will benefit most
from repetition, so limited practice time is spent where it pays.

### Screens

| Route | For | Shows |
|---|---|---|
| `/` | the child | A start button. Deliberately no scoreboard. |
| `/run` | the child | One problem and an input. Nothing else. |
| `/table` | either | The times table with answers, shaded by mastery. |
| `/results/[id]` | either | What happened in one session. |
| `/trends` | either | Mastery grid and measures over time. |
| `/settings` | parent | Factor pool, time limit, reference table. |
| `/kids` | parent | Every child, their progress at a glance, names and PINs. |
| `/setup` | first run | Creates the first parent account, then closes itself. |
| `/signin` | parent | Email and password. |
| `/signin/kid` | the child | Pick a name, type a PIN. |

A child can read their own results and trends but never their own settings; a
parent can read any child they own. Practice runs are only ever recorded for a
child, so a parent cannot start one.

### The reference table

`/table` is a plain lookup chart — every answer in the active factor pool, with
mastery as a faint wash behind the numbers so the products stay readable.

It can also be shown *during* practice (Settings → Reference table → "Show
during practice"), as deliberate training wheels for a child who would otherwise
guess wrong repeatedly before making progress. Attempts made with it visible
still count towards mastery and trends, so the numbers will read better than
recall while it is switched on — turn it off once answers start to stick.

## Accounts

Two tiers, with no dependency added for either — `node:crypto` provides scrypt
hashing and the HMAC that signs the session cookie.

- **Parents** sign in with an email and password, and own their children.
- **Children** sign in with a PIN alone, so they need no email and no password.

A PIN is short, so it is never checked across the whole instance. Kid sign-in is
**scoped to one household**: a signed, long-lived `household` cookie is set when
a parent signs in on a device, and a PIN is only ever compared against that
parent's children. On a device where no parent has ever signed in, kid sign-in is
not offered at all. Repeated failures lock a credential out for 15 minutes.

Authorization lives in `src/lib/dal.ts`. Two rules keep it reviewable: every
database function in `src/lib` takes `kidId` as an explicit first argument, so a
missing scope is a type error rather than a silent cross-account read; and
nothing in `src/lib` reads a cookie to discover "the current child" — routes
resolve the child and pass the id down.

## Running it

Requires Node 20+.

```bash
npm install
echo "SESSION_SECRET=$(openssl rand -base64 32)" > .env.local
npm run dev          # http://localhost:3000
```

`SESSION_SECRET` signs session cookies and is **required**. There is deliberately
no built-in default: a default in a public repository would let anyone forge a
cookie on every deployment that never set one. If it is missing, the server fails
its startup check (`src/instrumentation.ts`) and every request returns 500 with
the variable named in the log — rather than appearing healthy and then failing
opaquely at the first sign-in, which is what happens if the check is deferred
until a cookie actually needs signing.

Keep it out of version control (`.env.local` is gitignored) and keep it stable:
changing it signs everyone out.

Data is a local SQLite file at `data/practice.db`, created on first run. There
are no network calls. The first visit lands on `/setup`, which creates the first
parent account and then closes permanently.

Upgrading a database from before accounts existed needs no action: its practice
history is adopted into a single household on first start, and `/setup` asks you
to name it and set the credentials.

### Production

```bash
npm run build
npm start            # add -- --port 80 --hostname 0.0.0.0 to serve on a LAN
```

Set `SESSION_SECRET` in the service environment (or a `.env` file on the server;
`deploy.sh` excludes both `.env` and `.env.local` from the rsync so the server
keeps its own).

Session cookies are marked `Secure`, which means a browser will not send them
over plain HTTP. Browsers exempt `localhost`, so development is unaffected, but
**a LAN deployment served over HTTP must set `INSECURE_COOKIES=1`** or sign-in
will appear to silently fail. That is deliberately an explicit opt-in rather than
an automatic `NODE_ENV` check, so the protection is never lost quietly on exactly
the deployment that is exposed.

`deploy.sh` builds locally and rsyncs to a server over ssh, which keeps the
build off small hardware:

```bash
./deploy.sh my-server http://my-server
```

Two things it handles that are easy to get wrong when shipping a prebuilt
Next.js app:

- **`.next/node_modules` must be copied.** Turbopack resolves
  `serverExternalPackages` through a content-hashed name satisfied only by a
  symlink the build writes there. Copy `.next` without it and the app starts,
  listens, serves 404s correctly, and 500s on every route that touches the
  database. Note that rsync's `--exclude 'node_modules/'` is unanchored and
  matches `.next/node_modules/` too — anchor it as `/node_modules/`.
- **`npm ci --ignore-scripts` on the server.** `better-sqlite3` ships a prebuilt
  N-API binary, but npm auto-runs `node-gyp` whenever a package has a
  `binding.gyp`, so without this the server needs a full C++ toolchain to
  rebuild something it already has.

## Layout

```
src/app/          routes (App Router)
src/components/   reference table, charts, nav
src/lib/          mastery model, fact selection, sessions, accounts, db + migrations
src/lib/dal.ts    the one place that decides who may read which child's data
project.md        the original spec this was built from
plan-accounts.md  the plan the account tiers were built from
```

`src/lib/mastery.ts` is where the scoring model lives, and is the file to read
first if you want to change how mastery behaves.

## Licence

MIT — see [LICENSE](LICENSE).

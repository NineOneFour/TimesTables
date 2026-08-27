# Times Tables

Distraction-free multiplication practice for kids, with per-fact mastery tracking
for the adult helping them.

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
| `/results/[id]` | the adult | What happened in one session. |
| `/trends` | the adult | Mastery grid and measures over time. |
| `/settings` | the adult | Factor pool, time limit, reference table. |

### The reference table

`/table` is a plain lookup chart — every answer in the active factor pool, with
mastery as a faint wash behind the numbers so the products stay readable.

It can also be shown *during* practice (Settings → Reference table → "Show
during practice"), as deliberate training wheels for a child who would otherwise
guess wrong repeatedly before making progress. Attempts made with it visible
still count towards mastery and trends, so the numbers will read better than
recall while it is switched on — turn it off once answers start to stick.

## Running it

Requires Node 20+.

```bash
npm install
npm run dev          # http://localhost:3000
```

Data is a local SQLite file at `data/practice.db`, created on first run. There
are no accounts and no network calls — it is a single-user local app.

### Production

```bash
npm run build
npm start            # add -- --port 80 --hostname 0.0.0.0 to serve on a LAN
```

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
src/lib/          mastery model, fact selection, sessions, db + migrations
project.md        the original spec this was built from
```

`src/lib/mastery.ts` is where the scoring model lives, and is the file to read
first if you want to change how mastery behaves.

## Licence

MIT — see [LICENSE](LICENSE).

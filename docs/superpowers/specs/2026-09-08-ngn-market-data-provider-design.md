# NGN Market Data Provider for Ghostfolio

**Date:** 2026-09-08
**Status:** Approved, phase 1 of 3
**Repo:** `junydania/ghostfolio` (personal fork, tracks upstream)

## Context

Goal: personal wealth-management on Ghostfolio covering the Nigerian Exchange
(NGX), ultimately producing buy/avoid signals. That is three subsystems, not one:

1. **NGN Market data provider** — Ghostfolio speaks NGX. _(this spec)_
2. **Market analytics store** — periodic capture of exchange-wide cross-sections
   so signals have history Ghostfolio's `MarketData` table does not keep.
3. **Signals & alerts** — rules over #2, plus delivery.

Each gets its own spec/plan cycle. This document covers #1 only.

## Decisions taken

| Decision       | Choice                                          | Rationale                                                                                                                        |
| -------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Fork strategy  | In-tree, rebase on upstream                     | NGX assets behave like any other asset everywhere in the app. Kept viable by holding the diff additive.                          |
| API plan       | Hobby (10k calls/month, 60/min)                 | Unlocks `/companies/{symbol}` and `/companies/{symbol}/chart`, the minimum for price history.                                    |
| Currency       | Mixed portfolio; NGN Market serves NGN FX pairs | Yahoo's NGN rate tracks the official window and diverges from transactable rates.                                                |
| Quote strategy | REST, bulk-first (Approach A)                   | `GET /companies` returns the whole exchange in 1-2 calls. Per-symbol polling would exhaust a 10k quota in days.                  |
| WebSocket      | Deferred to subsystem #3                        | Push freshness is capped by NGN Market's own 20-minute refresh; a long-lived connection earns its keep in alerting, not polling. |

## Hobby-tier constraints

- **10,000 REST calls/month, 60/min.** Bulk-first design costs ~1-2k.
- **Chart history clamped to 2 years, silently** — the response returns a
  narrower `start_date` rather than erroring.
- **Starter+ endpoints unavailable:** dividends, movers, news, financials.
- **WebSocket traffic is outside the REST quota** on every plan.
- **Prices refresh every 20 min** during NGX hours (Mon-Fri 09:00-16:00 WAT).

## Diff surface

**New files** (no conflict risk):

- `apps/api/src/services/data-provider/ngn-market/ngn-market.service.ts`
- `apps/api/src/services/data-provider/ngn-market/interfaces/*.ts`
- `apps/api/src/services/data-provider/ngn-market/ngn-market.service.spec.ts`
- `prisma/migrations/<ts>_added_ngn_market_to_data_source/migration.sql`

**Edited files** (additive):

- `prisma/schema.prisma` — one `DataSource` enum member
- `data-provider.module.ts` — import, provider, factory
- `configuration.service.ts`, `environment.interface.ts` — `API_KEY_NGN_MARKET`
- `exchange-rate-data.service.ts` — FX routing override _(only behavioural change)_

## Symbol and currency model

NGX symbols stored on `SymbolProfile` with `dataSource: NGN_MARKET`,
`currency: 'NGN'`. Ghostfolio persists data source per profile, so there is no
collision with Yahoo tickers; `canHandle()` returns `true` as FMP's does.

Equities map to `AssetClass.EQUITY` / `AssetSubClass.STOCK`, carrying `sector`
and `sub_sector` onto the profile with `countries` pinned to Nigeria — which
makes the existing regional-market and sector X-ray rules work unmodified.

## FX routing

`prepareCurrencyPairs()` stamps one global data source onto every pair. Setting
`DATA_SOURCE_EXCHANGE_RATES=NGN_MARKET` wholesale would break `USDEUR`, since
NGN Market knows only NGN-foreign pairs.

Override: when `currency2 === 'NGN'`, use `NGN_MARKET`; otherwise keep the
configured default. The provider recognises `^[A-Z]{3}NGN$` symbols in
`getQuotes()`/`getHistorical()`, mirroring FMP's `isCurrencySymbol()` branch.

The 2-year clamp applies to `/forex/history`, so NGN rates before ~2024 will not
backfill.

## Data flow

| Method              | Endpoint                                             | Notes                                                 |
| ------------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| `search()`          | `GET /companies/identifiers` (Free)                  | Full list, filtered in-process, cached in-memory 24h. |
| `getQuotes()`       | `GET /companies?limit=200` (Free)                    | 1-2 calls; `marketState: 'delayed'`.                  |
| `getHistorical()`   | `GET /companies/{symbol}/chart?format=ohlcv` (Hobby) | Maps to `{ 'YYYY-MM-DD': { marketPrice: close } }`.   |
| `getAssetProfile()` | `GET /companies/{symbol}` (Hobby)                    | ISIN from `international_sec_id`.                     |
| `getDividends()`    | —                                                    | Returns `{}`; Starter-gated, an honest no-op.         |
| FX pairs            | `/forex/current` (Free), `/forex/history` (Hobby)    | Matched by `^[A-Z]{3}NGN$`.                           |

`getMaxNumberOfSymbolsPerRequest()` is deliberately **not** implemented — it
defaults to `MAX_SAFE_INTEGER`, handing the provider every symbol in one batch,
which is what a bulk endpoint wants. No provider-level cache either:
`DataProviderService` already caches quotes per symbol in Redis.

## Error handling

Governing principle: **a provider problem degrades to missing data, never a
broken portfolio.** Snapshots span all providers; throwing would take Yahoo
holdings down with NGX ones.

- `401`/`403` — log once at error level, return empty.
- `429` — honour `Retry-After`, return empty; do not retry into the limit.
- **Quota telemetry** — warn when `meta.calls_remaining` drops below 10% of
  `calls_limit`. Stops the integration dying silently mid-month.
- **Silent clamping** — compare `statistics.start_date` to the requested `from`
  and log when they differ, so backfill gaps are visible.
- **Nullable fundamentals** — `ttm_eps`, `pb_ratio`, `dividend_yield` etc. are
  `null` when balance-sheet data is missing; every read guarded.
- **Chart nulls** — only `close` is guaranteed; points without it are skipped,
  never written as zero, which would poison performance maths.
- Unknown symbol — `AssetProfileInvalidError`.

## Testing

Data providers in this repo are largely untested (only the Yahoo data enhancer
has a spec), so this follows the repo's broader Jest convention. HTTP calls stay
thin; every API-shape decision lives in pure mapping functions (`toQuote`,
`toHistorical`, `toAssetProfile`) tested against recorded fixtures. That covers
what actually breaks: null handling, the clamp check, the FX branch, symbol
casing.

Manual verification: add DANGCEM to a watchlist, confirm price and 2-year chart
render, confirm `USDNGN` appears in exchange rates, confirm the app boots with
`API_KEY_NGN_MARKET` unset.

## Explicitly out of scope

- Dividend auto-population (Starter-gated).
- Exchange-wide screening over all ~150 NGX listings (subsystem #2).
- Any buy/avoid signal or alert (subsystem #3).

## Setup

Two environment variables are required. `.env.example` upstream documents no
provider keys (not even Financial Modeling Prep's), so these are recorded here
rather than added to it:

```bash
# Your NGN Market key (Hobby plan or higher for price history)
API_KEY_NGN_MARKET=ngm_live_...

# NGN_MARKET must be added to the selectable data sources
DATA_SOURCES=["COINGECKO","MANUAL","NGN_MARKET","YAHOO"]
```

Then apply the migration:

```bash
npx prisma migrate deploy   # or `prisma migrate dev` in development
```

`API_KEY_NGN_MARKET` also acts as the switch for NGN exchange-rate routing: when
it is unset, `getDataSourceForCurrencyPair()` falls through to the globally
configured source and the integration is inert.

---

# Subsystem #2 — NGX market analytics store

Ghostfolio tracks only what you own or watch. This captures an exchange-wide
daily cross-section so signals have history to reason over.

**Shared HTTP client.** `NgnMarketApiService` was extracted from the phase-1
provider so the provider and the capture job share one client — with one set of
error semantics. Only an explicit 404 sets `isNotFound`; everything else
degrades to `{data: null}`.

**Capture.** `@Cron('0 17 * * 1-5', { timeZone: 'Africa/Lagos' })` — one hour
after the 16:00 WAT close, weekdays, timezone pinned so it is correct regardless
of server TZ. One `/market/snapshot` plus at most two `/companies?limit=200`
pages: **≤3 calls per run**, roughly 60 a month against a 10,000 quota. Gated on
`API_KEY_NGN_MARKET`, wrapped in try/catch so a DB blip cannot kill the process.

**Idempotency.** `upsert` on `[date, symbol]` and `date`, chunked 25 per
transaction. The trading date normalises to UTC midnight of the _Lagos_
calendar day (WAT is a fixed UTC+1, no DST), resolved from `snapshot.date` →
`snapshot.updated_at` → company `last_updated` → caller clock. Rows without a
finite `price` are skipped, never written as zero.

**Screener API**, all reading stored data only (zero API quota):
`GET /api/v1/ngx-analytics/{movers,sectors,breadth,symbols/:symbol}`.

## The envelope hazard

Both the quote path and the capture loop originally did
`if (!Array.isArray(data)) break`. The skill documents `/companies` only as
returning `CompanyListItem[]`, but documents `/account/logs` as returning
`{logs[], pagination{}}` — so paginated endpoints on this API do wrap. Had
`/companies` wrapped, the result would have been **zero quotes and zero captured
rows with no error**: indistinguishable from an exchange with no listings.

`extractListPayload()` now accepts a bare array or any of `data`/`items`/
`results`/`companies`, and returns `null` — not `[]` — when it recognises
nothing, so the caller logs a real failure. This is the general lesson for this
integration: **an empty result and an unparsed result must never look the same.**

---

# Notification layer — Resend

Resend is a plain HTTP API, so the digest needs **no new dependency**;
`package.json` and the lockfile stay untouched, which keeps upstream rebases
clean. SMTP would have required `nodemailer`.

- **Daily send** every trading day, with the verdict in the subject:
  `NGX signals 2026-09-08 — 2 buy, 1 avoid`, or `— no action` on a quiet day, so
  the mail can be triaged from the inbox list without being opened.
- **Rationale is rendered as evidence**, not prose — the numbers that produced
  each signal. An unexplained signal cannot support a buying decision.
- **HTML is escaped.** Symbols and rationale originate from an external API and
  land in an email body.
- **Delivery failures are logged and swallowed.** A mail outage must not fail
  the job that computed the signals — that would trade the signals for the
  email.
- Reads `NgxSignal` and `NgxMarketSnapshot` directly rather than depending on
  the signals module, so a change to that module's API cannot break delivery.

Config: `RESEND_API_KEY`, `NGX_DIGEST_FROM_EMAIL`, `NGX_DIGEST_TO_EMAIL`. Unset,
the digest logs once and skips.

---

# Subsystem #3 — signals engine

Signals are **derived and explainable, never predictive**. `score` is signed and
bounded to [-1, 1]: positive is evidence for buying, negative against. It is
evidence strength, not a probability, forecast or advice — and the UI is held to
the same line.

Every signal's `rationale` records the values compared, the thresholds tested,
the observation count behind them, and the regime block. An unexplained signal
cannot support a buying decision.

**Rules** (minimum observations in brackets; below it a rule returns _nothing_,
never a weakened signal computed from too little history):

- **Moving-average trend** [25] — price vs its 20-day SMA, gated on the SMA's own
  slope, so price above a _falling_ average reads as a bounce (WATCH) rather than
  a trend. Thresholds are asymmetric (+3% / −5%) because thin NGX counters dip
  below their average routinely.
- **Relative strength** [8 for the 7d leg, 31 for the 30d] — return vs the
  exchange-wide median, degrading to 7d alone while history accumulates and
  naming the horizons used, so a 7-day signal is never mistaken for a 30-day one.
  A horizon backed by fewer than 20 symbols is dropped: a median over a handful
  of names is not the exchange.
- **52-week position** [1] — the only rule that works from day one, since the
  bounds come from the API. Requires the range to span ≥5% of price.
- **Volume anomaly** [21] — volume vs a 20-observation trailing average, with the
  day's price move deciding direction. A busy but directionless day is WATCH.

**Regime gate.** Breadth plus ASI vs its 10-day average. A bearish regime demotes
BUY→WATCH and halves the score; it never promotes, and never touches AVOID or
WATCH. A wrong regime call therefore costs a missed signal, not a bad one.
No market snapshot → regime UNKNOWN, recorded in every rationale, no demotion.

**Re-evaluation replaces, never appends.** `evaluate()` upserts on
[date, symbol, type] and deletes signals for that date the rules no longer
produce, so a corrected snapshot cannot leave a stale BUY behind.

## Daily chain

One cron at `0 17 * * 1-5` (Africa/Lagos): **capture → evaluate → digest**, in
that order, each depending on the one before. A failure part-way stops the
chain rather than reporting on stale data. `CronService` is built by a
positional `useFactory`, so any new dependency must be added in five
coordinated places — `inject`, factory params, the `new CronService(...)` call,
module `imports`, and the constructor — or the argument mapping shifts silently.

# In-app page

`/ngx`, with signals grouped BUY / WATCH / AVOID and a screener (movers,
sectors, breadth) plus per-symbol drill-down. Each card renders the rationale as
evidence — observed values beside the thresholds tested — not a number and a
colour. Empty and partial-history states are first class: the tables fill one
trading day at a time and an empty BUY group is a normal outcome, so the page
explains that rather than looking broken.

# Status and the standing caveat

All four pieces are implemented, typechecked, linted and unit-tested
(60 API suites / 393 tests; client builds clean).

**None of it has run against the live NGN Market API or a Postgres database.**
Every response shape traces to `.agents/skills/ngnmarket/SKILL.md`. No migration
has been applied; no upsert has executed, so idempotency is argued from unique
constraints rather than demonstrated. Thresholds are reasoned, not calibrated
against real NGX distributions, and are worth revisiting once a few weeks of
snapshots exist.

Two shape bugs were already caught by re-reading documentation rather than by
running anything: the forex `rate`/`inverse_rate` inversion (wrong by a factor
of ~2.6 million) and the `/companies` envelope (would have failed silently and
totally). Expect the first live run to surface more of the same class.

## Bringing it up

```bash
API_KEY_NGN_MARKET=ngm_live_...
DATA_SOURCES=["COINGECKO","MANUAL","NGN_MARKET","YAHOO"]
RESEND_API_KEY=re_...
NGX_DIGEST_FROM_EMAIL=...
NGX_DIGEST_TO_EMAIL=...
```

```bash
npx prisma migrate deploy
```

Then search for `DANGCEM`, and let one capture run at 17:00 WAT.

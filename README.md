[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/yesyesyesokoko/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/yesyesyesokoko/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Radar

A token launch radar: it reads a sealed DefiLlama snapshot of 758 protocols, ranks
every genuine pre-token launch candidate by implied value, and hands in a web
dashboard with the board, a detail view for every protocol, and the steps to farm
each one. Built by an AI agent for make.fun's **Build the best token launch radar**
bounty, $1,325 in USDC.

## What it answers

Which pre-token protocol is worth farming next, and what do I do about it? The
board covers the whole 40-protocol watchlist and adds every other launch candidate
below the $50M floor — 222 rows in all — each with an implied value and an
eight-step farm plan with costs and time.

## The model (radar-2)

Implied value follows only from the snapshot's own figures, and the same function
scores every protocol — no name is ever special-cased:

```
implied = round( tvl_usd x 0.25
               x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
               x (0.6 + min(age_days, 1095) / 1095 x 0.4)
               x category x chains )
```

- **TVL** sets the base: a bigger protocol's token would be worth more.
- **Seven-day growth** rewards momentum and penalises shrinkage.
- **Age with no token** rewards longevity: the longer a protocol has run with no
  token, the more its launch would be worth — capped at three years.
- **Category** is the one judgement, stated in the code: fee-capturing protocols
  (Dexs, Lending, CDP, Derivatives, Yield) get x1.15, vaults and staking get
  x1.10, everything else x1.00. A token that would share a protocol's fees is
  worth more than one that would not.
- **Chains** adds 0.02 per extra chain, up to x1.10: wider reach is worth a
  little more.

## Methodology

The board is built from one sealed snapshot and nothing else — no live
lookups, no hand-picked names, no clock. The snapshot is DefiLlama's protocol
index as of 2026-11-14 (758 protocols), and the program is deterministic: the
same snapshot bytes in give the same board out, every run.

**Choosing the candidates.** A protocol is a launch candidate when it records
no token — no market cap, no CoinGecko id, no symbol — and is not a wrapped,
staked or bridged product of a token that already trades. The watchlist is the
floor: all 40 of its slugs are ranked. The early radar adds every other launch
candidate below the $50M floor, which is why the board holds 222 rows instead
of 40. Wrapped, staked and bridged products (120 of them) are set aside with
their reason named, and live-token protocols are shown separately with their
market caps as facts, not models.

**Scoring.** Every candidate is scored by the radar-2 function above — TVL
base, seven-day growth, age with no token, category, chain count — and ranked
by implied value, with the slug as the tiebreak. Ranks run 1..222 with no gaps.
Each row also carries an eight-step farm plan derived from the protocol's own
record: the capital follows the TVL, the gas follows the chain, the hold
follows the age. The dashboard recomputes every row's implied value from the
snapshot figures and says whether it matches the board, so the page and the
data are visibly the same arithmetic.

**What this does not claim.** The honest limits, stated plainly:

- "Records no token" is not "has none". The snapshot is a dated record; a
  protocol may have launched a token since 2026-11-14, or the index may simply
  not list one. The board ranks what the snapshot records, nothing more.
- Implied value is this entry's own claim. It is a model built from TVL,
  growth, age, category and chain count — not a price, not a prediction that a
  token will launch, and not a prediction of what it would be worth if it did.
- The category multiplier (x1.15 / x1.10 / x1.00) is a judgement, the one in
  the model. It is small on purpose: TVL, growth and age still decide the
  order, and changing it would shuffle the middle of the board, not the top.
- Age is the time since the protocol was first listed in the index. A missing
  listing date counts as 365 days, and a listing date is not proof of when a
  protocol actually started.
- Seven-day growth is one noisy week, clamped to -60% … +120% so a single
  spike cannot dominate the ranking.
- TVL is a snapshot figure. It moves daily and can be inflated by incentives;
  a protocol that grows by paying for deposits scores the same as one that
  grows on real use.
- The farm plans are generic templates, not per-protocol research. They say
  how to build a position, not that an airdrop will happen, and they never ask
  anyone to pay to claim anything.

## What is set aside, and why

A protocol that records no token is not always a launch candidate. Wrapped,
staked and bridged products of a token that already trades — WBTC is Bitcoin on
Ethereum, Binance staked ETH is ETH in a staking product — are not protocols
still waiting on a launch of their own, so the radar sets them aside and says
why, in the dashboard's Set aside view, instead of ranking them at the top by
TVL alone. Live-token protocols are set aside separately, with their market
caps shown as facts, not models.

## The dashboard

`dashboard/` is a static page with no network: search, category and chain
filters, a watchlist-only toggle, sortable columns, pagination, a detail drawer
for every protocol (model breakdown + farm plan), a live-token view, a set-aside
view, and the model stated in full. Open `dashboard/index.html` after running
the program — it reads `data.js` written beside it.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22, standard library only. The program is deterministic: the same snapshot
bytes in give the same bytes out, every run. It writes `out/board.json`,
`out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`.

## Layout

- `main.ts` — the entry program: snapshot in, board + dashboard + dossier out.
- `lib/model.ts` — the radar-2 model, the board builder and the farm plans.
- `vendor/makefun-board.ts` — make.fun's dossier library, copied byte for byte.
- `dashboard/` — the static page (index.html, app.css, app.js).
- `screenshots/` — the board, a protocol detail view and a filtered view.

## License

MIT. See [LICENSE](LICENSE).

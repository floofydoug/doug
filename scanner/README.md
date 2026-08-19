# EDGAR special-situations scanner

Feeds the `/finances` page. Detectors query [SEC EDGAR full-text search](https://efts.sec.gov/LATEST/search-index)
for capacity-constrained special situations:

- **odd-lot-tender** — SC TO-I / SC TO-T / SC 13E3 filings mentioning "odd lot"
- **reverse-split-roundup** — 8-K / DEF 14A / PRE 14A filings with both
  "reverse stock split" and "rounded up to the nearest whole share"

Every hit is a *candidate*: read the filing before treating it as an opportunity
(odd-lot preference terms, round-up vs cash-in-lieu, beneficial vs record holder).

## Local run

```bash
node scanner/scan.js       # writes static/data/scanner.json
```

## Production (AWS, thanhphung.com account 045152135404, us-west-1, profile `claude-dev`)

- **Lambda** `finances-edgar-scanner` (nodejs20.x, handler `lambda.handler`,
  env `DATA_BUCKET=dougphung-finances-data`, `DATA_KEY=scanner.json`)
- **Schedule** EventBridge rule `finances-edgar-scanner-schedule`,
  `cron(17 11,17,23 ? * MON-FRI *)` UTC ≈ 7:17a / 1:17p / 7:17p ET weekdays
- **Output** `s3://dougphung-finances-data/scanner.json`, public-read with CORS
  for dougphung.com — the page fetches
  `https://dougphung-finances-data.s3.us-west-1.amazonaws.com/scanner.json`
- **IAM role** `finances-scanner-lambda` (basic execution + PutObject on the one key)

Deploy an update:

```bash
cd scanner && zip -j /tmp/scanner-lambda.zip scan.js lambda.js
aws lambda update-function-code --function-name finances-edgar-scanner \
  --zip-file fileb:///tmp/scanner-lambda.zip --profile claude-dev --region us-west-1
```

## Bank promotions

`promotions.js` + `promotions-lambda.js` — pulls Doctor of Credit's
bank-account-bonuses RSS feed and maintains a cumulative 2026 archive.

- **Lambda** `finances-bank-promos` (same role/bucket, `DATA_KEY=promotions.json`)
- **Schedule** `finances-bank-promos-schedule`, daily `cron(23 13 * * ? *)` UTC
- **Local backfill**: `PROMO_BACKFILL_PAGES=90 node scanner/promotions.js`

## Backtest

`backtest-2026.js` — one-off sweep of 2026 YTD filings for both detectors,
pricing max participation (99-share tenders, 1-share round-ups) via Yahoo
chart data with split-event-corrected raw prices → `static/data/backtest-2026.json`.

## Portfolio

`static/data/portfolio.json` is the hand-edited trade log rendered on the page:
positions at cost, realized P&L computed from `closed` entries.

/**
 * 2026 missed-opportunities backtest.
 *
 * Sweeps EDGAR full-text search from Jan 1 2026 to today for the same two
 * detectors as the live scanner, reads each filing to classify it, prices the
 * trade with Stooq daily data, and estimates what maximum participation would
 * have earned:
 *   - odd-lot tenders: buy 99 shares at the close on filing day, tender at the
 *     fixed offer price
 *   - reverse-split round-ups: buy 1 pre-split share at the close on filing
 *     day, receive 1 whole post-split share, sell ~2 weeks later
 *
 * Best-effort extraction: every row carries a status —
 *   priced        automated estimate computed
 *   nav-repurchase interval-fund/CEF repurchase at NAV (excluded from totals)
 *   no-spread     fixed-price tender at/below market on filing day
 *   review        couldn't parse price/ratio/ticker — needs a human read
 *
 * Run: node scanner/backtest-2026.js   → writes static/data/backtest-2026.json
 */

const fs = require("fs")
const path = require("path")

const USER_AGENT = "dougphung.com edgar backtest phung.doug@gmail.com"
const START = "2026-01-01"
const OUTPUT = path.join(__dirname, "..", "static", "data", "backtest-2026.json")

const sleep = ms => new Promise(r => setTimeout(r, ms))
const isoDate = d => d.toISOString().slice(0, 10)

async function fetchWithRetry(url, headers = {}) {
  let lastError
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, ...headers },
      })
      if (res.ok) return res
      lastError = new Error(`${res.status} for ${url}`)
    } catch (err) {
      lastError = err
    }
    await sleep(1500 * attempt)
  }
  throw lastError
}

async function ftsPage(query, forms, from) {
  const params = new URLSearchParams({
    q: query,
    forms: forms.join(","),
    dateRange: "custom",
    startdt: START,
    enddt: isoDate(new Date()),
    from: String(from),
  })
  const res = await fetchWithRetry(
    `https://efts.sec.gov/LATEST/search-index?${params}`,
    { Accept: "application/json" }
  )
  return res.json()
}

async function ftsAll(query, forms, cap = 400) {
  const all = []
  let from = 0
  let total = Infinity
  while (from < Math.min(total, cap)) {
    const json = await ftsPage(query, forms, from)
    total = json?.hits?.total?.value ?? 0
    const hits = json?.hits?.hits || []
    if (hits.length === 0) break
    all.push(...hits)
    from += hits.length
    await sleep(250)
  }
  return { all, total }
}

function hitMeta(hit) {
  const source = hit._source || {}
  const [adsh, filename] = String(hit._id || "").split(":")
  const cik = (source.ciks || [])[0]
  const name = (source.display_names || [])[0] || "Unknown filer"
  const tickerMatch = name.match(/\(([A-Z]{1,5})(?:,|\))/)
  return {
    adsh,
    filed: source.file_date || "",
    form: (source.root_forms || [])[0] || source.file_type || "",
    company: name.replace(/\s*\(CIK.*$/, "").trim(),
    ticker: tickerMatch ? tickerMatch[1] : null,
    url:
      cik && filename
        ? `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${adsh.replace(/-/g, "")}/${filename}`
        : null,
  }
}

async function filingText(url) {
  if (!url) return ""
  try {
    const res = await fetchWithRetry(url)
    const html = await res.text()
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 400000)
  } catch {
    return ""
  }
}

// ---- price data (Stooq daily CSV, split-adjusted) ----

const priceCache = new Map()

// Yahoo chart API. The close series is retroactively adjusted for later splits,
// so raw historical prices are reconstructed using the returned split events:
// rawClose(D) = adjClose(D) × Π over splits after D of (numerator/denominator).
async function priceData(ticker) {
  if (!ticker) return null
  const key = ticker.toUpperCase()
  if (priceCache.has(key)) return priceCache.get(key)
  try {
    const res = await fetchWithRetry(
      `https://query1.finance.yahoo.com/v8/finance/chart/${key}?range=1y&interval=1d&events=splits`,
      { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" }
    )
    const json = await res.json()
    const result = json?.chart?.result?.[0]
    const timestamps = result?.timestamp || []
    const closesRaw = result?.indicators?.quote?.[0]?.close || []
    const closes = timestamps
      .map((t, i) => ({
        date: isoDate(new Date(t * 1000)),
        close: closesRaw[i],
      }))
      .filter(c => Number.isFinite(c.close))
    const splits = Object.values(result?.events?.splits || {})
      .map(s => ({
        date: isoDate(new Date(s.date * 1000)),
        factor: s.numerator / s.denominator, // 1-for-10 reverse split → 0.1
        ratio: Math.round(s.denominator / s.numerator),
      }))
      .sort((a, b) => (a.date < b.date ? -1 : 1))
    const data = closes.length ? { closes, splits } : null
    priceCache.set(key, data)
    await sleep(350)
    return data
  } catch {
    priceCache.set(key, null)
    return null
  }
}

const splitFactorAfter = (data, date) =>
  data.splits
    .filter(s => s.date > date)
    .reduce((f, s) => f * s.factor, 1)

const rawCloseOnOrAfter = (data, date) => {
  const point = data?.closes.find(c => c.date >= date)
  return point ? point.close * splitFactorAfter(data, point.date) : null
}

const rawCloseBefore = (data, date) => {
  const before = data?.closes.filter(c => c.date < date)
  const point = before?.[before.length - 1]
  return point ? point.close * splitFactorAfter(data, point.date) : null
}

const closeOnOrAfter = (closes, date) =>
  closes?.find(c => c.date >= date)?.close ?? null

const WORD_NUMS = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, twelve: 12, fifteen: 15, twenty: 20, "twenty-five": 25, thirty: 30,
  forty: 40, fifty: 50, sixty: 60, seventy: 70, "seventy-five": 75, eighty: 80,
  ninety: 90, hundred: 100, "one hundred": 100, "two hundred": 200,
}

function parseSplitRatio(text) {
  const numeric = text.match(/(?:1|one)[- ](?:for|to)[- ]([0-9,]+)/i)
  if (numeric) {
    const n = parseInt(numeric[1].replace(/,/g, ""), 10)
    if (n >= 2 && n <= 10000) return n
  }
  const wordy = text.match(/(?:1|one)[- ](?:for|to)[- ]([a-z]+(?:[- ][a-z]+)?)/i)
  if (wordy) {
    const key = wordy[1].toLowerCase().replace(/\s+/g, "-")
    if (WORD_NUMS[key]) return WORD_NUMS[key]
    const first = key.split("-")[0]
    if (WORD_NUMS[first]) return WORD_NUMS[first]
  }
  const ratioOf = text.match(/ratio of[^.]{0,30}?([0-9,]+)[- ]to[- ]1/i)
  if (ratioOf) {
    const n = parseInt(ratioOf[1].replace(/,/g, ""), 10)
    if (n >= 2 && n <= 10000) return n
  }
  return null
}

// ---- detectors ----

async function backtestTenders() {
  const { all, total } = await ftsAll(`"odd lot"`, ["SC TO-I", "SC TO-T", "SC 13E3"])
  console.log(`tenders: ${all.length} filings fetched (of ${total})`)

  // one row per company — earliest filing wins (amendments repeat)
  const byCompany = new Map()
  for (const hit of all) {
    const meta = hitMeta(hit)
    const existing = byCompany.get(meta.company)
    if (!existing || meta.filed < existing.filed) byCompany.set(meta.company, meta)
  }

  const rows = []
  for (const meta of byCompany.values()) {
    const text = await filingText(meta.url)
    await sleep(150)
    const row = { type: "odd-lot-tender", ...meta }

    // strip par-value boilerplate ("par value $0.001 per share") before price search
    const cleaned = text.replace(/par value[^$]{0,40}\$\s*[0-9.]+(\s*per share)?/gi, " ")

    const navBased =
      (/net asset value/i.test(cleaned) &&
        !/(?:purchase|offer|tender).{0,60}\$\s*[0-9]+(?:\.[0-9]+)?\s*per share/i.test(cleaned)) ||
      /interval fund/i.test(cleaned)
    if (navBased) {
      row.status = "nav-repurchase"
      rows.push(row)
      continue
    }
    if (!meta.ticker) {
      row.status = "unlisted"
      row.detail = "no listed ticker (non-traded fund?)"
      rows.push(row)
      continue
    }

    const priceMatch =
      cleaned.match(
        /(?:purchase price|offer price|cash price|price)\s*(?:of|equal to)?\s*\$\s*([0-9]+(?:\.[0-9]+)?)\s*(?:in cash\s*)?per share/i
      ) || cleaned.match(/\$\s*([0-9]+(?:\.[0-9]+)?)\s*in cash,?\s*per share/i)
    const hasOddLotPreference =
      /odd lot/i.test(cleaned) &&
      /(without proration|not.{0,20}subject to proration|accepted.{0,40}(in full|priority))/i.test(cleaned)

    if (!priceMatch || parseFloat(priceMatch[1]) < 0.25) {
      row.status = "review"
      row.detail = "offer price not parsed"
      rows.push(row)
      continue
    }

    const offer = parseFloat(priceMatch[1])
    const data = await priceData(meta.ticker)
    const entry = rawCloseOnOrAfter(data, meta.filed)
    if (!entry) {
      row.status = "review"
      row.detail = `offer $${offer} — no price data for ${meta.ticker}`
      rows.push(row)
      continue
    }

    const spread = offer - entry
    row.offer = offer
    row.entry = entry
    row.oddLotPreference = hasOddLotPreference
    if (spread <= 0) {
      row.status = "no-spread"
      row.detail = `offer $${offer} vs market $${entry.toFixed(2)}`
    } else {
      row.status = "priced"
      row.assumed = "99 shares at filing-day close"
      row.profit = Math.round(spread * 99 * 100) / 100
      row.detail = `offer $${offer} vs $${entry.toFixed(2)} → $${row.profit} on 99 sh`
    }
    rows.push(row)
  }
  return rows
}

async function backtestReverseSplits() {
  const { all, total } = await ftsAll(
    `"reverse stock split" "rounded up to the nearest whole share"`,
    ["8-K"]
  )
  console.log(`reverse splits: ${all.length} filings fetched (of ${total})`)

  const byCompany = new Map()
  for (const hit of all) {
    const meta = hitMeta(hit)
    const existing = byCompany.get(meta.company)
    if (!existing || meta.filed < existing.filed) byCompany.set(meta.company, meta)
  }

  const rows = []
  for (const meta of byCompany.values()) {
    const text = await filingText(meta.url)
    await sleep(150)
    const row = { type: "reverse-split-roundup", ...meta }

    if (/cash in lieu/i.test(text) && !/rounded up/i.test(text)) {
      row.status = "review"
      row.detail = "cash-in-lieu language — likely no round-up"
      rows.push(row)
      continue
    }
    if (!meta.ticker) {
      row.status = "review"
      row.detail = "no ticker"
      rows.push(row)
      continue
    }

    // Ground truth comes from Yahoo's split events: the actual effective date
    // and ratio of the split that followed this 8-K.
    const data = await priceData(meta.ticker)
    const windowEnd = isoDate(new Date(new Date(meta.filed).getTime() + 75 * 86400000))
    const event = data?.splits.find(
      s => s.date >= meta.filed && s.date <= windowEnd && s.factor < 1
    )
    if (!event) {
      row.status = "review"
      row.detail = data
        ? "no reverse-split event found near filing (pending or delisted?)"
        : `no price data for ${meta.ticker}`
      rows.push(row)
      continue
    }

    const cost = rawCloseBefore(data, event.date) // 1 old share, day before split
    const exitDate = isoDate(new Date(new Date(event.date).getTime() + 10 * 86400000))
    const exit = rawCloseOnOrAfter(data, exitDate) // 1 new share, ~2wk later
    if (!cost || !exit) {
      row.status = "review"
      row.detail = `1-for-${event.ratio} on ${event.date} — price gaps around split`
      rows.push(row)
      continue
    }

    const profit = Math.round((exit - cost) * 100) / 100
    row.ratio = event.ratio
    row.effective = event.date
    row.status = "priced"
    row.assumed = "1 pre-split share bought day before effective, sold ~2wk after"
    row.profit = Math.max(profit, -Math.round(cost * 100) / 100)
    row.detail = `1-for-${event.ratio} eff ${event.date}: $${cost.toFixed(2)} cost → $${exit.toFixed(2)} exit = $${row.profit}`
    rows.push(row)
  }
  return rows
}

async function main() {
  const tenders = await backtestTenders()
  const splits = await backtestReverseSplits()

  const summarize = rows => {
    const priced = rows.filter(r => r.status === "priced")
    return {
      candidates: rows.length,
      priced: priced.length,
      review: rows.filter(r => r.status === "review").length,
      excluded: rows.filter(r =>
        ["nav-repurchase", "no-spread", "unlisted"].includes(r.status)
      ).length,
      totalProfit: Math.round(priced.reduce((s, r) => s + r.profit, 0) * 100) / 100,
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    periodStart: START,
    assumptions:
      "Max participation per beneficial owner: 99 shares per odd-lot tender bought at the filing-day close; 1 pre-split share per round-up reverse split, sold ~2 weeks after the 8-K. Prices from Stooq daily closes (split-adjusted). Automated best-effort extraction — 'review' rows were not counted.",
    tenders: { summary: summarize(tenders), rows: tenders },
    reverseSplits: { summary: summarize(splits), rows: splits },
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + "\n")
  console.log("tenders:", JSON.stringify(output.tenders.summary))
  console.log("reverse splits:", JSON.stringify(output.reverseSplits.summary))
  console.log(`Wrote ${OUTPUT}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

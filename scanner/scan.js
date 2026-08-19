/**
 * EDGAR special-situations scanner.
 *
 * Queries SEC EDGAR full-text search (efts.sec.gov) for filings that match
 * capacity-constrained special-situation patterns.
 *
 * Two entry points:
 *   - CLI (local dev):  node scanner/scan.js   → writes static/data/scanner.json
 *   - Lambda: see scanner/lambda.js, which calls runScan() and uploads to S3.
 *
 * No dependencies — uses Node 20's built-in fetch.
 * SEC fair-access policy requires a descriptive User-Agent and <10 req/s.
 */

const USER_AGENT = "dougphung.com edgar scanner phung.doug@gmail.com"
const MAX_HITS_PER_DETECTOR = 50

const DETECTORS = [
  {
    id: "odd-lot-tender",
    title: "Odd-lot tender offers",
    description:
      "Tender offers and going-private filings that mention odd lots. Holders of fewer than 100 shares are often accepted in full without proration — read the filing to confirm the odd-lot preference and the offer price.",
    query: `"odd lot"`,
    forms: ["SC TO-I", "SC TO-T", "SC 13E3"],
    lookbackDays: 45,
  },
  {
    id: "reverse-split-roundup",
    title: "Reverse splits that round up",
    description:
      "Filings describing a reverse stock split where fractional shares are rounded up to a whole share. Verify in the filing that round-up happens at the beneficial-holder level and not cash-in-lieu.",
    query: `"reverse stock split" "rounded up to the nearest whole share"`,
    forms: ["8-K", "DEF 14A", "PRE 14A"],
    lookbackDays: 30,
  },
]

const sleep = ms => new Promise(r => setTimeout(r, ms))

const isoDate = d => d.toISOString().slice(0, 10)

async function searchEdgar({ query, forms, lookbackDays }) {
  const end = new Date()
  const start = new Date(end.getTime() - lookbackDays * 24 * 60 * 60 * 1000)
  const params = new URLSearchParams({
    q: query,
    forms: forms.join(","),
    dateRange: "custom",
    startdt: isoDate(start),
    enddt: isoDate(end),
  })
  const url = `https://efts.sec.gov/LATEST/search-index?${params}`
  let lastError
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    })
    if (res.ok) return res.json()
    lastError = new Error(`EDGAR search failed (${res.status}) for ${url}`)
    await sleep(2000 * attempt)
  }
  throw lastError
}

function parseHits(json) {
  const rawHits = json?.hits?.hits || []
  const seen = new Set()
  const hits = []
  for (const hit of rawHits) {
    const source = hit._source || {}
    const [adsh, filename] = String(hit._id || "").split(":")
    if (!adsh || seen.has(adsh)) continue
    seen.add(adsh)

    const cik = (source.ciks || [])[0]
    const displayName = (source.display_names || [])[0] || "Unknown filer"
    const filingUrl =
      cik && filename
        ? `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${adsh.replace(
            /-/g,
            ""
          )}/${filename}`
        : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany`

    hits.push({
      company: displayName,
      form: (source.root_forms || [])[0] || source.file_type || "",
      filed: source.file_date || "",
      adsh,
      url: filingUrl,
    })
  }
  hits.sort((a, b) => (a.filed < b.filed ? 1 : -1))
  return hits.slice(0, MAX_HITS_PER_DETECTOR)
}

async function runScan(log = console) {
  const output = {
    generatedAt: new Date().toISOString(),
    detectors: [],
  }

  for (const detector of DETECTORS) {
    try {
      const json = await searchEdgar(detector)
      const hits = parseHits(json)
      log.log(`detector ${detector.id}: ${hits.length} filings`)
      output.detectors.push({
        id: detector.id,
        title: detector.title,
        description: detector.description,
        lookbackDays: detector.lookbackDays,
        forms: detector.forms,
        hits,
      })
    } catch (err) {
      log.error(`detector ${detector.id} failed: ${err.message}`)
      output.detectors.push({
        id: detector.id,
        title: detector.title,
        description: detector.description,
        lookbackDays: detector.lookbackDays,
        forms: detector.forms,
        error: err.message,
        hits: [],
      })
    }
    await sleep(600) // stay far under SEC's rate limit
  }

  return output
}

module.exports = { runScan }

if (require.main === module) {
  const fs = require("fs")
  const path = require("path")
  const OUTPUT = path.join(__dirname, "..", "static", "data", "scanner.json")
  runScan().then(output => {
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
    fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + "\n")
    console.log(`Wrote ${OUTPUT}`)
  })
}

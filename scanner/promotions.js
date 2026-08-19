/**
 * Bank promotions feed — Doctor of Credit bank-account-bonuses category RSS.
 *
 * Fetches the RSS feed (paging backward to backfill), parses items, extracts
 * bonus dollar amounts from titles, and merges into a cumulative 2026 archive
 * keyed by link. RSS is used (not page scraping) — it's WordPress's built-in
 * syndication feed, updated hourly.
 *
 * Entry points:
 *   - CLI (local dev): node scanner/promotions.js → static/data/promotions.json
 *   - Lambda: scanner/promotions-lambda.js merges against the S3 copy.
 */

const FEED_URL =
  "https://www.doctorofcredit.com/category/bank-account-bonuses/feed/"
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
const ARCHIVE_START = "2026-01-01"
const MAX_BACKFILL_PAGES = parseInt(process.env.PROMO_BACKFILL_PAGES || "12", 10)

const sleep = ms => new Promise(r => setTimeout(r, ms))

const decodeEntities = s =>
  s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&#8211;|&#8212;/g, "-")
    .replace(/&#8217;|&#8216;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&amp;|&#38;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .trim()

function parseFeed(xml) {
  const items = []
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) || []
  for (const block of itemBlocks) {
    const pick = tag => {
      const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))
      return m ? decodeEntities(m[1]) : ""
    }
    const title = pick("title")
    const link = pick("link")
    const pubDate = pick("pubDate")
    if (!title || !link) continue
    const date = pubDate ? new Date(pubDate).toISOString().slice(0, 10) : ""
    // largest dollar figure in the title ≈ headline bonus amount
    const amounts = [...title.matchAll(/\$([0-9][0-9,]*)/g)].map(m =>
      parseInt(m[1].replace(/,/g, ""), 10)
    )
    items.push({
      title,
      link,
      date,
      amount: amounts.length ? Math.max(...amounts) : null,
      isRoundup: /best bank account bonuses/i.test(title),
    })
  }
  return items
}

async function fetchFeedPage(page) {
  const url = page > 1 ? `${FEED_URL}?paged=${page}` : FEED_URL
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } })
  if (!res.ok) return null
  return parseFeed(await res.text())
}

async function fetchPromotions(log = console) {
  const items = []
  for (let page = 1; page <= MAX_BACKFILL_PAGES; page++) {
    const pageItems = await fetchFeedPage(page)
    if (!pageItems || pageItems.length === 0) break
    items.push(...pageItems)
    const oldest = pageItems[pageItems.length - 1].date
    log.log(`feed page ${page}: ${pageItems.length} items (oldest ${oldest})`)
    if (oldest && oldest < ARCHIVE_START) break
    await sleep(500)
  }
  return items.filter(i => i.date >= ARCHIVE_START)
}

/** Merge fresh items into an existing archive; dedupe by link, newest first. */
function mergePromotions(existing, fresh) {
  const byLink = new Map()
  for (const item of [...(existing?.items || []), ...fresh]) {
    const prev = byLink.get(item.link)
    // fresh wins (titles get updated, e.g. "[Expired]" prefixes)
    if (!prev || fresh.includes(item)) byLink.set(item.link, item)
  }
  const items = [...byLink.values()]
    .filter(i => i.date >= ARCHIVE_START)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
  return {
    generatedAt: new Date().toISOString(),
    source: "Doctor of Credit — bank account bonuses RSS",
    archiveStart: ARCHIVE_START,
    items,
  }
}

module.exports = { fetchPromotions, mergePromotions }

if (require.main === module) {
  const fs = require("fs")
  const path = require("path")
  const OUTPUT = path.join(__dirname, "..", "static", "data", "promotions.json")
  fetchPromotions().then(fresh => {
    let existing = null
    try {
      existing = JSON.parse(fs.readFileSync(OUTPUT, "utf8"))
    } catch {}
    const merged = mergePromotions(existing, fresh)
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
    fs.writeFileSync(OUTPUT, JSON.stringify(merged, null, 2) + "\n")
    console.log(`${merged.items.length} promotions → ${OUTPUT}`)
  })
}

import * as React from "react"

import Layout from "../components/layout"
import Seo from "../components/seo"

// Scanner data is produced by an AWS Lambda (see scanner/ in this repo) that
// polls SEC EDGAR full-text search a few times per trading day.
const SCANNER_URL =
  "https://dougphung-finances-data.s3.us-west-1.amazonaws.com/scanner.json"
const SCANNER_FALLBACK_URL = "/data/scanner.json"
const PORTFOLIO_URL = "/data/portfolio.json"
const BACKTEST_URL = "/data/backtest-2026.json"
const PROMOTIONS_URL =
  "https://dougphung-finances-data.s3.us-west-1.amazonaws.com/promotions.json"
const PROMOTIONS_FALLBACK_URL = "/data/promotions.json"

const cellStyle = {
  padding: "6px 12px 6px 0",
  verticalAlign: "top",
}

const fetchJson = async url => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.json()
}

const money = n =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" })

const DetectorSection = ({ detector }) => (
  <section style={{ marginBottom: "2rem" }}>
    <h3 style={{ marginBottom: "0.25rem" }}>{detector.title}</h3>
    <p style={{ fontSize: "0.85rem", color: "#666", marginBottom: "0.5rem" }}>
      {detector.description} Sources: {detector.forms.join(", ")} filings, last{" "}
      {detector.lookbackDays} days.
    </p>
    {detector.error && (
      <p style={{ color: "#a00" }}>Scanner error: {detector.error}</p>
    )}
    {detector.hits.length === 0 && !detector.error ? (
      <p style={{ fontSize: "0.9rem" }}>Nothing in the current window.</p>
    ) : (
      <div style={{ overflowX: "auto" }}>
        <table style={{ fontSize: "0.9rem", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th style={cellStyle}>Filed</th>
              <th style={cellStyle}>Form</th>
              <th style={cellStyle}>Filer</th>
              <th style={cellStyle}></th>
            </tr>
          </thead>
          <tbody>
            {detector.hits.map(hit => (
              <tr key={hit.adsh} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>
                  {hit.filed}
                </td>
                <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>
                  {hit.form}
                </td>
                <td style={cellStyle}>{hit.company}</td>
                <td style={cellStyle}>
                  <a href={hit.url} target="_blank" rel="noreferrer noopener">
                    filing
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>
)

const Portfolio = ({ portfolio }) => {
  const invested = portfolio.positions.reduce(
    (sum, p) => sum + p.shares * p.costPerShare,
    0
  )
  const realized = portfolio.closed.reduce(
    (sum, p) => sum + p.shares * (p.proceedsPerShare - p.costPerShare),
    0
  )
  const total = portfolio.cash + invested

  return (
    <section style={{ marginBottom: "2rem" }}>
      <h3 style={{ marginBottom: "0.25rem" }}>Track record</h3>
      <p style={{ fontSize: "0.85rem", color: "#666", marginBottom: "0.5rem" }}>
        As of {portfolio.asOf}. {portfolio.note}
      </p>
      <p style={{ fontSize: "0.9rem" }}>
        Starting capital {money(portfolio.startingCapital)} · cash{" "}
        {money(portfolio.cash)} · invested (at cost) {money(invested)} ·
        account value {money(total)} · realized P&L{" "}
        <strong>{money(realized)}</strong>
      </p>
      {portfolio.positions.length > 0 && (
        <>
          <h4 style={{ marginBottom: "0.25rem" }}>Open positions</h4>
          <div style={{ overflowX: "auto" }}>
            <table style={{ fontSize: "0.9rem", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}
                >
                  <th style={cellStyle}>Opened</th>
                  <th style={cellStyle}>Ticker</th>
                  <th style={cellStyle}>Shares</th>
                  <th style={cellStyle}>Cost</th>
                  <th style={cellStyle}>Thesis</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.positions.map(p => (
                  <tr
                    key={`${p.ticker}-${p.opened}`}
                    style={{ borderBottom: "1px solid #f0f0f0" }}
                  >
                    <td style={cellStyle}>{p.opened}</td>
                    <td style={cellStyle}>{p.ticker}</td>
                    <td style={cellStyle}>{p.shares}</td>
                    <td style={cellStyle}>{money(p.costPerShare)}</td>
                    <td style={cellStyle}>{p.thesis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {portfolio.closed.length > 0 && (
        <>
          <h4 style={{ marginBottom: "0.25rem" }}>Closed trades</h4>
          <div style={{ overflowX: "auto" }}>
            <table style={{ fontSize: "0.9rem", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}
                >
                  <th style={cellStyle}>Opened</th>
                  <th style={cellStyle}>Closed</th>
                  <th style={cellStyle}>Ticker</th>
                  <th style={cellStyle}>Shares</th>
                  <th style={cellStyle}>Cost</th>
                  <th style={cellStyle}>Proceeds</th>
                  <th style={cellStyle}>P&L</th>
                  <th style={cellStyle}>Note</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.closed.map(p => (
                  <tr
                    key={`${p.ticker}-${p.closed}`}
                    style={{ borderBottom: "1px solid #f0f0f0" }}
                  >
                    <td style={cellStyle}>{p.opened}</td>
                    <td style={cellStyle}>{p.closed}</td>
                    <td style={cellStyle}>{p.ticker}</td>
                    <td style={cellStyle}>{p.shares}</td>
                    <td style={cellStyle}>{money(p.costPerShare)}</td>
                    <td style={cellStyle}>{money(p.proceedsPerShare)}</td>
                    <td style={cellStyle}>
                      {money(p.shares * (p.proceedsPerShare - p.costPerShare))}
                    </td>
                    <td style={cellStyle}>{p.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

const BacktestSection = ({ backtest }) => {
  const groups = [
    { label: "Odd-lot tenders", data: backtest.tenders },
    { label: "Reverse-split round-ups", data: backtest.reverseSplits },
  ]
  const grandTotal = groups.reduce(
    (s, g) => s + g.data.summary.totalProfit,
    0
  )
  return (
    <section style={{ marginBottom: "2rem" }}>
      <h2 style={{ marginBottom: "0.25rem" }}>2026 missed opportunities</h2>
      <p style={{ fontSize: "0.85rem", color: "#666" }}>
        What maximum participation in every automatically-priceable event since
        Jan 1, 2026 would have earned for one beneficial owner:{" "}
        <strong>{money(grandTotal)}</strong>. {backtest.assumptions}
      </p>
      {groups.map(({ label, data }) => (
        <div key={label} style={{ marginBottom: "1.25rem" }}>
          <h3 style={{ marginBottom: "0.25rem" }}>{label}</h3>
          <p style={{ fontSize: "0.85rem", color: "#666" }}>
            {data.summary.candidates} candidates · {data.summary.priced} priced
            (total <strong>{money(data.summary.totalProfit)}</strong>) ·{" "}
            {data.summary.excluded} excluded · {data.summary.review} need a
            human read
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ fontSize: "0.85rem", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}
                >
                  <th style={cellStyle}>Filed</th>
                  <th style={cellStyle}>Ticker</th>
                  <th style={cellStyle}>Est. profit</th>
                  <th style={cellStyle}>Detail</th>
                  <th style={cellStyle}></th>
                </tr>
              </thead>
              <tbody>
                {data.rows
                  .filter(r => r.status === "priced")
                  .sort((a, b) => b.profit - a.profit)
                  .map(r => (
                    <tr
                      key={r.adsh}
                      style={{ borderBottom: "1px solid #f0f0f0" }}
                    >
                      <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>
                        {r.filed}
                      </td>
                      <td style={cellStyle}>{r.ticker}</td>
                      <td style={cellStyle}>{money(r.profit)}</td>
                      <td style={cellStyle}>{r.detail}</td>
                      <td style={cellStyle}>
                        {r.url && (
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            filing
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  )
}

const PromotionsSection = ({ promotions }) => {
  const [showAll, setShowAll] = React.useState(false)
  const roundup = promotions.items.find(i => i.isRoundup)
  const bonuses = promotions.items.filter(i => !i.isRoundup && i.amount)
  const visible = showAll ? bonuses : bonuses.slice(0, 25)
  return (
    <section style={{ marginBottom: "2rem" }}>
      <h2 style={{ marginBottom: "0.25rem" }}>Bank promotions</h2>
      <p style={{ fontSize: "0.85rem", color: "#666" }}>
        Deposit-bonus candidates for idle float, aggregated daily from{" "}
        <a
          href="https://www.doctorofcredit.com/best-bank-account-bonuses/"
          target="_blank"
          rel="noreferrer noopener"
        >
          Doctor of Credit
        </a>
        's syndication feed — {bonuses.length} bonuses archived since{" "}
        {promotions.archiveStart}. Headline amounts only; many are
        state-restricted, business-only, or referral-based. Read the source
        post before acting.
        {roundup && (
          <>
            {" "}
            Current curated list:{" "}
            <a href={roundup.link} target="_blank" rel="noreferrer noopener">
              {roundup.title}
            </a>
            .
          </>
        )}
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ fontSize: "0.85rem", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th style={cellStyle}>Posted</th>
              <th style={cellStyle}>Bonus</th>
              <th style={cellStyle}>Offer</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(item => (
              <tr key={item.link} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>
                  {item.date}
                </td>
                <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>
                  ${item.amount.toLocaleString()}
                </td>
                <td style={cellStyle}>
                  <a href={item.link} target="_blank" rel="noreferrer noopener">
                    {item.title}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!showAll && bonuses.length > 25 && (
        <button
          onClick={() => setShowAll(true)}
          style={{
            marginTop: "0.5rem",
            fontSize: "0.85rem",
            background: "none",
            border: "1px solid #ccc",
            borderRadius: "4px",
            padding: "4px 10px",
            cursor: "pointer",
          }}
        >
          Show all {bonuses.length}
        </button>
      )}
    </section>
  )
}

const FinancesPage = ({ location }) => {
  const [scanner, setScanner] = React.useState(null)
  const [portfolio, setPortfolio] = React.useState(null)
  const [backtest, setBacktest] = React.useState(null)
  const [promotions, setPromotions] = React.useState(null)
  const [error, setError] = React.useState(null)

  React.useEffect(() => {
    fetchJson(SCANNER_URL)
      .catch(() => fetchJson(SCANNER_FALLBACK_URL))
      .then(setScanner)
      .catch(err => setError(String(err)))
    fetchJson(PORTFOLIO_URL)
      .then(setPortfolio)
      .catch(() => {})
    fetchJson(BACKTEST_URL)
      .then(setBacktest)
      .catch(() => {})
    fetchJson(PROMOTIONS_URL)
      .catch(() => fetchJson(PROMOTIONS_FALLBACK_URL))
      .then(setPromotions)
      .catch(() => {})
  }, [])

  return (
    <Layout location={location} title="When Doug Remembers to Write">
      <h1>Finances</h1>
      <p>
        A live scanner for capacity-constrained special situations — the trades
        that are structurally too small for funds to bother with — plus a public
        log of what I actually do with them. The scanner reads SEC EDGAR
        full-text search a few times per trading day and lists raw candidate
        filings; every hit still needs a human to read the filing before it is
        an opportunity.
      </p>
      <p style={{ fontSize: "0.8rem", color: "#666" }}>
        This page is a personal research log, published for transparency. It is
        not investment advice, nothing here is a recommendation, and I may hold
        positions in anything listed.
      </p>

      {portfolio && <Portfolio portfolio={portfolio} />}

      {backtest && <BacktestSection backtest={backtest} />}

      {promotions && <PromotionsSection promotions={promotions} />}

      <h2 style={{ marginBottom: "0.5rem" }}>Scanner</h2>
      {error && <p style={{ color: "#a00" }}>Could not load scanner data: {error}</p>}
      {!scanner && !error && <p>Loading scanner data…</p>}
      {scanner && (
        <>
          <p style={{ fontSize: "0.8rem", color: "#666" }}>
            Last scan: {new Date(scanner.generatedAt).toLocaleString()}
          </p>
          {scanner.detectors.map(d => (
            <DetectorSection key={d.id} detector={d} />
          ))}
        </>
      )}
    </Layout>
  )
}

export default FinancesPage

export const Head = () => (
  <Seo
    title="Finances"
    description="EDGAR special-situations scanner and a public trading log."
  />
)

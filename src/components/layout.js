import * as React from "react"
import { Link } from "gatsby"

const Layout = ({ location, title, children }) => {
  const rootPath = `${__PATH_PREFIX__}/`
  const isRootPath = location.pathname === rootPath
  let header

  if (isRootPath) {
    header = (
      <h1 className="main-heading">
        <Link to="/">{title}</Link>
      </h1>
    )
  } else {
    header = (
      <Link className="header-link-home" to="/">
        {title}
      </Link>
    )
  }

  return (
    <div className="global-wrapper" data-is-root-path={isRootPath}>
      <header className="global-header">
        {header}
        <nav style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
          <Link to="/">writing</Link>
          {" · "}
          {/* plain anchor — /finances/ is a standalone app outside Gatsby routing */}
          <a href="/finances/">finances</a>
        </nav>
      </header>
      <main>{children}</main>
      <footer>
        © {new Date().getFullYear()}, Built with lots of love, ambition, and regret. 
      </footer>
    </div>
  )
}

export default Layout

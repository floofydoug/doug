const { hot } = require("react-hot-loader/root")

// prefer default export if available
const preferDefault = m => (m && m.default) || m


exports.components = {
  "component---cache-dev-404-page-js": hot(preferDefault(require("/Users/dougphung/Projects/dougphung.com/.cache/dev-404-page.js"))),
  "component---src-pages-404-js": hot(preferDefault(require("/Users/dougphung/Projects/dougphung.com/src/pages/404.js"))),
  "component---src-pages-using-typescript-tsx": hot(preferDefault(require("/Users/dougphung/Projects/dougphung.com/src/pages/using-typescript.tsx"))),
  "component---src-templates-blog-post-js": hot(preferDefault(require("/Users/dougphung/Projects/dougphung.com/src/templates/blog-post.js")))
}


"use strict";(self.webpackChunkdoug_blog=self.webpackChunkdoug_blog||[]).push([[678],{6558:function(e,t,l){l.r(t),l.d(t,{Head:function(){return s}});var n=l(7294),r=l(1883),o=l(8771),a=l(8678),i=l(9357);t.default=e=>{var t;let{data:l,location:i}=e;const s=(null===(t=l.site.siteMetadata)||void 0===t?void 0:t.title)||"Title",c=l.allMarkdownRemark.nodes;return 0===c.length?n.createElement(a.Z,{location:i,title:s},n.createElement(o.Z,null),n.createElement("p",null,'No blog posts found. Add markdown posts to "content/blog" (or the directory you specified for the "gatsby-source-filesystem" plugin in gatsby-config.js).')):n.createElement(a.Z,{location:i,title:s},n.createElement(o.Z,null),n.createElement("ol",{style:{listStyle:"none"}},c.map((e=>{const t=e.frontmatter.title||e.fields.slug;return n.createElement("li",{key:e.fields.slug},n.createElement("article",{className:"post-list-item",itemScope:!0,itemType:"http://schema.org/Article"},n.createElement("header",null,n.createElement("h2",null,n.createElement(r.Link,{to:e.fields.slug,itemProp:"url"},n.createElement("span",{itemProp:"headline"},t))),n.createElement("small",null,e.frontmatter.date)),n.createElement("section",null,n.createElement("p",{dangerouslySetInnerHTML:{__html:e.frontmatter.description||e.excerpt},itemProp:"description"}))))}))))};const s=()=>n.createElement(i.Z,{title:"All posts"})}}]);
//# sourceMappingURL=component---src-pages-index-js-1d1be672f08475009f42.js.map
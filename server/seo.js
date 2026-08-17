const fs = require("fs");
const path = require("path");
const { buildProductPageBody } = require("./product-page-body");
const {
  SITE,
  stripHtml,
  absoluteUrl,
  productPath,
  buildProductGraph
} = require("./product-rich");

const CANONICAL_HOST = String(process.env.CANONICAL_HOST || "northmp.su")
  .trim()
  .toLowerCase();

function requestHostname(req) {
  const raw = String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return raw.replace(/:\d+$/, "");
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jsonLdScript(data) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<script type="application/ld+json" data-seo-jsonld="1">${json}</script>`;
}

function jsonLdScripts(blocks) {
  return (Array.isArray(blocks) ? blocks : [blocks]).filter(Boolean).map(jsonLdScript).join("\n  ");
}

/**
 * Collapse www and keep a single host in the index.
 * Localhost / IP / tunnels are left untouched.
 */
function canonicalHostMiddleware(req, res, next) {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const hostname = requestHostname(req);
  if (!hostname || hostname === CANONICAL_HOST) return next();
  if (hostname === `www.${CANONICAL_HOST}`) {
    let loc = req.originalUrl || req.url || "/";
    if (req.path === "/index.html") {
      const qs = loc.includes("?") ? loc.slice(loc.indexOf("?")) : "";
      loc = `/${qs}`;
    }
    return res.redirect(301, `https://${CANONICAL_HOST}${loc}`);
  }
  return next();
}

function indexHtmlRedirect(req, res, next) {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (req.path !== "/index.html") return next();
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  return res.redirect(301, `/${qs}`);
}

function productBodyHtml(product, rich) {
  return buildProductPageBody(product, rich);
}

function injectProductSeo(html, product, reviews = []) {
  const pub = product;
  const rich = buildProductGraph(pub, reviews);
  const title =
    pub.seoTitle || `${rich.name} | Northern Magical Place`;
  const desc = rich.description || stripHtml(pub.short) || "";
  const canonical = rich.canonical;
  const image = rich.images[0];

  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  html = html.replace(
    /<meta name="description" content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${esc(desc)}" />`
  );
  if (/<meta name="keywords"/.test(html)) {
    html = html.replace(
      /<meta name="keywords" content="[^"]*"\s*\/?>/,
      `<meta name="keywords" content="${esc((pub.keywords || []).join(", "))}" />`
    );
  } else if ((pub.keywords || []).length) {
    html = html.replace(
      /<meta name="description" content="[^"]*"\s*\/?>/,
      (m) =>
        `${m}\n  <meta name="keywords" content="${esc((pub.keywords || []).join(", "))}" />`
    );
  }
  html = html.replace(
    /<link rel="canonical" href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${esc(canonical)}" />`
  );

  const metaExtra = [
    `<meta property="og:type" content="product" />`,
    `<meta property="og:site_name" content="Northern Magical Place" />`,
    `<meta property="og:locale" content="ru_RU" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:alt" content="${esc(pub.imageAlt || rich.name)}" />`,
    `<meta property="product:brand" content="Northern Magical Place" />`,
    `<meta property="product:availability" content="${
      rich.available ? "in stock" : "preorder"
    }" />`,
    `<meta property="product:condition" content="new" />`,
    `<meta property="product:retailer_item_id" content="${esc(pub.sku || pub.id || "")}" />`,
    rich.price > 0
      ? `<meta property="product:price:amount" content="${rich.price.toFixed(2)}" />`
      : "",
    rich.price > 0 ? `<meta property="product:price:currency" content="RUB" />` : "",
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`
  ]
    .filter(Boolean)
    .join("\n  ");

  // Replace/augment existing OG block cleanly before </head>
  html = html.replace(
    /\s*<meta property="og:type"[^>]*>[\s\S]*?(?=<link rel="icon"|<link rel="preconnect"|<link rel="stylesheet"|<\/head>)/,
    `\n  ${metaExtra}\n  `
  );

  // Remove any previous JSON-LD then inject one graph
  html = html.replace(
    /<script type="application\/ld\+json"[\s\S]*?<\/script>\s*/g,
    ""
  );
  html = html.replace(
    "</head>",
    `  ${jsonLdScripts(rich.jsonLdBlocks || [rich.jsonLd])}\n</head>`
  );

  html = html.replace(
    /<!--NMP_PRODUCT_BODY_START-->[\s\S]*?<!--NMP_PRODUCT_BODY_END-->/,
    `<!--NMP_PRODUCT_BODY_START-->${productBodyHtml(pub, rich)}<!--NMP_PRODUCT_BODY_END-->`
  );
  return html;
}

function productPageMiddleware(root, cms) {
  let cache = { mtimeMs: 0, html: "" };

  const readTemplate = () => {
    const file = path.join(root, "product.html");
    const stat = fs.statSync(file);
    if (cache.html && cache.mtimeMs === stat.mtimeMs) return cache.html;
    cache = { mtimeMs: stat.mtimeMs, html: fs.readFileSync(file, "utf8") };
    return cache.html;
  };

  const renderProduct = (req, res, key, { redirectIfMismatch = true } = {}) => {
    const raw = cms.getProduct(key);
    const product = raw ? cms.publicProduct(raw) : null;
    if (!product) {
      res.status(404);
      const html = readTemplate()
        .replace(/<title>[^<]*<\/title>/, "<title>Товар не найден — Северное магическое место</title>")
        .replace(
          /<!--NMP_PRODUCT_BODY_START-->[\s\S]*?<!--NMP_PRODUCT_BODY_END-->/,
          `<!--NMP_PRODUCT_BODY_START--><h1>Товар не найден</h1><p class="lead">Такой модели нет в каталоге. <a href="/kostrovye-chashi.html">Вернуться к костровым чашам</a>.</p><!--NMP_PRODUCT_BODY_END-->`
        );
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      return res.send(html);
    }

    if (redirectIfMismatch && key !== product.slug) {
      return res.redirect(301, productPath(product.slug));
    }

    const reviews =
      typeof cms.listCollection === "function"
        ? cms.listCollection("reviews", { publishedOnly: true })
        : [];
    const html = injectProductSeo(readTemplate(), product, reviews);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    return res.send(html);
  };

  return (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();

    const pretty = req.path.match(/^\/product\/([^/]+)\/?$/);
    if (pretty) {
      const slug = decodeURIComponent(pretty[1]).trim();
      if (!slug) return res.redirect(301, "/kostrovye-chashi.html");
      return renderProduct(req, res, slug);
    }

    if (req.path !== "/product.html") return next();

    const slug = typeof req.query.slug === "string" ? req.query.slug.trim() : "";
    const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
    const key = slug || id;

    if (!key) {
      return res.redirect(301, "/kostrovye-chashi.html");
    }

    const raw = cms.getProduct(key);
    const product = raw ? cms.publicProduct(raw) : null;
    if (product) {
      return res.redirect(301, productPath(product.slug));
    }

    return renderProduct(req, res, key, { redirectIfMismatch: false });
  };
}

module.exports = {
  SITE,
  CANONICAL_HOST,
  canonicalHostMiddleware,
  indexHtmlRedirect,
  productPageMiddleware,
  absoluteUrl,
  stripHtml
};

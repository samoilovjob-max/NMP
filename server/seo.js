const fs = require("fs");
const path = require("path");

const CANONICAL_HOST = String(process.env.CANONICAL_HOST || "northmp.su")
  .trim()
  .toLowerCase();
const SITE = `https://${CANONICAL_HOST}`;

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

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function jsonLdScript(data) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
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

function productBodyHtml(product) {
  const h1 = product.h1 || product.name;
  const short = product.short || "";
  const description = product.description || "";
  const specs = Array.isArray(product.specs) ? product.specs : [];
  const useCases = Array.isArray(product.useCases) ? product.useCases : [];
  const faq = Array.isArray(product.faq) ? product.faq : [];
  const image = product.image || "";
  const alt = product.imageAlt || product.name;

  return `
    <article class="product-info">
      ${image ? `<p><img src="${esc(image)}" alt="${esc(alt)}" width="800" height="600" /></p>` : ""}
      <h1>${esc(h1)}</h1>
      ${short ? `<p class="lead">${short}</p>` : ""}
      ${description ? `<div class="rich-text lead">${description}</div>` : ""}
      ${
        specs.length
          ? `<section class="seo-block"><h2>Характеристики</h2><ul class="spec-list">${specs
              .map((item) => `<li>${esc(item)}</li>`)
              .join("")}</ul></section>`
          : ""
      }
      ${
        useCases.length
          ? `<section class="seo-block"><h2>Где применять</h2><ul class="spec-list">${useCases
              .map((item) => `<li>${esc(item)}</li>`)
              .join("")}</ul></section>`
          : ""
      }
      ${
        faq.length
          ? `<section class="seo-block"><h2>Частые вопросы</h2>${faq
              .map(
                (item) =>
                  `<h3>${esc(item.q)}</h3><p>${esc(item.a)}</p>`
              )
              .join("")}</section>`
          : ""
      }
      <p>Костровая чаша Northern Magical Place из конструкционной стали, производство в Карелии. Доставка СДЭК по России, самовывоз и адресная доставка по Петрозаводску. Оплата через ЮKassa.</p>
    </article>`;
}

function injectProductSeo(html, product) {
  const pub = product;
  const title = pub.seoTitle || `${pub.name} — костровая чаша | Northern Magical Place`;
  const desc =
    pub.seoDescription ||
    stripHtml(pub.short) ||
    stripHtml(pub.description).slice(0, 160);
  const canonical = `${SITE}/product.html?slug=${encodeURIComponent(pub.slug)}`;
  const image = pub.image
    ? pub.image.startsWith("http")
      ? pub.image
      : `${SITE}/${String(pub.image).replace(/^\//, "")}`
    : `${SITE}/images/main-product.webp`;

  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  html = html.replace(
    /<meta name="description" content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${esc(desc)}" />`
  );
  html = html.replace(
    /<link rel="canonical" href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${esc(canonical)}" />`
  );

  const ogBlock = [
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`
  ].join("\n  ");
  if (/<meta property="og:title"/.test(html)) {
    html = html.replace(/<meta property="og:title" content="[^"]*"\s*\/?>/, ogBlock.split("\n  ")[0]);
    html = html.replace(
      /<meta property="og:description" content="[^"]*"\s*\/?>/,
      `<meta property="og:description" content="${esc(desc)}" />`
    );
    html = html.replace(
      /<meta property="og:url" content="[^"]*"\s*\/?>/,
      `<meta property="og:url" content="${esc(canonical)}" />`
    );
    html = html.replace(
      /<meta property="og:image" content="[^"]*"\s*\/?>/,
      `<meta property="og:image" content="${esc(image)}" />`
    );
  } else {
    html = html.replace(
      /<meta property="og:locale" content="ru_RU"\s*\/?>/,
      `<meta property="og:locale" content="ru_RU" />\n  ${ogBlock}`
    );
  }

  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: pub.h1 || pub.name,
    sku: pub.sku,
    image: [image],
    description: desc,
    brand: { "@type": "Brand", name: "Northern Magical Place" },
    category: "Костровые чаши",
    offers: {
      "@type": "Offer",
      url: canonical,
      priceCurrency: "RUB",
      price: String(pub.price || 0),
      availability:
        pub.availableForOrder !== false
          ? "https://schema.org/InStock"
          : "https://schema.org/PreOrder"
    }
  };
  html = html.replace("</head>", `  ${jsonLdScript(schema)}\n</head>`);

  html = html.replace(
    /<!--NMP_PRODUCT_BODY_START-->[\s\S]*?<!--NMP_PRODUCT_BODY_END-->/,
    `<!--NMP_PRODUCT_BODY_START-->${productBodyHtml(pub)}<!--NMP_PRODUCT_BODY_END-->`
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

  return (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path !== "/product.html") return next();

    const slug = typeof req.query.slug === "string" ? req.query.slug.trim() : "";
    const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
    const key = slug || id;

    if (!key) {
      return res.redirect(301, "/#catalog");
    }

    const raw = cms.getProduct(key);
    const product = raw ? cms.publicProduct(raw) : null;
    if (!product) {
      res.status(404);
      const html = readTemplate()
        .replace(/<title>[^<]*<\/title>/, "<title>Товар не найден — Northern Magical Place</title>")
        .replace(
          /<!--NMP_PRODUCT_BODY_START-->[\s\S]*?<!--NMP_PRODUCT_BODY_END-->/,
          `<!--NMP_PRODUCT_BODY_START--><h1>Товар не найден</h1><p class="lead">Такой модели нет в каталоге. <a href="/#catalog">Вернуться к костровым чашам</a>.</p><!--NMP_PRODUCT_BODY_END-->`
        );
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      return res.send(html);
    }

    if (!slug || slug !== product.slug) {
      return res.redirect(301, `/product.html?slug=${encodeURIComponent(product.slug)}`);
    }

    const html = injectProductSeo(readTemplate(), product);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    return res.send(html);
  };
}

module.exports = {
  SITE,
  CANONICAL_HOST,
  canonicalHostMiddleware,
  indexHtmlRedirect,
  productPageMiddleware
};

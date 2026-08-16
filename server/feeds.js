const { SITE, absoluteUrl, stripHtml, productDisplayName, productDescription, productCanonical } = require("./product-rich");

function xmlEsc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ymlDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 16).replace("T", " ");
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildYmlFeed(cmsApi) {
  const products = (cmsApi.listProducts({ activeOnly: true }) || []).map((p) =>
    cmsApi.publicProduct(p)
  );
  const updatedAt = cmsApi.readCms?.().updatedAt || new Date().toISOString();

  const offers = products
    .map((product) => {
      const available = product.availableForOrder !== false;
      const price = Number(product.price || product.effectivePrice || 0);
      if (!(price > 0)) return "";
      const url = productCanonical(product);
      const pictures = [product.image, ...(product.gallery || [])]
        .filter(Boolean)
        .slice(0, 8)
        .map((src) => `        <picture>${xmlEsc(absoluteUrl(src))}</picture>`)
        .join("\n");
      const name = productDisplayName(product);
      const description = productDescription(product);
      const params = [];
      if (Array.isArray(product.specs)) {
        product.specs.slice(0, 8).forEach((spec, idx) => {
          params.push(
            `        <param name="Характеристика ${idx + 1}">${xmlEsc(spec)}</param>`
          );
        });
      }
      return `      <offer id="${xmlEsc(product.id)}" available="${available ? "true" : "false"}">
        <url>${xmlEsc(url)}</url>
        <price>${price.toFixed(2)}</price>
        <currencyId>RUB</currencyId>
        <categoryId>${available ? "1" : "2"}</categoryId>
${pictures}
        <name>${xmlEsc(name)}</name>
        <vendor>Northern Magical Place</vendor>
        <vendorCode>${xmlEsc(product.sku || product.id)}</vendorCode>
        <model>${xmlEsc(product.name)}</model>
        <description>${xmlEsc(description)}</description>
        <manufacturer_warranty>true</manufacturer_warranty>
        <country_of_origin>Россия</country_of_origin>
${params.join("\n")}
      </offer>`;
    })
    .filter(Boolean)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<yml_catalog date="${xmlEsc(ymlDate(updatedAt))}">
  <shop>
    <name>Northern Magical Place</name>
    <company>Северное магическое место — Самойлов Сергей Сергеевич (НПД)</company>
    <url>${SITE}/</url>
    <email>info@northmp.su</email>
    <currencies>
      <currency id="RUB" rate="1"/>
    </currencies>
    <categories>
      <category id="1">Костровые чаши</category>
      <category id="2">Костровые системы</category>
      <category id="3" parentId="1">Походные костровые чаши</category>
    </categories>
    <delivery>true</delivery>
    <offers>
${offers}
    </offers>
  </shop>
</yml_catalog>
`;
}

function buildSitemapXml(cmsApi) {
  const products = (cmsApi.listProducts({ activeOnly: true }) || []).map((p) =>
    cmsApi.publicProduct(p)
  );
  const updatedAt = cmsApi.readCms?.().updatedAt || new Date().toISOString();
  const lastmod = String(updatedAt).slice(0, 10);
  const staticPages = [
    { loc: `${SITE}/`, priority: "1.0", changefreq: "daily" },
    { loc: `${SITE}/kostrovye-chashi.html`, priority: "0.95", changefreq: "weekly" },
    { loc: `${SITE}/pokhodnaya-kostrovaya-chasha.html`, priority: "0.9", changefreq: "weekly" },
    { loc: `${SITE}/razbornaya-kostrovaya-chasha.html`, priority: "0.9", changefreq: "weekly" },
    { loc: `${SITE}/kostrovaya-chasha-dlya-kempinga.html`, priority: "0.9", changefreq: "weekly" },
    { loc: `${SITE}/buyers.html`, priority: "0.6", changefreq: "monthly" },
    { loc: `${SITE}/usage.html`, priority: "0.5", changefreq: "monthly" },
    { loc: `${SITE}/privacy.html`, priority: "0.3", changefreq: "yearly" }
  ];

  const urls = [
    ...staticPages.map(
      (page) => `  <url>
    <loc>${xmlEsc(page.loc)}</loc>
    <lastmod>${xmlEsc(lastmod)}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
    ),
    ...products.map((product) => {
      const loc = productCanonical(product);
      const image = absoluteUrl(product.image);
      return `  <url>
    <loc>${xmlEsc(loc)}</loc>
    <lastmod>${xmlEsc(lastmod)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${product.availableForOrder !== false ? "0.95" : "0.7"}</priority>
    <image:image>
      <image:loc>${xmlEsc(image)}</image:loc>
      <image:title>${xmlEsc(productDisplayName(product))}</image:title>
    </image:image>
  </url>`;
    })
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join("\n")}
</urlset>
`;
}

module.exports = {
  buildYmlFeed,
  buildSitemapXml,
  xmlEsc
};

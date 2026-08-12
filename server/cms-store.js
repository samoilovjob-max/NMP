const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { sanitizeRichHtml } = require("./rich-html");

const DATA_DIR = path.join(__dirname, "data");
const CMS_PATH = path.join(DATA_DIR, "cms.json");
const SEED_PATH = path.join(__dirname, "cms-seed.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readSeed() {
  return JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));
}

function readCms() {
  ensureDir();
  if (!fs.existsSync(CMS_PATH)) {
    const seed = readSeed();
    fs.writeFileSync(CMS_PATH, JSON.stringify(seed, null, 2));
    return seed;
  }
  return JSON.parse(fs.readFileSync(CMS_PATH, "utf8"));
}

function writeCms(data) {
  ensureDir();
  data.updatedAt = new Date().toISOString();
  const tmp = CMS_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, CMS_PATH);
  return data;
}

function uid(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString("hex")}`;
}

function sortByOrder(list, key = "sortOrder") {
  return [...list].sort((a, b) => Number(a[key] || 0) - Number(b[key] || 0));
}

function listProducts({ activeOnly = false } = {}) {
  const cms = readCms();
  let list = sortByOrder(cms.products || []);
  if (activeOnly) list = list.filter((p) => p.active !== false);
  return list;
}

function getProduct(id) {
  const key = String(id || "");
  return listProducts().find((p) => p.id === key || p.slug === key) || null;
}

function effectivePrice(product) {
  if (!product) return 0;
  if (product.promoActive && product.promoPrice != null && Number(product.promoPrice) > 0) {
    return Number(product.promoPrice);
  }
  return Number(product.price || 0);
}

function publicProduct(product) {
  if (!product) return null;
  const price = Number(product.price || 0);
  const payPrice = effectivePrice(product);
  const availableForOrder = product.availableForOrder !== false;
  return {
    ...product,
    price: payPrice,
    basePrice: price,
    effectivePrice: payPrice,
    hasPromo: Boolean(product.promoActive && payPrice < price),
    availableForOrder,
    availabilityNote:
      String(product.availabilityNote || "").trim() ||
      (availableForOrder
        ? ""
        : "Модель ещё готовится к продаже. Оставьте контакты — сообщим, когда можно будет заказать.")
  };
}

function saveProduct(input, { isNew = false } = {}) {
  const cms = readCms();
  const products = cms.products || [];
  const id = String(input.id || (isNew ? String(Date.now()).slice(-6) : "")).trim();
  if (!id) throw new Error("Нужен id товара");

  const existingIdx = products.findIndex((p) => p.id === id);
  if (isNew && existingIdx >= 0) throw new Error("Товар с таким id уже есть");
  if (!isNew && existingIdx < 0) throw new Error("Товар не найден");

  const base = existingIdx >= 0 ? products[existingIdx] : {};
  const next = {
    ...base,
    ...input,
    id,
    sku: String(input.sku || base.sku || `NMP-${id}`).trim(),
    slug: String(input.slug || base.slug || `product-${id}`)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-"),
    name: String(input.name || base.name || "Новый товар").trim(),
    h1: String(input.h1 || input.name || base.h1 || "").trim(),
    price: Math.max(0, Number(input.price ?? base.price ?? 0)),
    promoPrice:
      input.promoPrice === "" || input.promoPrice == null
        ? null
        : Math.max(0, Number(input.promoPrice)),
    promoActive: Boolean(input.promoActive),
    promoLabel: String(input.promoLabel || ""),
    active: input.active !== false,
    availableForOrder: input.availableForOrder !== false,
    availabilityNote: String(
      input.availabilityNote != null ? input.availabilityNote : base.availabilityNote || ""
    ).trim(),
    sortOrder: Number(input.sortOrder ?? base.sortOrder ?? products.length + 1),
    image: String(input.image || base.image || "images/product-1.webp"),
    imageAlt: String(input.imageAlt || input.name || ""),
    gallery: Array.isArray(input.gallery)
      ? input.gallery.filter(Boolean)
      : base.gallery || [input.image || base.image].filter(Boolean),
    galleryAlts: Array.isArray(input.galleryAlts) ? input.galleryAlts : base.galleryAlts || [],
    short: sanitizeRichHtml(input.short || ""),
    description: sanitizeRichHtml(input.description || ""),
    badge: String(input.badge || ""),
    specs: Array.isArray(input.specs) ? input.specs.map(String).filter(Boolean) : base.specs || [],
    useCases: Array.isArray(input.useCases)
      ? input.useCases.map(String).filter(Boolean)
      : base.useCases || [],
    keywords: Array.isArray(input.keywords)
      ? input.keywords.map(String).filter(Boolean)
      : base.keywords || [],
    faq: Array.isArray(input.faq) ? input.faq : base.faq || [],
    seoTitle: String(input.seoTitle || input.h1 || input.name || ""),
    seoDescription: String(input.seoDescription || input.short || ""),
    packageWeight: Math.max(0, Number(input.packageWeight ?? base.packageWeight ?? 0)) || null,
    packageLength: Math.max(0, Number(input.packageLength ?? base.packageLength ?? 0)) || null,
    packageWidth: Math.max(0, Number(input.packageWidth ?? base.packageWidth ?? 0)) || null,
    packageHeight: Math.max(0, Number(input.packageHeight ?? base.packageHeight ?? 0)) || null
  };

  if (existingIdx >= 0) products[existingIdx] = next;
  else products.push(next);
  cms.products = products;
  writeCms(cms);
  return next;
}

function deleteProduct(id) {
  const cms = readCms();
  const before = (cms.products || []).length;
  cms.products = (cms.products || []).filter((p) => p.id !== String(id));
  if (cms.products.length === before) throw new Error("Товар не найден");
  writeCms(cms);
  return true;
}

function listCollection(key, { publishedOnly = false } = {}) {
  const cms = readCms();
  let list = cms[key] || [];
  if (key === "reviews" || key === "news") list = sortByOrder(list, key === "news" ? "publishedAt" : "sortOrder");
  if (key === "news" && publishedOnly) {
    list = [...list]
      .filter((n) => n.published !== false)
      .sort((a, b) => String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")));
  }
  if (key === "reviews" && publishedOnly) list = list.filter((r) => r.published !== false);
  if (key === "promotions" && publishedOnly) {
    const now = Date.now();
    list = (cms.promotions || []).filter((p) => {
      if (p.active === false) return false;
      if (p.startsAt && new Date(p.startsAt).getTime() > now) return false;
      if (p.endsAt && new Date(p.endsAt).getTime() < now) return false;
      return true;
    });
  }
  return list;
}

function saveInCollection(key, input, { isNew = false } = {}) {
  const cms = readCms();
  const list = cms[key] || [];
  const id = String(input.id || (isNew ? uid(key.slice(0, 3)) : "")).trim();
  if (!id) throw new Error("Нужен id");
  const idx = list.findIndex((item) => item.id === id);
  if (isNew && idx >= 0) throw new Error("Запись уже существует");
  if (!isNew && idx < 0) throw new Error("Запись не найдена");
  const base = idx >= 0 ? list[idx] : {};
  const next = { ...base, ...input, id };
  if (key === "news") {
    if (next.excerpt != null) next.excerpt = sanitizeRichHtml(next.excerpt);
    if (next.body != null) next.body = sanitizeRichHtml(next.body);
  }
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  cms[key] = list;
  writeCms(cms);
  return next;
}

function deleteInCollection(key, id) {
  const cms = readCms();
  const before = (cms[key] || []).length;
  cms[key] = (cms[key] || []).filter((item) => item.id !== String(id));
  if ((cms[key] || []).length === before) throw new Error("Запись не найдена");
  writeCms(cms);
  return true;
}

function getSite() {
  return readCms().site || {};
}

function saveSite(patch) {
  const cms = readCms();
  cms.site = { ...(cms.site || {}), ...(patch || {}) };
  if (patch?.contacts) {
    cms.site.contacts = { ...(cms.site.contacts || {}), ...patch.contacts };
  }
  writeCms(cms);
  return cms.site;
}

function resolveReviewProduct(review, products = listProducts()) {
  const pid = String(review?.productId || "").trim();
  if (pid) return products.find((p) => String(p.id) === pid) || null;
  const hay = String(review?.meta || "").toLowerCase();
  if (!hay) return null;
  return (
    products.find((p) => {
      const name = String(p.name || "").trim().toLowerCase();
      return name && hay.includes(name);
    }) || null
  );
}

function publicReviews() {
  const products = listProducts();
  return listCollection("reviews", { publishedOnly: true })
    .filter((review) => {
      const product = resolveReviewProduct(review, products);
      if (!product) return true;
      return product.active !== false && product.availableForOrder !== false;
    })
    .map((review) => ({
      ...review,
      image: "",
      video: review.video || ""
    }));
}

function getPublicCms() {
  const cms = readCms();
  return {
    updatedAt: cms.updatedAt,
    products: listProducts({ activeOnly: true }).map(publicProduct),
    news: listCollection("news", { publishedOnly: true }),
    reviews: publicReviews(),
    promotions: listCollection("promotions", { publishedOnly: true }),
    site: cms.site || {}
  };
}

function getAdminCms() {
  const cms = readCms();
  return {
    updatedAt: cms.updatedAt,
    products: listProducts(),
    news: listCollection("news"),
    reviews: listCollection("reviews"),
    promotions: listCollection("promotions"),
    site: cms.site || {}
  };
}

function resolveOrderItems(rawItems = []) {
  const items = [];
  for (const line of rawItems) {
    const product = getProduct(line.productId || line.id);
    if (!product || product.active === false) {
      throw new Error(`Неизвестный товар: ${line.productId || line.id}`);
    }
    if (product.availableForOrder === false) {
      throw new Error(`«${product.name}» пока недоступен к заказу`);
    }
    const qty = Math.max(1, Number(line.qty || line.amount || 1));
    const price = effectivePrice(product);
    items.push({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      price,
      qty,
      image: product.image,
      sum: price * qty
    });
  }
  if (!items.length) throw new Error("Корзина пуста");
  return items;
}

module.exports = {
  readCms,
  writeCms,
  listProducts,
  getProduct,
  publicProduct,
  effectivePrice,
  saveProduct,
  deleteProduct,
  listCollection,
  saveInCollection,
  deleteInCollection,
  getSite,
  saveSite,
  getPublicCms,
  getAdminCms,
  resolveReviewProduct,
  publicReviews,
  resolveOrderItems,
  CMS_PATH
};

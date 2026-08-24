const fs = require("fs");
const path = require("path");
const cms = require("./cms-store");
const { optimizeUploadedImage } = require("./image-optimize");

const ROOT = path.join(__dirname, "..");
const UPLOAD_PREFIX = "images/uploads/";

const SLOTS = [
  {
    id: "hero",
    title: "Главный баннер",
    hint: "Первый экран главной. Шапка и подвал автоматически подстроятся под это фото.",
    group: "Главная",
    defaultUrl: "images/hero-bg-800.webp",
    maxEdge: 1920,
    variants: [640, 800, 1080, 1600]
  },
  {
    id: "about",
    title: "О нас",
    hint: "Большое фото в блоке «О нас» на главной.",
    group: "Главная",
    defaultUrl: "images/country-house.webp",
    maxEdge: 1600
  },
  {
    id: "lifeRiver",
    title: "Стиль жизни — река",
    hint: "Карточка «вечер у реки».",
    group: "Главная",
    defaultUrl: "images/mountain-river.webp",
    maxEdge: 1600
  },
  {
    id: "lifeHouse",
    title: "Стиль жизни — дом",
    hint: "Карточка у загородного дома.",
    group: "Главная",
    defaultUrl: "images/country-house.webp",
    maxEdge: 1600
  },
  {
    id: "lifeLake",
    title: "Стиль жизни — озеро",
    hint: "Карточка ужина на берегу.",
    group: "Главная",
    defaultUrl: "images/shore-lake.webp",
    maxEdge: 1600
  },
  {
    id: "lifeCamp",
    title: "Стиль жизни — кемпинг",
    hint: "Карточка кемпинга.",
    group: "Главная",
    defaultUrl: "images/camping.webp",
    maxEdge: 1600
  },
  {
    id: "catalogBg",
    title: "Фон каталога",
    hint: "Фон блока преимуществ над каталогом изделий.",
    group: "Главная",
    defaultUrl: "images/mountain-river.webp",
    maxEdge: 1920
  },
  {
    id: "contactBg",
    title: "Контакты",
    hint: "Фон блока обратной связи на главной.",
    group: "Главная",
    defaultUrl: "images/country-house.webp",
    maxEdge: 1920
  },
  {
    id: "pageHero",
    title: "Фон внутренних страниц",
    hint: "Доставка, эксплуатация, политика, гайды — верхний блок страницы.",
    group: "Другие страницы",
    defaultUrl: "images/country-house.webp",
    maxEdge: 1920
  },
  {
    id: "logo",
    title: "Логотип",
    hint: "Значок в шапке и подвале.",
    group: "Шапка и подвал",
    defaultUrl: "images/logo-mark.webp",
    maxEdge: 400
  }
];

function slotById(id) {
  return SLOTS.find((s) => s.id === String(id || "").trim()) || null;
}

function mediaFromSite(site = {}) {
  return site.media && typeof site.media === "object" ? site.media : {};
}

function resolveSlot(slot, site = {}) {
  const saved = mediaFromSite(site)[slot.id];
  const url = saved?.url || slot.defaultUrl;
  return {
    ...slot,
    url,
    srcset: saved?.srcset || "",
    width: saved?.width || 0,
    height: saved?.height || 0,
    format: saved?.format || path.extname(url).replace(".", "") || "webp",
    custom: Boolean(saved?.url)
  };
}

function listSlots(site) {
  return SLOTS.map((slot) => resolveSlot(slot, site));
}

function isManagedUpload(relUrl) {
  const rel = String(relUrl || "").split("?")[0].replace(/^\//, "");
  if (!rel.startsWith(UPLOAD_PREFIX)) return false;
  const abs = path.normalize(path.join(ROOT, rel));
  const uploadRoot = path.normalize(path.join(ROOT, "images", "uploads")) + path.sep;
  return abs.startsWith(uploadRoot);
}

function unlinkUpload(relUrl) {
  const rel = String(relUrl || "").split("?")[0].replace(/^\//, "");
  if (!isManagedUpload(rel)) return;
  const abs = path.join(ROOT, rel);
  try {
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {
    /* ignore */
  }
}

function unlinkMediaEntry(entry) {
  if (!entry) return;
  unlinkUpload(entry.url);
  const srcset = String(entry.srcset || "");
  srcset.split(",").forEach((part) => {
    const url = part.trim().split(/\s+/)[0];
    if (url) unlinkUpload(url);
  });
}

function srcsetString(mainUrl, variants = [], mainWidth = 0) {
  const parts = (variants || []).map((v) => `${v.url} ${v.width}w`);
  if (mainUrl && mainWidth && !parts.some((p) => p.startsWith(mainUrl + " "))) {
    parts.push(`${mainUrl} ${mainWidth}w`);
  }
  return parts.join(", ");
}

async function replaceSlot(slotId, file) {
  const slot = slotById(slotId);
  if (!slot) throw new Error("Неизвестный блок картинки");
  if (!file || !file.path) throw new Error("Файл не получен");
  const mime = String(file.mimetype || "");
  if (!/^image\//.test(mime) || mime === "image/svg+xml") {
    try {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    } catch {
      /* ignore */
    }
    throw new Error("Выберите фото: JPG, PNG, WebP или GIF");
  }

  const optimized = await optimizeUploadedImage(file.path, {
    forceWebp: true,
    maxEdge: slot.maxEdge || 1600,
    variantWidths: slot.variants || []
  });

  const site = cms.getSite();
  const prev = mediaFromSite(site)[slot.id];
  unlinkMediaEntry(prev);

  const entry = {
    url: optimized.url,
    srcset: srcsetString(optimized.url, optimized.variants, optimized.width),
    width: optimized.width,
    height: optimized.height,
    format: "webp"
  };
  cms.saveSite({ media: { [slot.id]: entry } });
  return { slot: { ...resolveSlot(slot, cms.getSite()) }, optimized };
}

module.exports = {
  SLOTS,
  listSlots,
  replaceSlot,
  slotById
};

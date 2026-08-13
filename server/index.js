const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const compression = require("compression");
const multer = require("multer");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const catalog = require("./catalog");
const cms = require("./cms-store");
const store = require("./orders-store");
const leads = require("./leads-store");
const { optimizeUploadedImage } = require("./image-optimize");
const orders1c = require("./orders-1c-export");
const notify = require("./notify");
const backup = require("./backup");
const tgClients = require("./telegram-clients");
const delivery = require("./delivery");
const { jsBundleMiddleware } = require("./js-bundles");

notify.attachStore(store);

const app = express();
app.disable("x-powered-by");

// Same-origin storefront; reflect Origin only for localhost / known hosts (no wildcard).
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      try {
        const host = new URL(origin).hostname;
        const ok =
          host === "localhost" ||
          host === "127.0.0.1" ||
          host === "northmp.su" ||
          host.endsWith(".northmp.su") ||
          host.endsWith(".lhr.life") ||
          host.endsWith(".loca.lt") ||
          host.endsWith(".trycloudflare.com") ||
          host.endsWith(".pinggy.link");
        return cb(null, ok);
      } catch {
        return cb(null, false);
      }
    },
    credentials: false
  })
);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  // HSTS only when request is HTTPS (or behind TLS-terminating proxy)
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "").split(",")[0].trim();
  if (proto === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  // Baseline CSP: allow self + maps/fonts/payment widgets used by the storefront
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
      "script-src 'self' 'unsafe-inline' https://unpkg.com https://yookassa.ru https://*.yookassa.ru https://mc.yandex.ru https://www.googletagmanager.com",
      "connect-src 'self' https: wss:",
      "frame-src 'self' https://yoomoney.ru https://*.yoomoney.ru https://yookassa.ru https://*.yookassa.ru https://mc.yandex.ru https://mc.yandex.com"
    ].join("; ")
  );
  next();
});

app.use(compression({ threshold: 512, level: 6 }));

app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true }));

const ROOT = path.join(__dirname, "..");
const UPLOAD_DIR = path.join(ROOT, "images", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
      const safe = ext.replace(/[^\.a-z0-9]/g, "") || ".jpg";
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${safe}`);
    }
  }),
  limits: { fileSize: 40 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif|svg\+xml)$/.test(file.mimetype)) cb(null, true);
    else if (/^video\/(mp4|webm|quicktime)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Можно загружать изображения или видео (mp4/webm)"));
  }
});

const CONFIG = {
  account: process.env.CDEK_ACCOUNT,
  secure: process.env.CDEK_SECURE,
  apiUrl: (process.env.CDEK_API_URL || "https://api.cdek.ru/v2").replace(/\/$/, ""),
  fromCity: process.env.CDEK_FROM_CITY || "Петрозаводск",
  fromCityCode: Number(process.env.CDEK_FROM_CITY_CODE || 450),
  fromAddress: process.env.CDEK_FROM_ADDRESS || "Лесной проспект 47",
  yandexKey: process.env.YANDEX_MAPS_API_KEY || "",
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, ""),
  adminToken: process.env.ADMIN_TOKEN || "",
  adminUser: process.env.ADMIN_USER || "",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  shipSlaHours: Number(process.env.SHIP_SLA_HOURS || 48),
  yookassa: {
    shopId: process.env.YOOKASSA_SHOP_ID || "",
    secretKey: process.env.YOOKASSA_SECRET_KEY || "",
    apiUrl: "https://api.yookassa.ru/v3"
  },
  // Демо, если явно включено, ключей нет, или передан только secret без shopId
  paymentsDemo:
    String(process.env.PAYMENTS_DEMO || "").toLowerCase() === "true" ||
    (!process.env.YOOKASSA_SHOP_ID && !process.env.YOOKASSA_SECRET_KEY) ||
    (Boolean(process.env.YOOKASSA_SECRET_KEY) && !process.env.YOOKASSA_SHOP_ID),
  package: {
    weight: Number(process.env.PACKAGE_WEIGHT || 8000),
    length: Number(process.env.PACKAGE_LENGTH || 60),
    width: Number(process.env.PACKAGE_WIDTH || 40),
    height: Number(process.env.PACKAGE_HEIGHT || 10)
  },
  pickupAddress: process.env.PICKUP_ADDRESS || "г. Петрозаводск, ул. Университетская 7/3",
  yandexMetricaId: String(process.env.YANDEX_METRICA_ID || "").replace(/\D/g, ""),
  gaMeasurementId: String(process.env.GA_MEASUREMENT_ID || "").trim(),
  analyticsRequireConsent:
    String(process.env.ANALYTICS_REQUIRE_CONSENT || "true").toLowerCase() !== "false"
};

const yookassaReady = Boolean(CONFIG.yookassa.shopId && CONFIG.yookassa.secretKey);
const yookassaSecretOnly = Boolean(!CONFIG.yookassa.shopId && CONFIG.yookassa.secretKey);

let tokenCache = { value: "", expiresAt: 0 };

async function getToken() {
  if (tokenCache.value && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.value;
  }
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CONFIG.account,
    client_secret: CONFIG.secure
  });
  const res = await fetch(`${CONFIG.apiUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.message || "CDEK auth failed");
  }
  tokenCache = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000
  };
  return tokenCache.value;
}

async function cdekRequest(methodPath, { method = "GET", query, json } = {}) {
  const token = await getToken();
  let url = `${CONFIG.apiUrl}/${methodPath.replace(/^\//, "")}`;
  if (query) {
    const qs = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") qs.append(k, String(v));
    });
    url += `?${qs.toString()}`;
  }

  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "X-App-Name": "widget_pvz",
    "X-App-Version": "3.11.1"
  };

  const init = { method, headers };
  if (json) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(json);
  }

  const res = await fetch(url, init);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data, text };
}

function mapCdekStatus(code, name) {
  const n = `${code || ""} ${name || ""}`.toLowerCase();
  if (/вручен|выдан получателю|получен получателем|delivered/.test(n)) return "arrived";
  if (/прибыл|в пвз|на складе пвз|ожидает получателя|готов к выдаче|posted/.test(n)) return "arrived";
  if (/в пути|отправлен|транзит|передан|доставляется|на пути|departed|accepted_at_transit/.test(n)) {
    return "shipped";
  }
  if (/создан|принят|склад отправителя|принят на склад|created|received_at_shipment_warehouse/.test(n)) {
    return "assembly";
  }
  return null;
}

async function fetchCdekOrderEntity(order) {
  const queries = [
    order.cdek?.uuid ? { path: `orders/${order.cdek.uuid}` } : null,
    order.cdek?.trackNumber ? { path: "orders", query: { cdek_number: order.cdek.trackNumber } } : null,
    order.id ? { path: "orders", query: { im_number: order.id } } : null
  ].filter(Boolean);

  for (const q of queries) {
    const result = await cdekRequest(q.path, q.query ? { query: q.query } : {});
    if (result.ok && result.data?.entity) return result.data.entity;
  }

  const mapped = store.findCdekMap(order.id) || store.findCdekMap(order.cdek?.trackNumber || "");
  if (mapped?.uuid) {
    const result = await cdekRequest(`orders/${mapped.uuid}`);
    if (result.ok && result.data?.entity) return result.data.entity;
  }
  return null;
}

async function syncOrderFromProviders(orderId, { force = false } = {}) {
  let order = store.getOrder(orderId);
  if (!order) throw new Error("Заказ не найден");

  const sync = {
    at: new Date().toISOString(),
    payment: null,
    cdek: null,
    changes: []
  };
  let patch = {};
  let next = order;

  // --- YooKassa ---
  if (yookassaReady && order.paymentId) {
    try {
      const payment = await yookassaRequest(`payments/${order.paymentId}`);
      if (payment.ok && payment.data?.status) {
        const payStatus = String(payment.data.status);
        sync.payment = {
          id: payment.data.id,
          status: payStatus,
          paid: Boolean(payment.data.paid),
          amount: payment.data.amount || null
        };

        if (payStatus === "succeeded" && order.paymentStatus !== "paid") {
          next = await markOrderPaid(order.id, {
            paymentId: payment.data.id,
            source: "yookassa"
          });
          sync.changes.push("Оплата подтверждена в ЮKassa");
          order = next;
        } else if (payStatus === "canceled" && order.paymentStatus !== "paid") {
          patch.paymentStatus = "canceled";
          patch.cdek = {
            ...order.cdek,
            stage: "Оплата отменена в ЮKassa",
            history: [
              ...(order.cdek?.history || []),
              {
                at: sync.at,
                title: "Оплата отменена",
                detail: `ЮKassa · ${payment.data.id}`
              }
            ]
          };
          sync.changes.push("Оплата отменена в ЮKassa");
        } else if (payStatus === "succeeded") {
          sync.changes.push("ЮKassa: оплата уже учтена");
        } else {
          sync.changes.push(`ЮKassa: статус «${payStatus}»`);
        }
      } else {
        sync.payment = { error: payment.data?.description || `HTTP ${payment.status}` };
      }
    } catch (error) {
      sync.payment = { error: error.message };
    }
  } else if (!order.paymentId) {
    sync.payment = { skipped: "нет paymentId" };
  } else {
    sync.payment = { skipped: "ЮKassa не настроена" };
  }

  // Re-read after possible markOrderPaid
  order = store.getOrder(orderId) || order;

  // --- CDEK ---
  const isCdek = (order.deliveryMethod || "cdek") === "cdek";
  if (isCdek && (order.cdek?.uuid || order.cdek?.trackNumber || order.paymentStatus === "paid" || force)) {
    try {
      const entity = await fetchCdekOrderEntity(order);
      if (entity) {
        const statuses = entity.statuses || [];
        const current = statuses[0] || {};
        const mapped = mapCdekStatus(current.code, current.name);
        const trackNumber = entity.cdek_number || order.cdek?.trackNumber || "";
        const stageName = current.name || order.cdek?.stage || "СДЭК";
        const city = current.city ? ` · ${current.city}` : "";

        sync.cdek = {
          uuid: entity.uuid || order.cdek?.uuid || "",
          trackNumber,
          code: current.code || "",
          name: current.name || "",
          date_time: current.date_time || "",
          city: current.city || "",
          mappedStatus: mapped
        };

        const cdekPatch = {
          ...(patch.cdek || order.cdek || {}),
          uuid: entity.uuid || order.cdek?.uuid || "",
          trackNumber,
          stage: `${stageName}${city}`,
          lastExternalStatus: {
            code: current.code || "",
            name: current.name || "",
            date_time: current.date_time || "",
            city: current.city || ""
          },
          history: [...(patch.cdek?.history || order.cdek?.history || [])]
        };

        const lastHist = cdekPatch.history[cdekPatch.history.length - 1];
        const histDetail = [current.name, current.city, trackNumber && `№ ${trackNumber}`]
          .filter(Boolean)
          .join(" · ");
        if (!lastHist || lastHist.detail !== histDetail || lastHist.title !== "Синхронизация СДЭК") {
          cdekPatch.history = [
            ...cdekPatch.history,
            {
              at: sync.at,
              title: "Синхронизация СДЭК",
              detail: histDetail || entity.uuid
            }
          ].slice(-40);
        }

        patch.cdek = cdekPatch;

        // Only advance status forward; never downgrade arrived → shipped etc.
        const rank = { pending_payment: 0, assembly: 1, shipped: 2, arrived: 3, cancelled: -1 };
        if (mapped && order.status !== "cancelled") {
          const currentRank = rank[order.status] ?? 0;
          const nextRank = rank[mapped] ?? 0;
          if (nextRank > currentRank) {
            patch.status = mapped;
            sync.changes.push(`Статус заказа → ${mapped} (по СДЭК)`);
          } else {
            sync.changes.push(`СДЭК: ${stageName}${city}`);
          }
        } else {
          sync.changes.push(`СДЭК: ${stageName}${city}`);
        }
      } else {
        sync.cdek = { skipped: "заказ в СДЭК не найден" };
      }
    } catch (error) {
      sync.cdek = { error: error.message };
    }
  } else if (!isCdek) {
    sync.cdek = { skipped: "не СДЭК-доставка" };
  } else {
    sync.cdek = { skipped: "нет данных для запроса в СДЭК" };
  }

  patch.lastSync = sync;
  const beforeKey = [
    order.status || "",
    order.paymentStatus || "",
    order.cdek?.stage || "",
    order.cdek?.trackNumber || ""
  ].join("|");
  next = store.updateOrder(orderId, patch);
  const afterKey = [
    next.status || "",
    next.paymentStatus || "",
    next.cdek?.stage || "",
    next.cdek?.trackNumber || ""
  ].join("|");
  if (afterKey !== beforeKey || (sync.changes || []).length) {
    notify
      .notifyCustomerOrderMove(next, {
        title: `📦 Заказ ${next.id}: обновление доставки`,
        detail: (sync.changes || []).join("; ")
      })
      .catch(() => {});
  }
  return { order: next, sync };
}

function publicOrder(order) {
  if (!order) return null;
  return {
    id: order.id,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    shipByAt: order.shipByAt,
    status: order.status,
    paymentStatus: order.paymentStatus,
    deliveryMethod: order.deliveryMethod || "cdek",
    carrierId: order.carrierId || (order.deliveryMethod === "cdek" || !order.deliveryMethod ? "cdek" : null),
    items: order.items,
    total: order.total,
    goodsTotal: order.goodsTotal,
    deliverySum: order.deliverySum,
    city: order.city,
    cityCode: order.cityCode,
    pvzCode: order.pvzCode,
    pvzAddress: order.pvzAddress,
    tariffCode: order.tariffCode,
    comment: order.comment,
    cdek: order.cdek,
    telegramLinked: Boolean(
      order.customer?.telegramChatId ||
        tgClients.resolveChatId({ orderId: order.id, phone: order.customer?.phone })
    ),
    customer: {
      lastName: order.customer?.lastName,
      firstName: order.customer?.firstName,
      middleName: order.customer?.middleName,
      phone: order.customer?.phone,
      email: order.customer?.email,
      city: order.customer?.city
    }
  };
}

/** Public order endpoints: phone must match (anti-PII scrape by order id). */
function requireMatchingOrderPhone(order, req) {
  const phoneDigits = store.normalizePhoneDigits(
    String(req.query?.phone || req.body?.phone || req.headers?.["x-order-phone"] || "")
  );
  if (phoneDigits.length < 10) {
    return { ok: false, status: 400, message: "Укажите телефон, с которым оформляли заказ" };
  }
  const orderPhone = store.normalizePhoneDigits(order.customer?.phone);
  if (!orderPhone || orderPhone !== phoneDigits) {
    return { ok: false, status: 403, message: "Телефон не совпадает с заказом" };
  }
  return { ok: true };
}

function normalizeAdminToken(raw) {
  let token = String(raw || "").trim();
  if (/^bearer\s+/i.test(token)) token = token.replace(/^bearer\s+/i, "").trim();
  if (/^admin_token\s*=\s*/i.test(token)) token = token.replace(/^admin_token\s*=\s*/i, "").trim();
  return token;
}

function safeEqualText(a, b) {
  const left = Buffer.from(String(a ?? ""), "utf8");
  const right = Buffer.from(String(b ?? ""), "utf8");
  const size = Math.max(left.length, right.length, 1);
  const leftPad = Buffer.alloc(size);
  const rightPad = Buffer.alloc(size);
  left.copy(leftPad);
  right.copy(rightPad);
  return crypto.timingSafeEqual(leftPad, rightPad) && left.length === right.length;
}

function adminGuard(req, res, next) {
  const header = req.headers.authorization || "";
  const raw = header.startsWith("Bearer ") ? header.slice(7) : req.headers["x-admin-token"] || "";
  const token = normalizeAdminToken(raw);
  if (!CONFIG.adminToken || !safeEqualText(token, CONFIG.adminToken)) {
    return res.status(401).json({ message: "Сессия админки истекла или неверна. Войдите снова." });
  }
  next();
}

const adminLoginAttempts = new Map();

function clientIp(req) {
  const xf = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  return xf || req.socket?.remoteAddress || "unknown";
}

function consumeAdminLoginAttempt(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxFails = 5;
  let entry = adminLoginAttempts.get(ip);
  if (!entry || now - entry.windowStart > windowMs) {
    entry = { windowStart: now, fails: 0 };
    adminLoginAttempts.set(ip, entry);
  }
  if (entry.fails >= maxFails) {
    const retryAfterSec = Math.ceil((entry.windowStart + windowMs - now) / 1000);
    return { blocked: true, retryAfterSec };
  }
  return { blocked: false, entry };
}

app.post("/api/admin/login", (req, res) => {
  const ip = clientIp(req);
  const gate = consumeAdminLoginAttempt(ip);
  if (gate.blocked) {
    res.setHeader("Retry-After", String(gate.retryAfterSec));
    return res.status(429).json({
      message: `Слишком много попыток входа. Повторите через ${gate.retryAfterSec} сек.`
    });
  }

  const login = String(req.body?.login || req.body?.username || "").trim();
  const password = String(req.body?.password || "");

  if (!CONFIG.adminUser || !CONFIG.adminPassword || !CONFIG.adminToken) {
    return res.status(503).json({
      message: "Админка не настроена: задайте ADMIN_USER, ADMIN_PASSWORD и ADMIN_TOKEN в .env"
    });
  }

  const loginOk = safeEqualText(login, CONFIG.adminUser);
  const passwordOk = safeEqualText(password, CONFIG.adminPassword);
  if (!loginOk || !passwordOk) {
    gate.entry.fails += 1;
    return res.status(401).json({ message: "Неверный логин или пароль" });
  }

  adminLoginAttempts.delete(ip);
  return res.json({
    ok: true,
    token: CONFIG.adminToken,
    user: CONFIG.adminUser
  });
});

function baseUrlFromReq(req) {
  if (CONFIG.publicBaseUrl) return CONFIG.publicBaseUrl;
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

function packageForOrder(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  let weight = 0;
  let maxL = 0;
  let maxW = 0;
  let maxH = 0;
  items.forEach((item) => {
    const product = cms.getProduct(item.productId) || cms.getProduct(item.sku);
    const qty = Math.max(1, Number(item.qty || 1));
    const w = Number(product?.packageWeight || CONFIG.package.weight);
    const l = Number(product?.packageLength || CONFIG.package.length);
    const wi = Number(product?.packageWidth || CONFIG.package.width);
    const h = Number(product?.packageHeight || CONFIG.package.height);
    weight += w * qty;
    maxL = Math.max(maxL, l);
    maxW = Math.max(maxW, wi);
    maxH = Math.max(maxH, h);
  });
  if (!weight) weight = CONFIG.package.weight;
  return {
    weight: Math.max(100, Math.round(weight)),
    length: Math.max(1, Math.round(maxL || CONFIG.package.length)),
    width: Math.max(1, Math.round(maxW || CONFIG.package.width)),
    height: Math.max(1, Math.round(maxH || CONFIG.package.height))
  };
}

async function createCdekWaybill(order) {
  if (order.deliveryMethod && order.deliveryMethod !== "cdek") {
    throw new Error("Для самовывоза и городской доставки накладная СДЭК не создаётся");
  }
  const pack = packageForOrder(order);
  const phone = String(order.customer?.phone || "").replace(/[^\d]/g, "");
  const packagesItems = order.items.map((item, index) => {
    const product = cms.getProduct(item.productId) || cms.getProduct(item.sku);
    const itemWeight = Number(product?.packageWeight || CONFIG.package.weight);
    return {
      name: `${item.sku} · ${item.name}`,
      ware_key: String(item.sku || item.productId || index + 1),
      payment: { value: 0 },
      cost: Number(item.price || 0),
      weight: Math.max(100, Math.round(itemWeight)),
      amount: Number(item.qty || 1)
    };
  });

  const payload = {
    type: 1,
    number: String(order.id),
    tariff_code: Number(order.tariffCode || 136),
    comment:
      order.comment ||
      `Northern Magical Place${order.pvzAddress ? ` · ПВЗ: ${order.pvzAddress}` : ""}`,
    delivery_point: String(order.pvzCode),
    from_location: {
      code: CONFIG.fromCityCode,
      address: CONFIG.fromAddress
    },
    recipient: {
      name: `${order.customer.lastName} ${order.customer.firstName} ${order.customer.middleName || ""}`.trim(),
      phones: [{ number: phone }],
      ...(order.customer.email ? { email: order.customer.email } : {})
    },
    packages: [
      {
        number: "1",
        weight: pack.weight,
        length: pack.length,
        width: pack.width,
        height: pack.height,
        items: packagesItems
      }
    ]
  };

  const result = await cdekRequest("orders", { method: "POST", json: payload });
  if (!result.ok) {
    const message =
      result.data?.requests?.[0]?.errors || result.data?.message || result.data || "CDEK error";
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }

  const entity = result.data?.entity || {};
  let uuid = entity.uuid;
  let cdekNumber = entity.cdek_number || "";

  if (uuid && !cdekNumber) {
    await new Promise((r) => setTimeout(r, 1200));
    const info = await cdekRequest(`orders/${uuid}`);
    cdekNumber = info.data?.entity?.cdek_number || cdekNumber;
  }

  store.rememberCdekMap({
    number: String(order.id),
    uuid,
    cdekNumber,
    pvzCode: order.pvzCode,
    pvzAddress: order.pvzAddress,
    createdAt: new Date().toISOString(),
    recipient: order.customer
  });

  return { uuid, cdekNumber };
}

async function markOrderPaid(orderId, { paymentId = "", source = "manual" } = {}) {
  const order = store.getOrder(orderId);
  if (!order) throw new Error("Заказ не найден");
  if (order.paymentStatus === "paid") return order;

  const paidAt = new Date();
  const shipByAt = new Date(paidAt.getTime() + CONFIG.shipSlaHours * 3600 * 1000);

  let cdekPatch = {
    ...order.cdek,
    stage:
      order.deliveryMethod === "pickup"
        ? "Оплачен · сборка · самовывоз по договорённости"
        : order.deliveryMethod === "local"
          ? "Оплачен · сборка · городская доставка по договорённости"
          : "Оплачен · сборка на производстве",
    history: [
      ...(order.cdek?.history || []),
      {
        at: paidAt.toISOString(),
        title: "Оплата получена",
        detail: source === "yookassa" ? `ЮKassa · ${paymentId}` : "Демо / ручное подтверждение"
      }
    ]
  };

  if (!order.deliveryMethod || order.deliveryMethod === "cdek") {
    try {
      const cdek = await createCdekWaybill({ ...order, paidAt: paidAt.toISOString() });
      cdekPatch = {
        ...cdekPatch,
        uuid: cdek.uuid || "",
        trackNumber: cdek.cdekNumber || "",
        stage: cdek.cdekNumber
          ? `Создан в СДЭК · № ${cdek.cdekNumber}`
          : "Заявка создана в СДЭК, номер появится после обработки",
        history: [
          ...cdekPatch.history,
          {
            at: new Date().toISOString(),
            title: "Передано в СДЭК",
            detail: cdek.cdekNumber || cdek.uuid || "Заявка принята"
          }
        ]
      };
    } catch (error) {
      cdekPatch = {
        ...cdekPatch,
        stage: "Оплата принята. СДЭК: " + error.message,
        history: [
          ...cdekPatch.history,
          {
            at: new Date().toISOString(),
            title: "Ошибка создания накладной СДЭК",
            detail: error.message
          }
        ]
      };
    }
  } else {
    cdekPatch = {
      ...cdekPatch,
      history: [
        ...cdekPatch.history,
        {
          at: new Date().toISOString(),
          title:
            order.deliveryMethod === "pickup"
              ? "Самовывоз со склада"
              : "Адресная доставка по Петрозаводску",
          detail:
            order.deliveryMethod === "pickup"
              ? order.pvzAddress || "г. Петрозаводск, ул. Университетская 7/3"
              : "Согласовать адрес и время с клиентом"
        }
      ]
    };
  }

  const paid = store.updateOrder(orderId, {
    paymentStatus: "paid",
    paymentId: paymentId || order.paymentId || "",
    paidAt: paidAt.toISOString(),
    shipByAt: shipByAt.toISOString(),
    status: "assembly",
    cdek: cdekPatch
  });
  notify
    .notifyCustomerOrderMove(paid, {
      title: `✅ Заказ ${paid.id} оплачен`,
      detail: "Начали сборку",
      force: true
    })
    .catch(() => {});
  return paid;
}

async function yookassaRequest(methodPath, { method = "GET", json, idempotenceKey } = {}) {
  const auth = Buffer.from(`${CONFIG.yookassa.shopId}:${CONFIG.yookassa.secretKey}`).toString(
    "base64"
  );
  const headers = {
    Authorization: `Basic ${auth}`,
    Accept: "application/json"
  };
  if (json) headers["Content-Type"] = "application/json";
  if (idempotenceKey) headers["Idempotence-Key"] = idempotenceKey;

  const res = await fetch(`${CONFIG.yookassa.apiUrl}/${methodPath.replace(/^\//, "")}`, {
    method,
    headers,
    body: json ? JSON.stringify(json) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/* ---------- Public config / health ---------- */

app.get("/api/health", async (_req, res) => {
  try {
    await getToken();
    res.json({
      ok: true,
      cdek: true,
      from: {
        city: CONFIG.fromCity,
        code: CONFIG.fromCityCode,
        address: CONFIG.fromAddress
      },
      pickupAddress: CONFIG.pickupAddress,
      mapProvider: "openstreetmap",
      yandexMaps: false,
      yookassa: yookassaReady,
      yookassaNeedsShopId: yookassaSecretOnly,
      paymentsDemo: CONFIG.paymentsDemo && !yookassaReady,
      telegramNotify: notify.isConfigured(),
      admin: Boolean(CONFIG.adminToken),
      carriers: delivery.listPublic().map((p) => ({
        id: p.id,
        enabled: p.enabled,
        comingSoon: Boolean(p.comingSoon)
      }))
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/config/public", (_req, res) => {
  res.json({
    fromCity: CONFIG.fromCity,
    fromCityCode: CONFIG.fromCityCode,
    fromAddress: CONFIG.fromAddress,
    pickupAddress: CONFIG.pickupAddress,
    deliveryMethods: ["cdek", "pickup", "local"],
    checkoutMethods: delivery.checkoutMethods(),
    /** ТК: активный СДЭК + будущие (comingSoon) без включения на витрине */
    carriers: delivery.listPublic(),
    defaultCarrierId: delivery.defaultCarrierId(),
    mapProvider: "openstreetmap",
    yandexMapsApiKey: "",
    servicePath: "/api/cdek/service",
    package: CONFIG.package,
    payments: {
      mode: yookassaReady ? "yookassa" : "demo",
      shopId: yookassaReady ? CONFIG.yookassa.shopId : "",
      demo: CONFIG.paymentsDemo && !yookassaReady,
      needsShopId: yookassaSecretOnly
    },
    shipSlaHours: CONFIG.shipSlaHours,
    analytics: {
      enabled: Boolean(CONFIG.yandexMetricaId || CONFIG.gaMeasurementId),
      yandexMetricaId: CONFIG.yandexMetricaId || "",
      gaMeasurementId: CONFIG.gaMeasurementId || "",
      requireConsent: CONFIG.analyticsRequireConsent
    }
  });
});

app.get("/api/delivery/providers", (_req, res) => {
  res.json({
    ok: true,
    defaultCarrierId: delivery.defaultCarrierId(),
    providers: delivery.listPublic(),
    checkoutMethods: delivery.checkoutMethods()
  });
});

app.get("/api/products", (_req, res) => {
  res.json(cms.getPublicCms().products);
});

app.get("/api/cms", (_req, res) => {
  res.json(cms.getPublicCms());
});

app.post("/api/availability-notify", (req, res) => {
  try {
    const body = req.body || {};
    const consentOk =
      body.consent === true ||
      body.consent === "true" ||
      body.consent === "on" ||
      body.consent === 1 ||
      body.consent === "1";
    if (!consentOk) {
      return res.status(400).json({ message: "Нужно согласие на обработку персональных данных" });
    }
    const product = cms.getProduct(body.productId);
    if (!product || product.active === false) {
      return res.status(404).json({ message: "Товар не найден" });
    }
    if (product.availableForOrder !== false) {
      return res.status(400).json({
        message: "Этот товар уже доступен к заказу — оформите покупку на сайте"
      });
    }
    const lead = leads.addLead({
      name: body.name,
      phone: body.phone,
      email: body.email,
      comment: body.comment,
      productId: product.id,
      productName: product.name,
      productSku: product.sku,
      type: "availability",
      consentAt: new Date().toISOString()
    });
    notify.notifyNewLead(lead).catch(() => {});
    res.json({ ok: true, lead: { id: lead.id, createdAt: lead.createdAt } });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post("/api/contact", (req, res) => {
  try {
    const body = req.body || {};
    const consentOk =
      body.consent === true ||
      body.consent === "true" ||
      body.consent === "on" ||
      body.consent === 1 ||
      body.consent === "1";
    if (!consentOk) {
      return res.status(400).json({ message: "Нужно согласие на обработку персональных данных" });
    }
    const lead = leads.addLead({
      type: "contact",
      name: body.name,
      phone: body.phone,
      email: body.email,
      comment: body.message || body.comment,
      consentAt: new Date().toISOString()
    });
    notify.notifyNewLead(lead).catch(() => {});
    res.json({ ok: true, id: lead.id });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/orders/lookup", (req, res) => {
  try {
    const orderId = String(req.query.orderId || req.query.id || "").trim();
    const phoneRaw = String(req.query.phone || "").trim();
    const phoneDigits = store.normalizePhoneDigits(phoneRaw);
    const hasOrderId = Boolean(orderId);
    const hasPhone = phoneDigits.length >= 10;

    // Телефон обязателен: по одному orderId не отдаём ПДн
    if (!hasPhone) {
      return res.status(400).json({
        message: "Укажите телефон, с которым оформляли заказ"
      });
    }

    if (hasOrderId) {
      const order = store.getOrder(orderId);
      if (!order) return res.status(404).json({ message: "Заказ не найден" });
      if (store.normalizePhoneDigits(order.customer?.phone) !== phoneDigits) {
        return res.status(403).json({ message: "Телефон не совпадает с заказом" });
      }
      const pub = publicOrder(order);
      return res.json({ ok: true, order: pub, orders: [pub] });
    }

    const matched = store.findOrdersByPhone(phoneDigits).map(publicOrder).filter(Boolean);
    if (!matched.length) {
      return res.status(404).json({ message: "По этому телефону заказов не найдено" });
    }
    res.json({ ok: true, order: matched[0], orders: matched });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/orders/:id/telegram-link", async (req, res) => {
  try {
    const order = store.getOrder(req.params.id);
    if (!order) return res.status(404).json({ message: "Заказ не найден" });
    const gate = requireMatchingOrderPhone(order, req);
    if (!gate.ok) return res.status(gate.status).json({ message: gate.message });
    const url = await notify.deepLinkForOrder(order.id);
    if (!url) {
      return res.status(503).json({ message: "Telegram-бот не настроен" });
    }
    const linked = Boolean(
      order.customer?.telegramChatId ||
        tgClients.resolveChatId({ orderId: order.id, phone: order.customer?.phone })
    );
    res.json({
      ok: true,
      url,
      linked,
      bot: await notify.resolveBotUsername()
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/admin/orders/:id/notify-telegram", adminGuard, async (req, res) => {
  try {
    const order = store.getOrder(req.params.id);
    if (!order) return res.status(404).json({ message: "Заказ не найден" });
    const result = await notify.notifyCustomerOrderMove(order, {
      title: req.body?.title || `📦 Заказ ${order.id}: статус`,
      detail: req.body?.detail || order.cdek?.stage || "",
      force: true
    });
    if (result.skipped && result.reason === "client not linked") {
      const url = await notify.deepLinkForOrder(order.id);
      return res.status(409).json({
        message:
          "Клиент ещё не привязал Telegram. Отправьте ему ссылку из личного кабинета или попросите нажать Start у бота.",
        url
      });
    }
    if (!result.ok) {
      return res.status(502).json({ message: result.error || result.reason || "Не удалось отправить" });
    }
    res.json({ ok: true, order: decorateAdminOrder(store.getOrder(order.id)) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/* ---------- CDEK ---------- */

app.all("/api/cdek/service", async (req, res) => {
  try {
    const payload = { ...req.query, ...(req.body || {}) };
    const action = payload.action;
    if (!action) return res.status(400).json({ message: "Action is required" });

    if (action === "offices") {
      const { action: _a, ...query } = payload;
      const result = await cdekRequest("deliverypoints", { query });
      res.status(result.status).type("json").send(result.text);
      return;
    }

    if (action === "calculate") {
      const { action: _a, ...json } = payload;
      const result = await cdekRequest("calculator/tarifflist", { method: "POST", json });
      res.status(result.status).type("json").send(result.text);
      return;
    }

    res.status(400).json({ message: "Unknown action" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/cdek/cities", async (req, res) => {
  try {
    const city = String(req.query.q || req.query.city || "").trim();
    if (city.length < 2) return res.json([]);
    const result = await cdekRequest("location/cities", {
      query: { city, country_codes: "RU", size: 12 }
    });
    if (!result.ok) return res.status(result.status).json(result.data);
    res.json(result.data || []);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/cdek/pvz", async (req, res) => {
  try {
    const cityCode = req.query.city_code;
    if (!cityCode) return res.status(400).json({ message: "city_code required" });
    const result = await cdekRequest("deliverypoints", {
      query: {
        city_code: cityCode,
        type: req.query.type || "PVZ",
        is_handout: true
      }
    });
    if (!result.ok) return res.status(result.status).json(result.data);
    const list = Array.isArray(result.data) ? result.data : [];
    res.json(
      list.slice(0, 40).map((p) => ({
        code: p.code,
        name: p.name,
        address: p.location?.address_full || p.location?.address || p.address,
        work_time: p.work_time,
        type: p.type,
        city: p.location?.city,
        city_code: p.location?.city_code,
        latitude: p.location?.latitude,
        longitude: p.location?.longitude
      }))
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/cdek/calculate", async (req, res) => {
  try {
    const { toCityCode, toPvzCode, tariffCode, items: rawItems = [] } = req.body || {};
    if (!toCityCode && !toPvzCode) {
      return res.status(400).json({ message: "toCityCode or toPvzCode required" });
    }

    const pack = packageForOrder({
      items: Array.isArray(rawItems) && rawItems.length
        ? rawItems
        : [{ productId: "1", qty: 1 }]
    });

    const json = {
      type: 1,
      from_location: {
        code: CONFIG.fromCityCode,
        address: CONFIG.fromAddress
      },
      to_location: toCityCode ? { code: Number(toCityCode) } : undefined,
      packages: [
        {
          weight: pack.weight,
          length: pack.length,
          width: pack.width,
          height: pack.height
        }
      ]
    };

    let result;
    if (tariffCode) {
      result = await cdekRequest("calculator/tariff", {
        method: "POST",
        json: { ...json, tariff_code: Number(tariffCode) }
      });
    } else {
      result = await cdekRequest("calculator/tarifflist", { method: "POST", json });
    }

    if (!result.ok) return res.status(result.status).json(result.data);

    const tariffs = result.data?.tariff_codes || result.data?.tariffs || [];
    const preferred = [136, 483, 368, 234, 138];
    let best = null;
    if (Array.isArray(tariffs) && tariffs.length) {
      best =
        preferred
          .map((code) => tariffs.find((t) => Number(t.tariff_code) === code))
          .find(Boolean) || tariffs[0];
    } else if (result.data?.delivery_sum != null) {
      best = result.data;
    }

    res.json({
      ok: true,
      from: { city: CONFIG.fromCity, address: CONFIG.fromAddress, code: CONFIG.fromCityCode },
      tariff: best
        ? {
            code: best.tariff_code || tariffCode || null,
            name: best.tariff_name || "СДЭК",
            delivery_sum: best.delivery_sum,
            period_min: best.period_min,
            period_max: best.period_max,
            calendar_min: best.calendar_min,
            calendar_max: best.calendar_max
          }
        : null,
      all: tariffs
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/cdek/track/:query", async (req, res) => {
  try {
    const q = String(req.params.query || "").trim();
    if (!q) return res.status(400).json({ message: "track query required" });

    let result = await cdekRequest(`orders`, { query: { cdek_number: q } });
    if (!result.ok || !result.data?.entity) {
      result = await cdekRequest(`orders/${q}`);
    }
    if ((!result.ok || !result.data?.entity) && !q.includes("-")) {
      result = await cdekRequest(`orders`, { query: { im_number: q } });
    }

    if (!result.ok || !result.data?.entity) {
      const local = store.findCdekMap(q) || store.getOrder(q);
      const uuid = local?.uuid || local?.cdek?.uuid;
      if (uuid) result = await cdekRequest(`orders/${uuid}`);
    }

    if (!result.ok || !result.data?.entity) {
      return res.status(404).json({ ok: false, message: "Заказ в СДЭК не найден", raw: result.data });
    }

    const entity = result.data.entity;
    const statuses = entity.statuses || [];
    const current = statuses[0] || {};
    const mapped = mapCdekStatus(current.code, current.name) || "shipped";

    res.json({
      ok: true,
      statusSite: mapped,
      cdekNumber: entity.cdek_number,
      uuid: entity.uuid,
      current: {
        code: current.code,
        name: current.name,
        date_time: current.date_time,
        city: current.city
      },
      history: statuses.map((s) => ({
        code: s.code,
        name: s.name,
        date_time: s.date_time,
        city: s.city
      })),
      deliveryPoint: entity.delivery_detail || entity.delivery_point || null,
      recipient: entity.recipient || null
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

/* ---------- Shop orders + YooKassa ---------- */

app.post("/api/orders", async (req, res) => {
  try {
    const body = req.body || {};
    const {
      lastName,
      firstName,
      middleName = "",
      phone,
      email,
      city,
      cityCode,
      deliveryMethod: rawMethod = "cdek",
      pvzCode,
      pvzAddress,
      tariffCode = 136,
      deliverySum = 0,
      comment = "",
      items: rawItems = []
    } = body;

    const deliveryMethod = ["cdek", "pickup", "local"].includes(String(rawMethod))
      ? String(rawMethod)
      : "cdek";

    if (!lastName || !firstName || !phone || !email) {
      return res.status(400).json({ message: "Заполните данные получателя" });
    }

    const PICKUP_ADDRESS = CONFIG.pickupAddress;
    const LOCAL_LABEL = "Адресная доставка по г. Петрозаводску (по договорённости)";
    const localAddress = String(body.localAddress || "").trim();

    let nextCity = city;
    let nextCityCode = cityCode;
    let nextPvzCode = pvzCode;
    let nextPvzAddress = pvzAddress;
    let nextTariff = Number(tariffCode) || 136;
    let shippingSum = Math.max(0, Number(deliverySum) || 0);

    if (deliveryMethod === "cdek") {
      if (!cityCode || !pvzCode || !pvzAddress) {
        return res.status(400).json({ message: "Заполните данные получателя и ПВЗ" });
      }
    } else if (deliveryMethod === "pickup") {
      nextCity = nextCity || "Петрозаводск";
      nextCityCode = nextCityCode || String(CONFIG.fromCityCode || 450);
      nextPvzCode = "PICKUP";
      nextPvzAddress = PICKUP_ADDRESS;
      nextTariff = 0;
      shippingSum = 0;
    } else if (deliveryMethod === "local") {
      if (!localAddress && !String(comment || "").trim()) {
        return res.status(400).json({ message: "Укажите адрес доставки по Петрозаводску" });
      }
      nextCity = nextCity || "Петрозаводск";
      nextCityCode = nextCityCode || String(CONFIG.fromCityCode || 450);
      nextPvzCode = "LOCAL";
      nextPvzAddress = localAddress || String(comment || "").trim() || LOCAL_LABEL;
      nextTariff = 0;
      shippingSum = 0;
    }

    const items = catalog.resolveOrderItems(rawItems);
    const goodsTotal = items.reduce((sum, item) => sum + item.sum, 0);
    const total = goodsTotal + shippingSum;

    // carrierId — ТК для carrier-backed методов; pickup/local без ТК
    let carrierId = null;
    if (deliveryMethod === "cdek") {
      const requested = String(body.carrierId || "cdek").trim();
      const provider = delivery.get(requested);
      if (!provider || !provider.enabled) {
        return res.status(400).json({
          message: "Выбранная служба доставки пока недоступна. Сейчас работает СДЭК."
        });
      }
      carrierId = provider.id;
    }

    const order = store.createOrder({
      customer: {
        lastName,
        firstName,
        middleName,
        phone,
        email,
        city: nextCity,
        cityCode: nextCityCode
      },
      items,
      goodsTotal,
      deliverySum: shippingSum,
      deliveryMethod,
      carrierId,
      total,
      city: nextCity,
      cityCode: nextCityCode,
      pvzCode: nextPvzCode,
      pvzAddress: nextPvzAddress,
      tariffCode: nextTariff,
      comment:
        deliveryMethod === "local" && localAddress
          ? [localAddress, comment].filter(Boolean).join(" · ")
          : comment,
      localAddress: deliveryMethod === "local" ? localAddress || nextPvzAddress : "",
      cdek: {
        trackNumber: "",
        uuid: "",
        stage:
          deliveryMethod === "pickup"
            ? "Ожидает оплату · самовывоз"
            : deliveryMethod === "local"
              ? "Ожидает оплату · городская доставка"
              : "Ожидает оплату",
        history: [
          {
            at: new Date().toISOString(),
            title: "Заказ создан",
            detail:
              deliveryMethod === "pickup"
                ? `Самовывоз: ${PICKUP_ADDRESS}`
                : deliveryMethod === "local"
                  ? `Адрес: ${localAddress || comment || LOCAL_LABEL}`
                  : "Доставка СДЭК · ожидает оплату"
          }
        ]
      }
    });

    notify.notifyNewOrder(order).catch(() => {});
    res.json({ ok: true, order: publicOrder(order) });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/orders/:id", (req, res) => {
  const order = store.getOrder(req.params.id);
  if (!order) return res.status(404).json({ message: "Заказ не найден" });
  const gate = requireMatchingOrderPhone(order, req);
  if (!gate.ok) return res.status(gate.status).json({ message: gate.message });
  res.json({ ok: true, order: publicOrder(order) });
});

app.post("/api/orders/:id/cancel", async (req, res) => {
  try {
    const order = store.getOrder(req.params.id);
    if (!order) return res.status(404).json({ message: "Заказ не найден" });

    if (order.status === "cancelled") {
      return res.json({ ok: true, already: true, order: publicOrder(order) });
    }

    const gate = requireMatchingOrderPhone(order, req);
    if (!gate.ok) return res.status(gate.status).json({ message: gate.message });

    // Покупатель может отменить до передачи в доставку
    const cancellable =
      order.status === "pending_payment" ||
      (order.status === "assembly" && !(order.cdek?.trackNumber || order.cdek?.uuid));
    if (!cancellable || ["shipped", "arrived"].includes(order.status)) {
      return res.status(400).json({
        message:
          "Этот заказ уже нельзя отменить самостоятельно. Напишите нам в обратную связь — поможем."
      });
    }

    const reason = String(req.body?.reason || "Отмена покупателем").slice(0, 400);
    const at = new Date().toISOString();
    const history = [
      ...(order.cdek?.history || []),
      { at, title: "Заказ отменён покупателем", detail: reason }
    ].slice(-40);

    const updated = store.updateOrder(order.id, {
      status: "cancelled",
      paymentStatus: order.paymentStatus === "paid" ? order.paymentStatus : "canceled",
      cancelledAt: at,
      cancelReason: reason,
      cancelledBy: "customer",
      cdek: {
        ...order.cdek,
        stage: "Отменён покупателем",
        history
      }
    });

    notify
      .notifyCustomerOrderMove(updated, {
        title: `📦 Заказ ${updated.id}: отменён`,
        detail: reason,
        force: true
      })
      .catch(() => {});
    notify
      .sendTelegram(`🚫 Покупатель отменил заказ ${updated.id}\n${reason}`)
      .catch(() => {});

    res.json({ ok: true, order: publicOrder(updated) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/payments/create", async (req, res) => {
  try {
    const { orderId } = req.body || {};
    const order = store.getOrder(orderId);
    if (!order) return res.status(404).json({ message: "Заказ не найден" });
    if (order.paymentStatus === "paid") {
      return res.json({ ok: true, alreadyPaid: true, order: publicOrder(order) });
    }

    if (!yookassaReady) {
      if (!CONFIG.paymentsDemo) {
        return res.status(503).json({
          message: "ЮKassa не настроена. Добавьте YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY в .env"
        });
      }
      return res.json({
        ok: true,
        mode: "demo",
        confirmationUrl: `${baseUrlFromReq(req)}/account.html?order=${encodeURIComponent(
          order.id
        )}&pay=demo`
      });
    }

    const returnUrl = `${baseUrlFromReq(req)}/account.html?order=${encodeURIComponent(
      order.id
    )}&payment=return`;
    const skuList = order.items.map((i) => i.sku).join(", ");

    const paymentBody = {
      amount: {
        value: Number(order.total).toFixed(2),
        currency: "RUB"
      },
      capture: true,
      confirmation: {
        type: "redirect",
        return_url: returnUrl
      },
      description: `NMP ${order.id} · ${skuList}`.slice(0, 128),
      metadata: {
        orderId: order.id,
        skus: skuList
      }
    };

    // Чек 54-ФЗ — если в ЮKassa включена онлайн-касса. Иначе отправим платёж без receipt.
    if (String(process.env.YOOKASSA_SEND_RECEIPT || "true").toLowerCase() === "true") {
      paymentBody.receipt = {
        customer: {
          email: order.customer.email,
          phone: String(order.customer.phone || "").replace(/[^\d+]/g, "")
        },
        items: [
          ...order.items.map((item) => ({
            description: `${item.sku} ${item.name}`.slice(0, 128),
            quantity: String(item.qty),
            amount: {
              value: Number(item.price).toFixed(2),
              currency: "RUB"
            },
            vat_code: Number(process.env.YOOKASSA_VAT_CODE || 1),
            payment_mode: "full_payment",
            payment_subject: "commodity"
          })),
          ...(order.deliverySum > 0
            ? [
                {
                  description: "Доставка СДЭК",
                  quantity: "1",
                  amount: {
                    value: Number(order.deliverySum).toFixed(2),
                    currency: "RUB"
                  },
                  vat_code: Number(process.env.YOOKASSA_VAT_CODE || 1),
                  payment_mode: "full_payment",
                  payment_subject: "service"
                }
              ]
            : [])
        ]
      };
    }

    let payment = await yookassaRequest("payments", {
      method: "POST",
      idempotenceKey: crypto.randomUUID(),
      json: paymentBody
    });

    // Если касса не подключена — повторяем без receipt
    if (!payment.ok && paymentBody.receipt) {
      delete paymentBody.receipt;
      payment = await yookassaRequest("payments", {
        method: "POST",
        idempotenceKey: crypto.randomUUID(),
        json: paymentBody
      });
    }

    if (!payment.ok) {
      return res.status(payment.status).json({
        message: payment.data?.description || payment.data?.message || "Ошибка ЮKassa",
        raw: payment.data
      });
    }

    const confirmationUrl = payment.data?.confirmation?.confirmation_url;
    store.updateOrder(order.id, {
      paymentId: payment.data.id,
      paymentUrl: confirmationUrl || ""
    });

    res.json({
      ok: true,
      mode: "yookassa",
      paymentId: payment.data.id,
      confirmationUrl,
      order: publicOrder(store.getOrder(order.id))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/payments/demo/:orderId", async (req, res) => {
  try {
    if (yookassaReady && !CONFIG.paymentsDemo) {
      return res.status(403).json({ message: "Демо-оплата отключена: ЮKassa активна" });
    }
    const order = await markOrderPaid(req.params.orderId, { source: "demo" });
    res.json({ ok: true, order: publicOrder(order) });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/payments/webhook", (_req, res) => {
  res.status(200).json({
    ok: true,
    message:
      "Webhook ЮKassa активен. Касса шлёт сюда POST-уведомления; открытие ссылки в браузере (GET) — нормальная проверка URL."
  });
});

app.post("/api/payments/webhook", async (req, res) => {
  try {
    const event = req.body || {};
    const payment = event.object || {};
    const orderId = payment.metadata?.orderId;
    if (event.event === "payment.succeeded" && orderId) {
      await markOrderPaid(orderId, { paymentId: payment.id, source: "yookassa" });
    }
    if (event.event === "payment.canceled" && orderId) {
      const order = store.getOrder(orderId);
      if (order && order.paymentStatus !== "paid") {
        store.updateOrder(orderId, {
          paymentStatus: "canceled",
          status: "cancelled",
          cdek: {
            ...order.cdek,
            stage: "Оплата отменена",
            history: [
              ...(order.cdek?.history || []),
              {
                at: new Date().toISOString(),
                title: "Оплата отменена",
                detail: payment.id || ""
              }
            ]
          }
        });
      }
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/payments/status/:orderId", async (req, res) => {
  try {
    let order = store.getOrder(req.params.orderId);
    if (!order) return res.status(404).json({ message: "Заказ не найден" });
    const gate = requireMatchingOrderPhone(order, req);
    if (!gate.ok) return res.status(gate.status).json({ message: gate.message });

    if (yookassaReady && order.paymentId && order.paymentStatus !== "paid") {
      const payment = await yookassaRequest(`payments/${order.paymentId}`);
      if (payment.ok && payment.data.status === "succeeded") {
        order = await markOrderPaid(order.id, {
          paymentId: payment.data.id,
          source: "yookassa"
        });
      }
    }

    res.json({ ok: true, order: publicOrder(order) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/* ---------- Admin CMS ---------- */

app.get("/api/admin/cms", adminGuard, (_req, res) => {
  res.json({ ok: true, ...cms.getAdminCms() });
});

app.put("/api/admin/site", adminGuard, (req, res) => {
  try {
    const site = cms.saveSite(req.body || {});
    res.json({ ok: true, site });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post("/api/admin/products", adminGuard, (req, res) => {
  try {
    const product = cms.saveProduct(req.body || {}, { isNew: true });
    res.json({ ok: true, product });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.put("/api/admin/products/:id", adminGuard, (req, res) => {
  try {
    const product = cms.saveProduct({ ...(req.body || {}), id: req.params.id }, { isNew: false });
    res.json({ ok: true, product });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.delete("/api/admin/products/:id", adminGuard, (req, res) => {
  try {
    cms.deleteProduct(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

function collectionRoutes(name) {
  app.post(`/api/admin/${name}`, adminGuard, (req, res) => {
    try {
      const item = cms.saveInCollection(name, req.body || {}, { isNew: true });
      res.json({ ok: true, item });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app.put(`/api/admin/${name}/:id`, adminGuard, (req, res) => {
    try {
      const item = cms.saveInCollection(name, { ...(req.body || {}), id: req.params.id }, { isNew: false });
      res.json({ ok: true, item });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app.delete(`/api/admin/${name}/:id`, adminGuard, (req, res) => {
    try {
      cms.deleteInCollection(name, req.params.id);
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
}

collectionRoutes("news");
collectionRoutes("reviews");
collectionRoutes("promotions");

app.post("/api/admin/upload", adminGuard, (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message || "Ошибка загрузки" });
    if (!req.file) return res.status(400).json({ message: "Файл не получен" });
    try {
      const absolute = path.join(UPLOAD_DIR, req.file.filename);
      const isVideo = /^video\//.test(req.file.mimetype || "");
      if (isVideo) {
        const url = `images/uploads/${req.file.filename}`;
        return res.json({
          ok: true,
          url,
          path: url,
          filename: req.file.filename,
          format: path.extname(req.file.filename).replace(".", "") || "mp4",
          bytesBefore: req.file.size,
          bytesAfter: req.file.size,
          optimized: false
        });
      }
      const optimized = await optimizeUploadedImage(absolute);
      res.json({
        ok: true,
        url: optimized.url,
        path: optimized.url,
        filename: optimized.filename,
        width: optimized.width,
        height: optimized.height,
        format: optimized.format,
        bytesBefore: optimized.bytesBefore,
        bytesAfter: optimized.bytesAfter,
        optimized: true,
        maxEdge: 1600
      });
    } catch (error) {
      const url = `images/uploads/${req.file.filename}`;
      res.json({
        ok: true,
        url,
        path: url,
        filename: req.file.filename,
        optimized: false,
        message: "Файл сохранён без оптимизации: " + (error.message || "ошибка")
      });
    }
  });
});

/* ---------- Admin leads + orders ---------- */

app.get("/api/admin/leads", adminGuard, (_req, res) => {
  res.json({ ok: true, leads: leads.listLeads() });
});

app.patch("/api/admin/leads/:id", adminGuard, (req, res) => {
  try {
    const { status, adminNotes } = req.body || {};
    const patch = {};
    if (status) patch.status = String(status);
    if (adminNotes != null) patch.adminNotes = String(adminNotes);
    const item = leads.updateLead(req.params.id, patch);
    if (!item) return res.status(404).json({ message: "Заявка не найдена" });
    res.json({ ok: true, lead: item });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.delete("/api/admin/leads/:id", adminGuard, (req, res) => {
  try {
    const ok = leads.deleteLead(req.params.id);
    if (!ok) return res.status(404).json({ message: "Заявка не найдена" });
    res.json({ ok: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/admin/leads/bulk", adminGuard, (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).filter(Boolean) : [];
    const action = String(req.body?.action || "").trim();
    if (!ids.length) return res.status(400).json({ message: "Не выбраны заявки" });
    if (action === "delete") {
      const result = leads.bulkDeleteLeads(ids);
      return res.json({ ok: true, okCount: result.deleted, failCount: 0, ...result });
    }
    if (action === "status") {
      const status = String(req.body?.status || "").trim();
      if (!["new", "done"].includes(status)) {
        return res.status(400).json({ message: "Некорректный статус заявки" });
      }
      const result = leads.bulkUpdateLeads(ids, { status });
      return res.json({ ok: true, okCount: result.changed, failCount: 0, ...result });
    }
    return res.status(400).json({ message: "Неизвестное действие" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/admin/orders", adminGuard, (_req, res) => {
  const now = Date.now();
  const orders = store.listOrders().map((order) => ({
    ...order,
    needsShip:
      order.paymentStatus === "paid" &&
      ["assembly", "pending_payment"].includes(order.status) &&
      !order.cdek?.trackNumber,
    overdue: Boolean(
      order.shipByAt &&
        order.paymentStatus === "paid" &&
        new Date(order.shipByAt).getTime() < now &&
        order.status === "assembly"
    )
  }));
  res.json({ ok: true, orders, shipSlaHours: CONFIG.shipSlaHours, yookassa: yookassaReady });
});

app.get("/api/admin/orders/export", adminGuard, async (req, res) => {
  try {
    const format = String(req.query.format || "commerceml").toLowerCase();
    const scope = String(req.query.scope || "paid").toLowerCase();
    const markExported = String(req.query.mark || "") === "1" || String(req.query.markExported || "") === "1";
    const ids = String(req.query.ids || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const selected = orders1c.filterOrdersForExport(store.listOrders(), { scope, ids });
    const exported = await orders1c.exportOrders(selected, format);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const kind = format === "xlsx" || format === "excel" ? "excel" : "1c";
    const filename = `nmp-orders-${kind}-${scope}-${stamp}.${exported.extension}`;

    if (markExported && selected.length) {
      const at = new Date().toISOString();
      selected.forEach((order) => {
        store.updateOrder(order.id, {
          exportedTo1cAt: at,
          cdek: {
            ...order.cdek,
            history: [
              ...(order.cdek?.history || []),
              {
                at,
                title: format === "xlsx" || format === "excel" ? "Выгружен в Excel" : "Выгружен в 1С",
                detail: `Формат ${format} · файл ${filename}`
              }
            ].slice(-40)
          }
        });
      });
    }

    res.setHeader("Content-Type", exported.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-NMP-Export-Count", String(selected.length));
    res.send(exported.body);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/admin/orders/sync-all", adminGuard, async (req, res) => {
  try {
    const limit = Math.min(80, Math.max(1, Number(req.body?.limit || 40)));
    const orders = store.listOrders().filter((order) => {
      if (order.status === "cancelled") return false;
      if (order.paymentStatus !== "paid" && order.paymentId) return true;
      if (order.paymentStatus === "paid" && ["assembly", "shipped"].includes(order.status)) return true;
      if ((order.deliveryMethod || "cdek") === "cdek" && (order.cdek?.uuid || order.cdek?.trackNumber)) {
        return order.status !== "arrived";
      }
      return false;
    });

    const results = [];
    for (const order of orders.slice(0, limit)) {
      try {
        const synced = await syncOrderFromProviders(order.id);
        results.push({
          id: order.id,
          ok: true,
          changes: synced.sync.changes,
          status: synced.order.status,
          paymentStatus: synced.order.paymentStatus,
          stage: synced.order.cdek?.stage || ""
        });
      } catch (error) {
        results.push({ id: order.id, ok: false, message: error.message });
      }
    }

    res.json({
      ok: true,
      synced: results.length,
      results,
      orders: decorateAdminOrders(store.listOrders())
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/admin/orders/:id/sync", adminGuard, async (req, res) => {
  try {
    const synced = await syncOrderFromProviders(req.params.id, { force: true });
    res.json({
      ok: true,
      order: decorateAdminOrder(synced.order),
      sync: synced.sync
    });
  } catch (error) {
    const status = /не найден/i.test(error.message) ? 404 : 500;
    res.status(status).json({ message: error.message });
  }
});

app.delete("/api/admin/orders/:id", adminGuard, (req, res) => {
  try {
    const order = store.getOrder(req.params.id);
    if (!order) return res.status(404).json({ message: "Заказ не найден" });
    store.deleteOrder(req.params.id);
    res.json({ ok: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

function decorateAdminOrder(order) {
  const now = Date.now();
  const telegramChatId =
    order.customer?.telegramChatId ||
    tgClients.resolveChatId({ orderId: order.id, phone: order.customer?.phone }) ||
    "";
  return {
    ...order,
    telegramLinked: Boolean(telegramChatId),
    telegramChatId: telegramChatId ? String(telegramChatId) : "",
    needsShip:
      order.paymentStatus === "paid" &&
      ["assembly", "pending_payment"].includes(order.status) &&
      !order.cdek?.trackNumber,
    overdue: Boolean(
      order.shipByAt &&
        order.paymentStatus === "paid" &&
        new Date(order.shipByAt).getTime() < now &&
        order.status === "assembly"
    )
  };
}

function decorateAdminOrders(orders) {
  return orders.map(decorateAdminOrder);
}

function applyOrderEdit(order, body = {}) {
  const patch = {};
  if (typeof body.adminNotes === "string") patch.adminNotes = body.adminNotes;
  if (typeof body.comment === "string") patch.comment = body.comment;
  if (typeof body.city === "string") patch.city = body.city.trim();
  if (body.cityCode !== undefined && body.cityCode !== null && body.cityCode !== "") {
    patch.cityCode = String(body.cityCode).trim();
  }
  if (typeof body.pvzCode === "string") patch.pvzCode = body.pvzCode.trim();
  if (typeof body.pvzAddress === "string") patch.pvzAddress = body.pvzAddress.trim();
  if (body.tariffCode !== undefined && body.tariffCode !== null && body.tariffCode !== "") {
    patch.tariffCode = Number(body.tariffCode) || order.tariffCode;
  }
  if (["cdek", "pickup", "local"].includes(String(body.deliveryMethod || ""))) {
    patch.deliveryMethod = String(body.deliveryMethod);
  }
  if (body.deliverySum !== undefined && body.deliverySum !== null && body.deliverySum !== "") {
    patch.deliverySum = Math.max(0, Number(body.deliverySum) || 0);
  }
  if (body.goodsTotal !== undefined && body.goodsTotal !== null && body.goodsTotal !== "") {
    patch.goodsTotal = Math.max(0, Number(body.goodsTotal) || 0);
  }
  if (body.total !== undefined && body.total !== null && body.total !== "") {
    patch.total = Math.max(0, Number(body.total) || 0);
  } else if (patch.goodsTotal !== undefined || patch.deliverySum !== undefined) {
    const goods = patch.goodsTotal !== undefined ? patch.goodsTotal : Number(order.goodsTotal || 0);
    const delivery =
      patch.deliverySum !== undefined ? patch.deliverySum : Number(order.deliverySum || 0);
    patch.total = goods + delivery;
  }

  if (body.customer && typeof body.customer === "object") {
    patch.customer = {
      ...order.customer,
      lastName: String(body.customer.lastName ?? order.customer?.lastName ?? "").trim(),
      firstName: String(body.customer.firstName ?? order.customer?.firstName ?? "").trim(),
      middleName: String(body.customer.middleName ?? order.customer?.middleName ?? "").trim(),
      phone: String(body.customer.phone ?? order.customer?.phone ?? "").trim(),
      email: String(body.customer.email ?? order.customer?.email ?? "").trim(),
      city: String(body.customer.city ?? order.customer?.city ?? patch.city ?? "").trim()
    };
  }

  if (typeof body.trackNumber === "string") {
    patch.cdek = {
      ...order.cdek,
      trackNumber: body.trackNumber.trim(),
      stage: body.trackNumber.trim()
        ? order.cdek?.stage || `Трек СДЭК · ${body.trackNumber.trim()}`
        : order.cdek?.stage || ""
    };
  }

  if (
    body.paymentStatus &&
    ["pending", "paid", "canceled", "cancelled", "waiting_for_capture"].includes(body.paymentStatus)
  ) {
    patch.paymentStatus = body.paymentStatus === "cancelled" ? "canceled" : body.paymentStatus;
  }

  return patch;
}

async function mutateAdminOrder(id, body = {}) {
  const order = store.getOrder(id);
  if (!order) {
    const err = new Error("Заказ не найден");
    err.status = 404;
    throw err;
  }

  const { status, createCdek, markPaid, sync, edit } = body;
  let updated = order;
  let syncResult = null;

  if (sync) {
    const synced = await syncOrderFromProviders(order.id, { force: true });
    return { order: decorateAdminOrder(synced.order), sync: synced.sync };
  }

  if (markPaid && order.paymentStatus !== "paid") {
    updated = await markOrderPaid(order.id, { source: "admin" });
  }

  if (createCdek && updated.paymentStatus === "paid" && !updated.cdek?.uuid) {
    if ((updated.deliveryMethod || "cdek") !== "cdek") {
      const err = new Error("Для самовывоза и городской доставки накладная СДЭК не создаётся");
      err.status = 400;
      err.order = decorateAdminOrder(updated);
      throw err;
    }
    try {
      const cdek = await createCdekWaybill(updated);
      updated = store.updateOrder(updated.id, {
        cdek: {
          ...updated.cdek,
          uuid: cdek.uuid,
          trackNumber: cdek.cdekNumber || "",
          stage: cdek.cdekNumber
            ? `Создан в СДЭК · № ${cdek.cdekNumber}`
            : "Заявка создана в СДЭК",
          history: [
            ...(updated.cdek?.history || []),
            {
              at: new Date().toISOString(),
              title: "Накладная создана вручную",
              detail: cdek.cdekNumber || cdek.uuid
            }
          ]
        }
      });
    } catch (error) {
      const err = new Error("СДЭК: " + error.message);
      err.status = 400;
      err.order = decorateAdminOrder(updated);
      throw err;
    }
  }

  const patch = edit ? applyOrderEdit(updated, body) : {};
  if (!edit && typeof body.adminNotes === "string") patch.adminNotes = body.adminNotes;

  if (status && ["assembly", "shipped", "arrived", "cancelled", "pending_payment"].includes(status)) {
    patch.status = status;
    const history = [...((patch.cdek || updated.cdek)?.history || [])];
    if (status === "shipped") {
      history.push({
        at: new Date().toISOString(),
        title: "Отмечено админом: отправка",
        detail: "Заказ сдан в доставку"
      });
      patch.cdek = {
        ...(patch.cdek || updated.cdek),
        stage: "Отправлен · сдан в СДЭК",
        history
      };
    } else if (status === "arrived") {
      history.push({
        at: new Date().toISOString(),
        title: "Отмечено админом: прибыл / выдан",
        detail: "Заказ доступен к вручению или выдан"
      });
      patch.cdek = {
        ...(patch.cdek || updated.cdek),
        stage: "Прибыл к вручению / выдан",
        history
      };
    } else if (status === "cancelled") {
      history.push({
        at: new Date().toISOString(),
        title: "Заказ отменён админом",
        detail: body.cancelReason || "Отмена"
      });
      patch.cdek = {
        ...(patch.cdek || updated.cdek),
        stage: "Отменён",
        history
      };
    }
  }

  if (Object.keys(patch).length) updated = store.updateOrder(updated.id, patch);
  if (status) {
    notify
      .notifyCustomerOrderMove(updated, {
        title: `📦 Заказ ${updated.id}: ${notify.statusLabel(updated)}`,
        detail: updated.cdek?.stage || "",
        force: true
      })
      .catch(() => {});
  }
  return { order: decorateAdminOrder(updated), sync: syncResult };
}

app.patch("/api/admin/orders/:id", adminGuard, async (req, res) => {
  try {
    const result = await mutateAdminOrder(req.params.id, req.body || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      message: error.message,
      ...(error.order ? { order: error.order } : {})
    });
  }
});

app.post("/api/admin/orders/bulk", adminGuard, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).filter(Boolean) : [];
  const action = String(req.body?.action || "").trim();
  if (!ids.length) return res.status(400).json({ message: "Не выбраны заказы" });

  const results = [];
  for (const id of ids) {
    try {
      if (action === "delete") {
        const order = store.getOrder(id);
        if (!order) throw Object.assign(new Error("Заказ не найден"), { status: 404 });
        store.deleteOrder(id);
        results.push({ id, ok: true });
        continue;
      }
      if (action === "notifyTelegram") {
        const order = store.getOrder(id);
        if (!order) throw Object.assign(new Error("Заказ не найден"), { status: 404 });
        const result = await notify.notifyCustomerOrderMove(order, {
          title: `📦 Заказ ${order.id}: статус`,
          detail: order.cdek?.stage || "",
          force: true
        });
        if (result.skipped && result.reason === "client not linked") {
          results.push({ id, ok: false, message: "Telegram не привязан" });
        } else if (!result.ok) {
          results.push({ id, ok: false, message: result.error || result.reason || "Не удалось отправить" });
        } else {
          results.push({ id, ok: true });
        }
        continue;
      }
      if (action === "sync") {
        const result = await mutateAdminOrder(id, { sync: true });
        results.push({ id, ok: true, changes: result.sync?.changes || [] });
        continue;
      }
      if (action === "markPaid") {
        await mutateAdminOrder(id, { markPaid: true });
        results.push({ id, ok: true });
        continue;
      }
      if (action === "status") {
        const status = String(req.body?.status || "").trim();
        if (!["assembly", "shipped", "arrived", "cancelled", "pending_payment"].includes(status)) {
          throw Object.assign(new Error("Некорректный статус"), { status: 400 });
        }
        await mutateAdminOrder(id, { status });
        results.push({ id, ok: true });
        continue;
      }
      throw Object.assign(new Error("Неизвестное действие"), { status: 400 });
    } catch (error) {
      results.push({ id, ok: false, message: error.message });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  res.json({ ok: true, processed: results.length, okCount, failCount: results.length - okCount, results });
});

// SEO: 301 old underscore asset URLs to hyphenated names
const LEGACY_ASSET_REDIRECTS = {
  "/images/Telegram_Logo.svg": "/images/telegram-logo.svg",
  "/images/WhatsApp_logo.svg": "/images/whatsapp-logo.svg",
  "/images/Instagram_Logo.svg": "/images/instagram-logo.svg",
  "/images/MAX_Logo.svg": "/images/max-logo.svg",
  "/images/MAX_SS.webp": "/images/max-ss.webp",
  "/images/MAX_SS.jpg": "/images/max-ss.jpg"
};
app.use((req, res, next) => {
  const target = LEGACY_ASSET_REDIRECTS[req.path];
  if (target) return res.redirect(301, target);
  const slug = typeof req.query.slug === "string" ? req.query.slug : "";
  if (req.path === "/product.html" && slug.includes("_")) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (value == null) continue;
      params.set(key, key === "slug" ? String(value).replace(/_/g, "-") : String(value));
    }
    return res.redirect(301, `/product.html?${params.toString()}`);
  }
  next();
});

// Never expose repo internals / secrets / PII JSON via express.static(ROOT)
app.use((req, res, next) => {
  let pathname = req.path || "/";
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    return res.status(400).type("text/plain").send("Bad request");
  }
  pathname = path.posix.normalize(pathname.replace(/\\/g, "/"));
  if (pathname.includes("\0") || pathname.includes("..")) {
    return res.status(400).type("text/plain").send("Bad request");
  }
  const lower = pathname.toLowerCase();
  const blockedPrefixes = ["/server", "/node_modules", "/.git", "/.cursor", "/docs"];
  const blockedExact = new Set([
    "/package.json",
    "/package-lock.json",
    "/.gitignore",
    "/.env",
    "/readme.md",
    "/license",
    "/license.md"
  ]);
  if (
    blockedPrefixes.some((p) => lower === p || lower.startsWith(`${p}/`)) ||
    blockedExact.has(lower) ||
    /(^|\/)\.env(\.|$|\/)/i.test(lower) ||
    lower.endsWith(".md")
  ) {
    return res.status(404).type("text/plain").send("Not found");
  }
  next();
});

app.use(jsBundleMiddleware(ROOT));

app.use(
  express.static(ROOT, {
    dotfiles: "deny",
    index: ["index.html"],
    setHeaders(res, filePath) {
      if (/\.(html?)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "no-cache");
      } else if (/\.(css|js|mjs)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=86400");
      } else if (/\.(woff2?|png|jpe?g|webp|svg|ico)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=604800");
      }
    }
  })
);

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`NMP server http://127.0.0.1:${port}`);
  console.log(`CDEK from: ${CONFIG.fromCity}, ${CONFIG.fromAddress}`);
  console.log(`Pickup: ${CONFIG.pickupAddress}`);
  console.log(`Map: OpenStreetMap (Leaflet)`);
  console.log(`YooKassa: ${yookassaReady ? "on" : CONFIG.paymentsDemo ? "demo" : "off"}`);
  console.log(`Telegram notify: ${notify.isConfigured() ? "on" : "off"}`);
  console.log(`Telegram bot: ${notify.isBotReady() ? "polling" : "off"}`);
  console.log(`Admin: ${CONFIG.adminToken ? "/admin.html" : "token missing"}`);
  console.log(
    `Analytics: ${
      CONFIG.yandexMetricaId || CONFIG.gaMeasurementId
        ? `YM=${CONFIG.yandexMetricaId || "off"} GA=${CONFIG.gaMeasurementId || "off"}`
        : "off"
    }`
  );
  backup.startBackupScheduler();
  notify.startBotPolling();
});

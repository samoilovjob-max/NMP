const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const catalog = require("./catalog");
const cms = require("./cms-store");
const store = require("./orders-store");
const { optimizeUploadedImage } = require("./image-optimize");

const app = express();
app.use(cors());
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
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif|svg\+xml)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Можно загружать только изображения"));
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
  }
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
  if (/вручен|выдан|получен/.test(n)) return "arrived";
  if (/прибыл|в пвз|на складе|ожидает/.test(n)) return "arrived";
  if (/создан|принят|склад отправителя|принят на склад/.test(n)) return "assembly";
  if (/в пути|отправлен|транзит|передан|доставляется/.test(n)) return "shipped";
  return null;
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

function normalizeAdminToken(raw) {
  let token = String(raw || "").trim();
  if (/^bearer\s+/i.test(token)) token = token.replace(/^bearer\s+/i, "").trim();
  if (/^admin_token\s*=\s*/i.test(token)) token = token.replace(/^admin_token\s*=\s*/i, "").trim();
  return token;
}

function adminGuard(req, res, next) {
  const header = req.headers.authorization || "";
  const raw = header.startsWith("Bearer ") ? header.slice(7) : req.headers["x-admin-token"] || "";
  const token = normalizeAdminToken(raw);
  if (!CONFIG.adminToken || token !== CONFIG.adminToken) {
    return res.status(401).json({ message: "Неверный токен админки. Проверьте ADMIN_TOKEN в .env" });
  }
  next();
}

function baseUrlFromReq(req) {
  if (CONFIG.publicBaseUrl) return CONFIG.publicBaseUrl;
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

async function createCdekWaybill(order) {
  const phone = String(order.customer?.phone || "").replace(/[^\d]/g, "");
  const packagesItems = order.items.map((item, index) => ({
    name: `${item.sku} · ${item.name}`,
    ware_key: String(item.sku || item.productId || index + 1),
    payment: { value: 0 },
    cost: Number(item.price || 0),
    weight: Math.max(100, Math.round(CONFIG.package.weight / Math.max(order.items.length, 1))),
    amount: Number(item.qty || 1)
  }));

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
        weight: CONFIG.package.weight,
        length: CONFIG.package.length,
        width: CONFIG.package.width,
        height: CONFIG.package.height,
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
    stage: "Оплачен · сборка на производстве",
    history: [
      ...(order.cdek?.history || []),
      {
        at: paidAt.toISOString(),
        title: "Оплата получена",
        detail: source === "yookassa" ? `ЮKassa · ${paymentId}` : "Демо / ручное подтверждение"
      }
    ]
  };

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

  return store.updateOrder(orderId, {
    paymentStatus: "paid",
    paymentId: paymentId || order.paymentId || "",
    paidAt: paidAt.toISOString(),
    shipByAt: shipByAt.toISOString(),
    status: "assembly",
    cdek: cdekPatch
  });
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
      mapProvider: "openstreetmap",
      yandexMaps: false,
      yookassa: yookassaReady,
      yookassaNeedsShopId: yookassaSecretOnly,
      paymentsDemo: CONFIG.paymentsDemo && !yookassaReady,
      admin: Boolean(CONFIG.adminToken)
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
    shipSlaHours: CONFIG.shipSlaHours
  });
});

app.get("/api/products", (_req, res) => {
  res.json(cms.getPublicCms().products);
});

app.get("/api/cms", (_req, res) => {
  res.json(cms.getPublicCms());
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
    const { toCityCode, toPvzCode, tariffCode } = req.body || {};
    if (!toCityCode && !toPvzCode) {
      return res.status(400).json({ message: "toCityCode or toPvzCode required" });
    }

    const json = {
      type: 1,
      from_location: {
        code: CONFIG.fromCityCode,
        address: CONFIG.fromAddress
      },
      to_location: toCityCode ? { code: Number(toCityCode) } : undefined,
      packages: [
        {
          weight: CONFIG.package.weight,
          length: CONFIG.package.length,
          width: CONFIG.package.width,
          height: CONFIG.package.height
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
      pvzCode,
      pvzAddress,
      tariffCode = 136,
      deliverySum = 0,
      comment = "",
      items: rawItems = []
    } = body;

    if (!lastName || !firstName || !phone || !email || !cityCode || !pvzCode || !pvzAddress) {
      return res.status(400).json({ message: "Заполните данные получателя и ПВЗ" });
    }

    const items = catalog.resolveOrderItems(rawItems);
    const goodsTotal = items.reduce((sum, item) => sum + item.sum, 0);
    const delivery = Math.max(0, Number(deliverySum) || 0);
    const total = goodsTotal + delivery;

    const order = store.createOrder({
      customer: { lastName, firstName, middleName, phone, email, city, cityCode },
      items,
      goodsTotal,
      deliverySum: delivery,
      total,
      city,
      cityCode,
      pvzCode,
      pvzAddress,
      tariffCode: Number(tariffCode) || 136,
      comment
    });

    res.json({ ok: true, order: publicOrder(order) });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/orders/:id", (req, res) => {
  const order = store.getOrder(req.params.id);
  if (!order) return res.status(404).json({ message: "Заказ не найден" });
  res.json({ ok: true, order: publicOrder(order) });
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

/* ---------- Admin orders ---------- */

app.get("/api/admin/orders", adminGuard, (_req, res) => {
  const now = Date.now();
  const orders = store.listOrders().map((order) => ({
    ...order,
    needsShip:
      order.paymentStatus === "paid" &&
      ["assembly", "pending_payment"].includes(order.status) &&
      !order.cdek?.trackNumber,
    overdue: Boolean(order.shipByAt && order.paymentStatus === "paid" && new Date(order.shipByAt).getTime() < now && order.status === "assembly")
  }));
  res.json({ ok: true, orders, shipSlaHours: CONFIG.shipSlaHours });
});

app.patch("/api/admin/orders/:id", adminGuard, async (req, res) => {
  try {
    const order = store.getOrder(req.params.id);
    if (!order) return res.status(404).json({ message: "Заказ не найден" });

    const { status, adminNotes, createCdek, markPaid } = req.body || {};
    let updated = order;

    if (markPaid && order.paymentStatus !== "paid") {
      updated = await markOrderPaid(order.id, { source: "admin" });
    }

    if (createCdek && updated.paymentStatus === "paid" && !updated.cdek?.uuid) {
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
        return res.status(400).json({ message: "СДЭК: " + error.message, order: updated });
      }
    }

    const patch = {};
    if (typeof adminNotes === "string") patch.adminNotes = adminNotes;
    if (status && ["assembly", "shipped", "arrived", "cancelled", "pending_payment"].includes(status)) {
      patch.status = status;
      if (status === "shipped") {
        patch.cdek = {
          ...updated.cdek,
          stage: "Отправлен · сдан в СДЭК",
          history: [
            ...(updated.cdek?.history || []),
            {
              at: new Date().toISOString(),
              title: "Отмечено админом: отправка",
              detail: "Заказ сдан в доставку"
            }
          ]
        };
      }
    }

    if (Object.keys(patch).length) updated = store.updateOrder(updated.id, patch);
    res.json({ ok: true, order: updated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.use(express.static(ROOT));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`NMP server http://127.0.0.1:${port}`);
  console.log(`CDEK from: ${CONFIG.fromCity}, ${CONFIG.fromAddress}`);
  console.log(`Map: OpenStreetMap (Leaflet)`);
  console.log(`YooKassa: ${yookassaReady ? "on" : CONFIG.paymentsDemo ? "demo" : "off"}`);
  console.log(`Admin: ${CONFIG.adminToken ? "/admin.html" : "token missing"}`);
});

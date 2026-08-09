const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(__dirname, "data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

const CONFIG = {
  account: process.env.CDEK_ACCOUNT,
  secure: process.env.CDEK_SECURE,
  apiUrl: (process.env.CDEK_API_URL || "https://api.cdek.ru/v2").replace(/\/$/, ""),
  fromCity: process.env.CDEK_FROM_CITY || "Петрозаводск",
  fromCityCode: Number(process.env.CDEK_FROM_CITY_CODE || 450),
  fromAddress: process.env.CDEK_FROM_ADDRESS || "Лесной проспект 47",
  yandexKey: process.env.YANDEX_MAPS_API_KEY || "",
  package: {
    weight: Number(process.env.PACKAGE_WEIGHT || 8000),
    length: Number(process.env.PACKAGE_LENGTH || 60),
    width: Number(process.env.PACKAGE_WIDTH || 40),
    height: Number(process.env.PACKAGE_HEIGHT || 10)
  }
};

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, "[]", "utf8");

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

async function cdekRequest(methodPath, { method = "GET", query, json, form } = {}) {
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
  if (form) {
    init.body = form;
  } else if (json) {
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

function readOrders() {
  try {
    return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), "utf8");
}

function mapCdekStatus(code, name) {
  const n = `${code || ""} ${name || ""}`.toLowerCase();
  if (/вручен|выдан|получен/.test(n)) return "arrived";
  if (/прибыл|в пвз|на складе|ожидает/.test(n)) return "arrived";
  if (/создан|принят|склад отправителя|принят на склад/.test(n)) return "assembly";
  if (/в пути|отправлен|транзит|передан|доставляется/.test(n)) return "shipped";
  return null;
}

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
      yandexMaps: Boolean(CONFIG.yandexKey)
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
    yandexMapsApiKey: CONFIG.yandexKey,
    servicePath: "/api/cdek/service",
    package: CONFIG.package
  });
});

/** Widget-compatible proxy: action=offices | calculate */
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

    // Prefer specific tariff calc when known; else tarifflist
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
            name: best.tariff_name || best.tariff_name || "СДЭК",
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

app.post("/api/cdek/orders", async (req, res) => {
  try {
    const {
      number,
      tariffCode = 136,
      recipient,
      toCityCode,
      pvzCode,
      pvzAddress,
      items = [],
      comment = ""
    } = req.body || {};

    if (!number || !recipient?.name || !recipient?.phone || !pvzCode) {
      return res.status(400).json({ message: "number, recipient, pvzCode required" });
    }

    const packagesItems = (items.length ? items : [{ name: "Костровая система", cost: 1, amount: 1 }]).map(
      (item, index) => ({
        name: item.name || `Товар ${index + 1}`,
        ware_key: String(item.productId || index + 1),
        payment: { value: 0 },
        cost: Number(item.price || item.cost || 0),
        weight: Math.max(100, Math.round(CONFIG.package.weight / Math.max(items.length, 1))),
        amount: Number(item.qty || item.amount || 1)
      })
    );

    const phone = String(recipient.phone || "").replace(/[^\d]/g, "");
    const payload = {
      type: 1,
      number: String(number),
      tariff_code: Number(tariffCode),
      comment: comment || `Northern Magical Place${pvzAddress ? ` · ПВЗ: ${pvzAddress}` : ""}`,
      delivery_point: String(pvzCode),
      from_location: {
        code: CONFIG.fromCityCode,
        address: CONFIG.fromAddress
      },
      recipient: {
        name: recipient.name,
        phones: [{ number: phone }],
        ...(recipient.email ? { email: recipient.email } : {})
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
    // toCityCode нужен только для калькулятора на фронте
    void toCityCode;

    const result = await cdekRequest("orders", { method: "POST", json: payload });
    if (!result.ok) {
      return res.status(result.status).json({
        ok: false,
        message: result.data?.requests?.[0]?.errors || result.data?.message || result.data,
        raw: result.data
      });
    }

    const entity = result.data?.entity || {};
    const uuid = entity.uuid;
    let cdekNumber = entity.cdek_number || "";

    // Sometimes number appears after short delay
    if (uuid && !cdekNumber) {
      await new Promise((r) => setTimeout(r, 1200));
      const info = await cdekRequest(`orders/${uuid}`);
      cdekNumber = info.data?.entity?.cdek_number || cdekNumber;
    }

    const orders = readOrders();
    const record = {
      number: String(number),
      uuid,
      cdekNumber,
      pvzCode,
      pvzAddress,
      createdAt: new Date().toISOString(),
      recipient
    };
    orders.unshift(record);
    writeOrders(orders.slice(0, 500));

    res.json({
      ok: true,
      uuid,
      cdekNumber,
      pvzCode,
      request: result.data
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get("/api/cdek/track/:query", async (req, res) => {
  try {
    const q = String(req.params.query || "").trim();
    if (!q) return res.status(400).json({ message: "track query required" });

    // Try by CDEK number, then by UUID, then by client number
    let result = await cdekRequest(`orders`, { query: { cdek_number: q } });
    if (!result.ok || !result.data?.entity) {
      result = await cdekRequest(`orders/${q}`);
    }
    if ((!result.ok || !result.data?.entity) && !q.includes("-")) {
      result = await cdekRequest(`orders`, { query: { im_number: q } });
    }

    // Fallback: search local map then fetch uuid
    if (!result.ok || !result.data?.entity) {
      const local = readOrders().find(
        (o) => o.number === q || o.cdekNumber === q || o.uuid === q
      );
      if (local?.uuid) {
        result = await cdekRequest(`orders/${local.uuid}`);
      }
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

app.use(express.static(ROOT));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`NMP server http://127.0.0.1:${port}`);
  console.log(`CDEK from: ${CONFIG.fromCity}, ${CONFIG.fromAddress}`);
});

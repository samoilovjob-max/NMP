const clients = require("./telegram-clients");

const CONFIG = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || "",
  chatId: process.env.TELEGRAM_CHAT_ID || "",
  botUsername: process.env.TELEGRAM_BOT_USERNAME || ""
};

let cachedUsername = CONFIG.botUsername;
let pollOffset = 0;
let polling = false;
let pollTimer = null;
let storeRef = null;

function isBotReady() {
  return Boolean(CONFIG.botToken);
}

function isConfigured() {
  return Boolean(CONFIG.botToken && CONFIG.chatId);
}

async function api(method, body) {
  if (!CONFIG.botToken) return { ok: false, skipped: true, reason: "no token" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${CONFIG.botToken}/${method}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    return { ok: Boolean(data.ok), status: res.status, data };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function sendToChat(chatId, text) {
  if (!CONFIG.botToken || !chatId) {
    return { ok: false, skipped: true, reason: "bot/chat missing" };
  }
  return api("sendMessage", {
    chat_id: chatId,
    text: String(text || "").slice(0, 3900),
    disable_web_page_preview: true
  });
}

async function sendTelegram(text) {
  if (!CONFIG.chatId) {
    return { ok: false, skipped: true, reason: "TELEGRAM_CHAT_ID not set" };
  }
  return sendToChat(CONFIG.chatId, text);
}

async function resolveBotUsername() {
  if (cachedUsername) return cachedUsername;
  const me = await api("getMe");
  cachedUsername = me.data?.result?.username || "";
  return cachedUsername;
}

function startPayloadForOrder(orderId) {
  return `o_${String(orderId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60)}`;
}

function startPayloadForPhone(phone) {
  const digits = clients.normalizePhone(phone);
  return digits ? `p_${digits}` : "";
}

async function deepLinkForOrder(orderId) {
  const username = await resolveBotUsername();
  if (!username || !orderId) return "";
  return `https://t.me/${username}?start=${encodeURIComponent(startPayloadForOrder(orderId))}`;
}

async function deepLinkForPhone(phone) {
  const username = await resolveBotUsername();
  const payload = startPayloadForPhone(phone);
  if (!username || !payload) return "";
  return `https://t.me/${username}?start=${encodeURIComponent(payload)}`;
}

function formatOrderNotify(order) {
  const fio = [order.customer?.lastName, order.customer?.firstName, order.customer?.middleName]
    .filter(Boolean)
    .join(" ");
  const items = (order.items || [])
    .map((i) => `• ${i.sku || ""} ${i.name} ×${i.qty}`)
    .join("\n");
  return [
    `🛒 Новый заказ ${order.id}`,
    `Сумма: ${order.total} ₽`,
    `Оплата: ${order.paymentStatus}`,
    `Получение: ${order.deliveryMethod || "cdek"}`,
    `Клиент: ${fio}`,
    `Тел: ${order.customer?.phone || "—"}`,
    `Email: ${order.customer?.email || "—"}`,
    order.pvzAddress ? `Адрес/ПВЗ: ${order.pvzAddress}` : "",
    order.comment ? `Комментарий: ${order.comment}` : "",
    items ? `\n${items}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function formatLeadNotify(lead) {
  if (lead.type === "contact") {
    return [
      `✉️ Сообщение с сайта`,
      `Имя: ${lead.name || "—"}`,
      `Тел: ${lead.phone || "—"}`,
      `Email: ${lead.email || "—"}`,
      lead.comment ? `Текст: ${lead.comment}` : ""
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    `🔔 Заявка о поступлении`,
    `Товар: ${lead.productName || lead.productId} (${lead.productSku || "—"})`,
    `Имя: ${lead.name || "—"}`,
    `Тел: ${lead.phone || "—"}`,
    `Email: ${lead.email || "—"}`,
    lead.comment ? `Комментарий: ${lead.comment}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function statusLabel(order) {
  const map = {
    pending_payment: "ожидает оплату",
    assembly: "на сборке",
    shipped:
      order.deliveryMethod === "pickup"
        ? "готов к самовывозу"
        : order.deliveryMethod === "local"
          ? "в доставке по городу"
          : "передан в СДЭК / в пути",
    arrived:
      order.deliveryMethod === "pickup" || order.deliveryMethod === "local"
        ? "выдан / доставлен"
        : "прибыл в ПВЗ",
    cancelled: "отменён"
  };
  return map[order.status] || order.status || "обновление";
}

function formatCustomerStatus(order, { title, detail } = {}) {
  const items = (order.items || [])
    .map((i) => `• ${i.name}`)
    .slice(0, 5)
    .join("\n");
  return [
    title || `📦 Обновление по заказу ${order.id}`,
    `Статус: ${statusLabel(order)}`,
    order.cdek?.stage ? `Этап: ${order.cdek.stage}` : "",
    order.cdek?.trackNumber ? `Трек СДЭК: ${order.cdek.trackNumber}` : "",
    order.pvzAddress && (order.deliveryMethod || "cdek") === "cdek"
      ? `ПВЗ: ${order.pvzAddress}`
      : "",
    detail ? `Детали: ${detail}` : "",
    items ? `\n${items}` : "",
    "\nNorthern Magical Place"
  ]
    .filter(Boolean)
    .join("\n");
}

function notifyKey(order) {
  return [
    order.status || "",
    order.paymentStatus || "",
    order.cdek?.stage || "",
    order.cdek?.trackNumber || ""
  ].join("|");
}

async function notifyNewOrder(order) {
  return sendTelegram(formatOrderNotify(order));
}

async function notifyNewLead(lead) {
  return sendTelegram(formatLeadNotify(lead));
}

async function notifyCustomerOrderMove(order, { title, detail, force = false } = {}) {
  if (!order) return { ok: false, skipped: true };
  const chatId =
    order.customer?.telegramChatId ||
    clients.resolveChatId({
      orderId: order.id,
      phone: order.customer?.phone
    });
  if (!chatId) {
    return { ok: false, skipped: true, reason: "client not linked" };
  }
  const key = notifyKey(order);
  if (!force && order.telegramLastNotifyKey === key) {
    return { ok: false, skipped: true, reason: "duplicate" };
  }
  const result = await sendToChat(
    chatId,
    formatCustomerStatus(order, { title, detail })
  );
  if (result.ok && storeRef) {
    storeRef.updateOrder(order.id, {
      telegramLastNotifyKey: key,
      customer: {
        ...(order.customer || {}),
        telegramChatId: String(chatId)
      }
    });
  }
  return result;
}

function attachStore(store) {
  storeRef = store;
}

function parseStartPayload(text) {
  const raw = String(text || "").trim();
  const m = raw.match(/^\/start(?:\s+(.+))?$/i);
  if (!m) return null;
  const payload = String(m[1] || "").trim();
  if (!payload) return { type: "bare" };
  if (payload.startsWith("o_")) {
    return { type: "order", orderId: payload.slice(2) };
  }
  if (payload.startsWith("p_")) {
    return { type: "phone", phone: payload.slice(2) };
  }
  // fallback: treat as order id
  return { type: "order", orderId: payload };
}

async function handleBotMessage(message) {
  if (!message?.chat?.id) return;
  const chatId = message.chat.id;
  const text = message.text || "";
  const start = parseStartPayload(text);
  if (!start) {
    if (text.startsWith("/help") || text.startsWith("/status")) {
      await sendToChat(
        chatId,
        "Откройте личный кабинет на сайте и нажмите «Статус в Telegram» у заказа — так мы привяжем уведомления."
      );
    }
    return;
  }

  const from = message.from || {};
  let linkedOrders = [];

  if (start.type === "bare") {
    clients.upsertLink({
      chatId,
      username: from.username || "",
      firstName: from.first_name || ""
    });
    await sendToChat(
      chatId,
      "Здравствуйте! Чтобы получать статусы заказа, откройте личный кабинет на сайте Northern Magical Place и нажмите «Статус в Telegram»."
    );
    return;
  }

  if (start.type === "order" && storeRef) {
    const order = storeRef.getOrder(start.orderId);
    if (!order) {
      await sendToChat(chatId, `Заказ ${start.orderId} не найден. Проверьте номер в личном кабинете.`);
      return;
    }
    clients.upsertLink({
      chatId,
      phone: order.customer?.phone || "",
      orderId: order.id,
      username: from.username || "",
      firstName: from.first_name || ""
    });
    storeRef.updateOrder(order.id, {
      customer: {
        ...(order.customer || {}),
        telegramChatId: String(chatId)
      }
    });
    linkedOrders = [order.id];
    await sendToChat(
      chatId,
      [
        `✅ Готово! Будем присылать статусы по заказу ${order.id}.`,
        `Сейчас: ${statusLabel(order)}`,
        order.cdek?.stage ? `Этап: ${order.cdek.stage}` : ""
      ]
        .filter(Boolean)
        .join("\n")
    );
    return;
  }

  if (start.type === "phone" && storeRef) {
    const phone = start.phone;
    clients.upsertLink({
      chatId,
      phone,
      username: from.username || "",
      firstName: from.first_name || ""
    });
    const matched = storeRef
      .listOrders()
      .filter((o) => clients.normalizePhone(o.customer?.phone) === clients.normalizePhone(phone));
    matched.forEach((order) => {
      storeRef.updateOrder(order.id, {
        customer: {
          ...(order.customer || {}),
          telegramChatId: String(chatId)
        }
      });
      clients.upsertLink({ chatId, orderId: order.id, phone });
      linkedOrders.push(order.id);
    });
    await sendToChat(
      chatId,
      matched.length
        ? `✅ Привязали Telegram к ${matched.length} заказ(ам). Будем писать о перемещении.`
        : "✅ Telegram привязан. Когда появится заказ с этим телефоном — пришлём статус."
    );
    return;
  }

  void linkedOrders;
}

async function pollOnce() {
  if (!isBotReady() || polling) return;
  polling = true;
  try {
    const url = `https://api.telegram.org/bot${CONFIG.botToken}/getUpdates?timeout=20&offset=${pollOffset}&allowed_updates=${encodeURIComponent(
      JSON.stringify(["message"])
    )}`;
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!data.ok || !Array.isArray(data.result)) return;
    for (const update of data.result) {
      pollOffset = Math.max(pollOffset, (update.update_id || 0) + 1);
      if (update.message) {
        await handleBotMessage(update.message);
      }
    }
  } catch {
    /* ignore transient poll errors */
  } finally {
    polling = false;
  }
}

function startBotPolling() {
  if (!isBotReady() || pollTimer) return;
  resolveBotUsername().catch(() => {});
  const tick = async () => {
    await pollOnce();
    pollTimer = setTimeout(tick, 800);
  };
  tick();
  console.log("Telegram bot polling: on (client status links)");
}

module.exports = {
  sendTelegram,
  sendToChat,
  notifyNewOrder,
  notifyNewLead,
  notifyCustomerOrderMove,
  formatCustomerStatus,
  deepLinkForOrder,
  deepLinkForPhone,
  startBotPolling,
  attachStore,
  isConfigured,
  isBotReady,
  resolveBotUsername,
  statusLabel
};

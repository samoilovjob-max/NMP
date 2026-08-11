const fs = require("fs");
const path = require("path");

const CONFIG = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || "",
  chatId: process.env.TELEGRAM_CHAT_ID || ""
};

async function sendTelegram(text) {
  if (!CONFIG.botToken || !CONFIG.chatId) {
    return { ok: false, skipped: true, reason: "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set" };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${CONFIG.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CONFIG.chatId,
        text: String(text || "").slice(0, 3900),
        disable_web_page_preview: true
      })
    });
    const data = await res.json().catch(() => ({}));
    return { ok: Boolean(data.ok), status: res.status, data };
  } catch (error) {
    return { ok: false, error: error.message };
  }
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

async function notifyNewOrder(order) {
  return sendTelegram(formatOrderNotify(order));
}

async function notifyNewLead(lead) {
  return sendTelegram(formatLeadNotify(lead));
}

module.exports = {
  sendTelegram,
  notifyNewOrder,
  notifyNewLead,
  isConfigured: () => Boolean(CONFIG.botToken && CONFIG.chatId)
};

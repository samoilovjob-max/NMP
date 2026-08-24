const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const LINKS_FILE = path.join(DATA_DIR, "telegram-clients.json");

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(LINKS_FILE)) fs.writeFileSync(LINKS_FILE, "[]", "utf8");
}

function readLinks() {
  ensure();
  try {
    const data = JSON.parse(fs.readFileSync(LINKS_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeLinks(list) {
  ensure();
  fs.writeFileSync(LINKS_FILE, JSON.stringify(list.slice(0, 2000), null, 2), "utf8");
}

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  const withCountry =
    digits.startsWith("8") && digits.length === 11 ? `7${digits.slice(1)}` : digits;
  return withCountry.slice(-10);
}

function upsertLink({ chatId, phone = "", orderId = "", username = "", firstName = "" }) {
  const id = String(chatId || "").trim();
  if (!id) throw new Error("chatId required");
  const phoneKey = normalizePhone(phone);
  const orderKey = String(orderId || "").trim().toUpperCase();
  const links = readLinks();
  let row = links.find((l) => String(l.chatId) === id);
  if (!row) {
    row = { chatId: id, createdAt: new Date().toISOString() };
    links.unshift(row);
  }
  if (phoneKey) row.phone = phoneKey;
  if (orderKey) {
    row.orderIds = Array.from(new Set([...(row.orderIds || []), orderKey]));
  }
  if (username) row.username = username;
  if (firstName) row.firstName = firstName;
  row.updatedAt = new Date().toISOString();
  writeLinks(links);
  return row;
}

function findByChatId(chatId) {
  return readLinks().find((l) => String(l.chatId) === String(chatId)) || null;
}

function findByPhone(phone) {
  const key = normalizePhone(phone);
  if (!key) return null;
  return readLinks().find((l) => normalizePhone(l.phone) === key) || null;
}

function findByOrderId(orderId) {
  const key = String(orderId || "")
    .trim()
    .toUpperCase();
  if (!key) return null;
  return readLinks().find((l) => (l.orderIds || []).includes(key)) || null;
}

function resolveChatId({ orderId, phone, explicitChatId } = {}) {
  if (explicitChatId) return String(explicitChatId);
  const byOrder = orderId ? findByOrderId(orderId) : null;
  if (byOrder?.chatId) return String(byOrder.chatId);
  const byPhone = phone ? findByPhone(phone) : null;
  if (byPhone?.chatId) return String(byPhone.chatId);
  return "";
}

module.exports = {
  normalizePhone,
  upsertLink,
  findByChatId,
  findByPhone,
  findByOrderId,
  resolveChatId,
  readLinks
};

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const LEADS_FILE = path.join(DATA_DIR, "availability-leads.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LEADS_FILE)) fs.writeFileSync(LEADS_FILE, "[]", "utf8");

function readLeads() {
  try {
    return JSON.parse(fs.readFileSync(LEADS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeLeads(list) {
  fs.writeFileSync(LEADS_FILE, JSON.stringify(list.slice(0, 2000), null, 2), "utf8");
}

function listLeads() {
  return readLeads();
}

function addLead(input = {}) {
  const type = String(input.type || "availability").trim() || "availability";
  const name = String(input.name || "").trim();
  const phone = String(input.phone || "").trim();
  const email = String(input.email || "").trim();
  const productId = String(input.productId || "").trim();
  const productName = String(input.productName || "").trim();
  const productSku = String(input.productSku || "").trim();
  const comment = String(input.comment || "").trim();

  if (type === "contact") {
    if (!comment && !name) throw new Error("Напишите сообщение");
    if (!phone && !email) throw new Error("Укажите телефон или e-mail");
  } else {
    if (!productId) throw new Error("Не указан товар");
    if (!phone && !email) throw new Error("Укажите телефон или e-mail");
  }

  const lead = {
    id:
      (type === "contact" ? "MSG-" : "LEAD-") +
      Math.random().toString(36).slice(2, 7).toUpperCase() +
      Date.now().toString(36).slice(-4).toUpperCase(),
    createdAt: new Date().toISOString(),
    status: "new",
    type,
    name,
    phone,
    email,
    productId,
    productName,
    productSku,
    comment
  };

  const list = readLeads();
  list.unshift(lead);
  writeLeads(list);
  return lead;
}

function updateLead(id, patch = {}) {
  const list = readLeads();
  const index = list.findIndex((item) => item.id === String(id));
  if (index < 0) return null;
  list[index] = { ...list[index], ...patch, updatedAt: new Date().toISOString() };
  writeLeads(list);
  return list[index];
}

function deleteLead(id) {
  const list = readLeads();
  const next = list.filter((item) => item.id !== String(id));
  if (next.length === list.length) return false;
  writeLeads(next);
  return true;
}

function bulkUpdateLeads(ids = [], patch = {}) {
  const wanted = new Set((ids || []).map((id) => String(id)));
  const list = readLeads();
  let changed = 0;
  const next = list.map((item) => {
    if (!wanted.has(String(item.id))) return item;
    changed += 1;
    return { ...item, ...patch, updatedAt: new Date().toISOString() };
  });
  if (changed) writeLeads(next);
  return { changed, total: wanted.size };
}

function bulkDeleteLeads(ids = []) {
  const wanted = new Set((ids || []).map((id) => String(id)));
  const list = readLeads();
  const next = list.filter((item) => !wanted.has(String(item.id)));
  const deleted = list.length - next.length;
  if (deleted) writeLeads(next);
  return { deleted, total: wanted.size };
}

module.exports = {
  listLeads,
  addLead,
  updateLead,
  deleteLead,
  bulkUpdateLeads,
  bulkDeleteLeads
};

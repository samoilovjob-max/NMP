const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const ORDERS_FILE = path.join(DATA_DIR, "shop-orders.json");
const CDEK_MAP_FILE = path.join(DATA_DIR, "orders.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, "[]", "utf8");
if (!fs.existsSync(CDEK_MAP_FILE)) fs.writeFileSync(CDEK_MAP_FILE, "[]", "utf8");

function readJson(file, fallback = []) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function uid(prefix) {
  return (
    prefix +
    "-" +
    Math.random().toString(36).slice(2, 8).toUpperCase() +
    Date.now().toString(36).slice(-4).toUpperCase()
  );
}

function listOrders() {
  return readJson(ORDERS_FILE, []);
}

function saveOrders(orders) {
  writeJson(ORDERS_FILE, orders.slice(0, 1000));
}

function getOrder(id) {
  return listOrders().find((order) => order.id === id);
}

function createOrder(payload) {
  const orders = listOrders();
  const order = {
    id: uid("NMP"),
    createdAt: new Date().toISOString(),
    paidAt: null,
    shipByAt: null,
    status: "pending_payment",
    paymentStatus: "pending",
    paymentId: "",
    paymentUrl: "",
    adminNotes: "",
    cdek: {
      trackNumber: "",
      uuid: "",
      stage: "Ожидает оплату",
      history: [
        {
          at: new Date().toISOString(),
          title: "Заказ создан",
          detail: "Ожидает оплату"
        }
      ]
    },
    ...payload
  };
  orders.unshift(order);
  saveOrders(orders);
  return order;
}

function updateOrder(id, patch) {
  const orders = listOrders();
  const index = orders.findIndex((order) => order.id === id);
  if (index < 0) return null;
  orders[index] = { ...orders[index], ...patch, updatedAt: new Date().toISOString() };
  saveOrders(orders);
  return orders[index];
}

function deleteOrder(id) {
  const orders = listOrders();
  const index = orders.findIndex((order) => order.id === id);
  if (index < 0) return false;
  orders.splice(index, 1);
  saveOrders(orders);
  return true;
}

function rememberCdekMap(record) {
  const rows = readJson(CDEK_MAP_FILE, []);
  rows.unshift(record);
  writeJson(CDEK_MAP_FILE, rows.slice(0, 500));
}

function findCdekMap(query) {
  return readJson(CDEK_MAP_FILE, []).find(
    (row) => row.number === query || row.cdekNumber === query || row.uuid === query
  );
}

module.exports = {
  uid,
  listOrders,
  getOrder,
  createOrder,
  updateOrder,
  deleteOrder,
  rememberCdekMap,
  findCdekMap
};

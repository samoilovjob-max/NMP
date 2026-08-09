/** Единый каталог для серверной проверки цен и артикулов */
const PRODUCTS = [
  {
    id: "1",
    sku: "NMP-FP-01",
    slug: "flat-pack-ochag",
    name: "Flat-Pack Очаг — походная костровая система",
    price: 18900,
    image: "images/product-1.png"
  },
  {
    id: "2",
    sku: "NMP-HT-02",
    slug: "chasha-grill-hitech",
    name: "Чаша-гриль Hi-Tech — костровая чаша для дома",
    price: 21500,
    image: "images/product-2.png"
  },
  {
    id: "3",
    sku: "NMP-NW-03",
    slug: "northern-wild",
    name: "Northern Wild — костровой очаг",
    price: 19900,
    image: "images/product-3.jpg"
  },
  {
    id: "4",
    sku: "NMP-HX-04",
    slug: "hex-bowl-premium",
    name: "Hex Bowl Premium — костровая чаша",
    price: 24900,
    image: "images/product-4.png"
  }
];

function getProduct(id) {
  return PRODUCTS.find((item) => item.id === String(id));
}

function resolveOrderItems(rawItems = []) {
  const items = [];
  for (const line of rawItems) {
    const product = getProduct(line.productId || line.id);
    if (!product) {
      throw new Error(`Неизвестный товар: ${line.productId || line.id}`);
    }
    const qty = Math.max(1, Number(line.qty || line.amount || 1));
    items.push({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      price: product.price,
      qty,
      image: product.image,
      sum: product.price * qty
    });
  }
  if (!items.length) throw new Error("Корзина пуста");
  return items;
}

module.exports = { PRODUCTS, getProduct, resolveOrderItems };

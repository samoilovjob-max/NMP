/** Каталог для серверной проверки цен — источник данных: CMS (`server/data/cms.json`). */
const cms = require("./cms-store");

function mapProduct(p) {
  if (!p || p.active === false) return null;
  return {
    id: p.id,
    sku: p.sku,
    slug: p.slug,
    name: p.name,
    price: cms.effectivePrice(p),
    image: p.image
  };
}

module.exports = {
  get PRODUCTS() {
    return cms.listProducts({ activeOnly: true }).map(mapProduct).filter(Boolean);
  },
  getProduct(id) {
    return mapProduct(cms.getProduct(id));
  },
  resolveOrderItems: cms.resolveOrderItems
};

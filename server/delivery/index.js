/**
 * Реестр провайдеров доставки (ТК).
 *
 * Активно: СДЭК.
 * Зарезервировано (comingSoon): Деловые Линии, Яндекс Доставка, Ozon, X5.
 *
 * Checkout-способы pickup/local — не ТК, остаются отдельными deliveryMethod.
 */
const { createCdekProvider } = require("./providers/cdek");
const {
  createDelovyeLiniiProvider,
  createYandexDeliveryProvider,
  createOzonDeliveryProvider,
  createX5DeliveryProvider
} = require("./providers/stubs");

require("./types");

const providers = Object.freeze({
  cdek: createCdekProvider(),
  delovye_linii: createDelovyeLiniiProvider(),
  yandex_delivery: createYandexDeliveryProvider(),
  ozon_delivery: createOzonDeliveryProvider(),
  x5_delivery: createX5DeliveryProvider()
});

function list() {
  return Object.values(providers);
}

function listPublic() {
  return list().map((p) => p.info());
}

function enabled() {
  return list().filter((p) => p.enabled);
}

function get(id) {
  const key = String(id || "").trim();
  return providers[key] || null;
}

function defaultCarrierId() {
  const live = enabled();
  if (live.find((p) => p.id === "cdek")) return "cdek";
  return live[0]?.id || "cdek";
}

/**
 * Методы оформления на витрине (не путать с carrierId).
 * carrier-backed метод использует выбранный ТК для ПВЗ/расчёта.
 */
function checkoutMethods() {
  return [
    {
      id: "cdek",
      label: "Доставка СДЭК",
      type: "carrier",
      carrierId: "cdek",
      enabled: Boolean(providers.cdek?.enabled)
    },
    {
      id: "pickup",
      label: "Самовывоз со склада",
      type: "pickup",
      carrierId: null,
      enabled: true
    },
    {
      id: "local",
      label: "Адресная доставка по Петрозаводску",
      type: "local",
      carrierId: null,
      enabled: true
    }
  ];
}

module.exports = {
  providers,
  list,
  listPublic,
  enabled,
  get,
  defaultCarrierId,
  checkoutMethods
};

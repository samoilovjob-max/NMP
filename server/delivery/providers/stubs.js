/**
 * Заглушка будущего провайдера доставки.
 * Не включается, пока нет ключей и реализации API.
 */
function createStubProvider({
  id,
  label,
  description,
  envFlag,
  capabilities = ["points", "quote", "waybill", "track"]
}) {
  const enabled =
    String(process.env[envFlag] || "").toLowerCase() === "true" ||
    String(process.env[envFlag] || "") === "1";

  return {
    id,
    label,
    enabled: false, // принудительно выключено до реализации
    comingSoon: true,
    description,
    capabilities,
    envFlag,
    planned: true,
    info() {
      return {
        id: this.id,
        label: this.label,
        enabled: false,
        comingSoon: true,
        description: this.description,
        capabilities: this.capabilities
      };
    },
    async searchPoints() {
      const err = new Error(`${label}: провайдер ещё не подключён`);
      err.code = "PROVIDER_NOT_READY";
      throw err;
    },
    async calculate() {
      const err = new Error(`${label}: провайдер ещё не подключён`);
      err.code = "PROVIDER_NOT_READY";
      throw err;
    },
    async createWaybill() {
      const err = new Error(`${label}: провайдер ещё не подключён`);
      err.code = "PROVIDER_NOT_READY";
      throw err;
    },
    async track() {
      const err = new Error(`${label}: провайдер ещё не подключён`);
      err.code = "PROVIDER_NOT_READY";
      throw err;
    },
    mapStatus() {
      return null;
    },
    /** Для отладки: env-флаг зарезервирован, но stub всегда disabled */
    _envWouldEnable: enabled
  };
}

module.exports = {
  createDelovyeLiniiProvider: () =>
    createStubProvider({
      id: "delovye_linii",
      label: "Деловые Линии",
      description: "ТК Деловые Линии — терминалы и адресная доставка",
      envFlag: "DELIVERY_DELOVYE_LINII_ENABLED"
    }),
  createYandexDeliveryProvider: () =>
    createStubProvider({
      id: "yandex_delivery",
      label: "Яндекс Доставка",
      description: "Яндекс Доставка — ПВЗ и курьер",
      envFlag: "DELIVERY_YANDEX_ENABLED"
    }),
  createOzonDeliveryProvider: () =>
    createStubProvider({
      id: "ozon_delivery",
      label: "Ozon Доставка",
      description: "Пункты выдачи Ozon",
      envFlag: "DELIVERY_OZON_ENABLED"
    }),
  createX5DeliveryProvider: () =>
    createStubProvider({
      id: "x5_delivery",
      label: "X5 Доставка",
      description: "Пункты выдачи сети X5 (Пятёрочка / Перекрёсток и др.)",
      envFlag: "DELIVERY_X5_ENABLED"
    })
};

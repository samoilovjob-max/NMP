/**
 * Клиентский хелпер реестра ТК.
 * Сейчас на витрине используется только СДЭК; остальные провайдеры
 * приходят с API как comingSoon и не показываются в checkout.
 */
(() => {
  const apiBase = () => window.NMP_CONFIG?.apiBase || "";

  const loadProviders = async () => {
    try {
      const res = await fetch(`${apiBase()}/api/delivery/providers`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Не удалось загрузить службы доставки");
      window.NMP_DELIVERY = data;
      return data;
    } catch (err) {
      window.NMP_DELIVERY = {
        ok: false,
        defaultCarrierId: "cdek",
        providers: [
          {
            id: "cdek",
            label: "СДЭК",
            enabled: true,
            comingSoon: false
          }
        ],
        checkoutMethods: [
          { id: "cdek", label: "Доставка СДЭК", type: "carrier", carrierId: "cdek", enabled: true },
          { id: "pickup", label: "Самовывоз со склада", type: "pickup", carrierId: null, enabled: true },
          { id: "local", label: "Адресная доставка по Петрозаводску", type: "local", carrierId: null, enabled: true }
        ],
        error: err.message
      };
      return window.NMP_DELIVERY;
    }
  };

  const enabledCarriers = () =>
    (window.NMP_DELIVERY?.providers || []).filter((p) => p.enabled && !p.comingSoon);

  const comingSoonCarriers = () =>
    (window.NMP_DELIVERY?.providers || []).filter((p) => p.comingSoon || !p.enabled);

  window.NMP_loadDeliveryProviders = loadProviders;
  window.NMP_enabledCarriers = enabledCarriers;
  window.NMP_comingSoonCarriers = comingSoonCarriers;
})();

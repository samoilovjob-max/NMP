(() => {
  const CONSENT_KEY = "nmp_analytics_consent";
  const INFO_DISMISSED_KEY = "nmp_analytics_info_dismissed";
  const PURCHASE_TRACKED_PREFIX = "nmp_purchase_tracked_";

  let analyticsCfg = null;
  let started = false;
  let readyResolve;
  const ready = new Promise((resolve) => {
    readyResolve = resolve;
  });

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.async = true;
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`script ${src}`));
      document.head.appendChild(script);
    });
  }

  function hasConsent() {
    if (!analyticsCfg?.requireConsent) return true;
    try {
      return localStorage.getItem(CONSENT_KEY) === "1";
    } catch {
      return false;
    }
  }

  function saveConsent(value) {
    try {
      localStorage.setItem(CONSENT_KEY, value ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  function initYandexMetrica(counterId) {
    const id = String(counterId || "").replace(/\D/g, "");
    if (!id) return;

    window.dataLayer = window.dataLayer || [];

    const tagUrl = `https://mc.yandex.ru/metrika/tag.js?id=${id}`;

    (function (m, e, t, r, i, k, a) {
      m[i] =
        m[i] ||
        function () {
          (m[i].a = m[i].a || []).push(arguments);
        };
      m[i].l = 1 * new Date();
      for (let j = 0; j < document.scripts.length; j += 1) {
        if (document.scripts[j].src === r) return;
      }
      k = e.createElement(t);
      a = e.getElementsByTagName(t)[0];
      k.async = 1;
      k.src = r;
      a.parentNode.insertBefore(k, a);
    })(window, document, "script", tagUrl, "ym");

    window.ym(id, "init", {
      ssr: true,
      webvisor: true,
      clickmap: true,
      ecommerce: "dataLayer",
      referrer: document.referrer,
      url: location.href,
      accurateTrackBounce: true,
      trackLinks: true
    });

    const noscript = document.createElement("noscript");
    noscript.innerHTML = `<div><img src="https://mc.yandex.ru/watch/${id}" style="position:absolute;left:-9999px" alt="" /></div>`;
    document.body.appendChild(noscript);
  }

  function initGoogleAnalytics(measurementId) {
    const id = String(measurementId || "").trim();
    if (!id) return Promise.resolve();

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", id, { send_page_view: true });
    return loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
  }

  function startAnalytics(cfg) {
    if (started || !cfg?.enabled) return;
    started = true;
    if (cfg.yandexMetricaId) initYandexMetrica(cfg.yandexMetricaId);
    if (cfg.gaMeasurementId) {
      initGoogleAnalytics(cfg.gaMeasurementId).catch(() => {});
    }
    readyResolve(window.NMP_analytics);
  }

  function showConsentBanner(onAccept, onDecline) {
    document.getElementById("analyticsConsent")?.remove();
    document.getElementById("analyticsInfoNotice")?.remove();

    const banner = document.createElement("div");
    banner.id = "analyticsConsent";
    banner.className = "analytics-consent";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-live", "polite");
    banner.setAttribute("aria-label", "Согласие на cookies аналитики");
    banner.innerHTML = `
      <div class="analytics-consent-inner">
        <p>Мы используем cookies и сервисы аналитики (Яндекс.Метрика${analyticsCfg?.gaMeasurementId ? ", Google Analytics" : ""}), чтобы улучшать сайт. Подробнее — в <a href="privacy.html">политике конфиденциальности</a>.</p>
        <div class="analytics-consent-actions">
          <button type="button" class="btn btn-ghost" data-analytics-decline>Только необходимые</button>
          <button type="button" class="btn btn-primary" data-analytics-accept>Принять</button>
        </div>
      </div>`;

    document.body.appendChild(banner);
    banner.querySelector("[data-analytics-accept]")?.addEventListener("click", () => {
      banner.remove();
      onAccept();
    });
    banner.querySelector("[data-analytics-decline]")?.addEventListener("click", () => {
      banner.remove();
      onDecline();
    });
  }

  function showInfoNotice() {
    if (document.getElementById("analyticsInfoNotice")) return;
    try {
      if (sessionStorage.getItem(INFO_DISMISSED_KEY) === "1") return;
    } catch {
      /* ignore */
    }

    const notice = document.createElement("div");
    notice.id = "analyticsInfoNotice";
    notice.className = "analytics-info-notice";
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    notice.innerHTML = `
      <div class="analytics-info-inner">
        <p>Мы используем cookies и Яндекс.Метрику для статистики посещений. <a href="privacy.html#cookies">Подробнее</a> · <button type="button" class="footer-cookie-link" data-cookie-settings-inline>Настройки</button></p>
        <button type="button" class="analytics-info-close" aria-label="Закрыть уведомление">×</button>
      </div>`;

    document.body.appendChild(notice);
    notice.querySelector(".analytics-info-close")?.addEventListener("click", () => {
      try {
        sessionStorage.setItem(INFO_DISMISSED_KEY, "1");
      } catch {
        /* ignore */
      }
      notice.remove();
    });
    notice.querySelector("[data-cookie-settings-inline]")?.addEventListener("click", () => {
      window.NMP_analytics.openCookieSettings();
    });
  }

  function injectFooterCookieLink() {
    const footer = document.querySelector(".site-footer .footer-bottom, footer .footer-bottom");
    if (!footer || footer.querySelector("[data-cookie-settings]")) return;

    const link = document.createElement("button");
    link.type = "button";
    link.className = "footer-cookie-link";
    link.setAttribute("data-cookie-settings", "");
    link.textContent = "Cookies и аналитика";
    link.addEventListener("click", () => window.NMP_analytics.openCookieSettings());
    footer.appendChild(link);
  }

  function mapLineItems(items) {
    return (items || []).map((item) => ({
      id: String(item.productId || item.sku || item.id || ""),
      name: String(item.name || item.title || "Товар"),
      price: Number(item.price || 0),
      quantity: Math.max(1, Number(item.qty || item.quantity || 1)),
      brand: "Northern Magical Place"
    }));
  }

  function mapGaItems(items) {
    return mapLineItems(items).map((item) => ({
      item_id: item.id,
      item_name: item.name,
      price: item.price,
      quantity: item.quantity,
      item_brand: item.brand
    }));
  }

  function pushYandexEcommerce(event, payload) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ ecommerce: null });
    window.dataLayer.push({ ecommerce: { [event]: payload } });
  }

  window.NMP_analytics = {
    ready,
    isEnabled() {
      return Boolean(analyticsCfg?.enabled && started);
    },
    openCookieSettings() {
      if (!analyticsCfg?.enabled) return;
      showConsentBanner(
        () => {
          saveConsent(true);
          startAnalytics(analyticsCfg);
        },
        () => {
          saveConsent(false);
          if (!started) readyResolve(window.NMP_analytics);
        }
      );
    },
    trackViewItem(product) {
      if (!started || !product) return;
      const price = Number(product.price || 0);
      const items = mapGaItems([
        {
          productId: product.sku || product.id,
          name: product.name,
          price,
          qty: 1
        }
      ]);
      if (typeof window.gtag === "function") {
        window.gtag("event", "view_item", {
          currency: "RUB",
          value: price,
          items
        });
      }
      pushYandexEcommerce("detail", {
        products: mapLineItems([
          {
            productId: product.sku || product.id,
            name: product.name,
            price,
            qty: 1
          }
        ])
      });
    },
    trackBeginCheckout(orderLike) {
      if (!started || !orderLike) return;
      const items = orderLike.items || [];
      const value = Number(orderLike.total ?? orderLike.goodsTotal ?? 0);
      if (typeof window.gtag === "function") {
        window.gtag("event", "begin_checkout", {
          currency: "RUB",
          value,
          items: mapGaItems(items)
        });
      }
      pushYandexEcommerce("checkout", {
        actionField: { step: 1 },
        products: mapLineItems(items)
      });
    },
    trackPurchase(order) {
      if (!started || !order?.id) return;
      const trackKey = PURCHASE_TRACKED_PREFIX + order.id;
      try {
        if (sessionStorage.getItem(trackKey) === "1") return;
        sessionStorage.setItem(trackKey, "1");
      } catch {
        /* continue without dedupe */
      }
      const items = order.items || [];
      const value = Number(order.total || 0);
      if (typeof window.gtag === "function") {
        window.gtag("event", "purchase", {
          transaction_id: order.id,
          value,
          currency: "RUB",
          items: mapGaItems(items)
        });
      }
      pushYandexEcommerce("purchase", {
        actionField: {
          id: order.id,
          revenue: value
        },
        products: mapLineItems(items)
      });
    }
  };

  async function boot() {
    try {
      const base = window.NMP_CONFIG?.apiBase || "";
      const res = await fetch(`${base}/api/config/public`);
      if (!res.ok) throw new Error("config");
      const cfg = await res.json();
      analyticsCfg = cfg.analytics || {};
      if (!analyticsCfg.enabled) {
        readyResolve(window.NMP_analytics);
        return;
      }

      injectFooterCookieLink();

      if (!analyticsCfg.requireConsent) {
        startAnalytics(analyticsCfg);
        showInfoNotice();
        return;
      }

      if (hasConsent()) {
        startAnalytics(analyticsCfg);
        return;
      }

      showConsentBanner(
        () => {
          saveConsent(true);
          startAnalytics(analyticsCfg);
        },
        () => {
          saveConsent(false);
          readyResolve(window.NMP_analytics);
        }
      );
    } catch {
      readyResolve(window.NMP_analytics);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

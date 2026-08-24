(() => {
  const apiBase = () => window.NMP_CONFIG?.apiBase || "";

  const money = (value) =>
    typeof window.NMP_formatPrice === "function"
      ? window.NMP_formatPrice(value)
      : new Intl.NumberFormat("ru-RU").format(value) + " ₽";

  const stars = (n) => "★".repeat(Math.max(1, Math.min(5, Number(n) || 5)));

  const escAttr = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");

  const productHref = (p) =>
    typeof window.NMP_productHref === "function"
      ? window.NMP_productHref(p)
      : `product.html?id=${encodeURIComponent(p?.id || "")}`;

  const applyProducts = (products) => {
    if (!Array.isArray(products) || !products.length) return;
    window.NMP_PRODUCTS = products;
    window.NMP_getProduct = (id) => {
      const key = String(id || "");
      const slugKey =
        typeof window.NMP_normalizeSlug === "function"
          ? window.NMP_normalizeSlug(key)
          : key.replace(/_/g, "-");
      return (window.NMP_PRODUCTS || []).find(
        (item) =>
          item.id === key ||
          item.slug === key ||
          String(item.slug || "").replace(/_/g, "-") === slugKey
      );
    };
  };

  const renderProductCard = (p, { available, imageLoading, fetchPriority }) => {
    const href = productHref(p);
    const buyHref = `checkout.html?buy=${encodeURIComponent(p.id)}`;
    const name = String(p.name || "").trim() || "Модель";
    const priceLabel = !available
      ? ""
      : p.hasPromo
        ? `<span class="price"><s class="price-old">${money(p.basePrice)}</s> ${money(p.effectivePrice)}</span>`
        : `<span class="price">${money(p.effectivePrice || p.price)}</span>`;
    const badge =
      typeof window.NMP_storefrontBadge === "function"
        ? window.NMP_storefrontBadge(p, available)
        : available
          ? p.promoActive && p.promoLabel
            ? p.promoLabel
            : p.badge || "В наличии"
          : /наличи/i.test(String(p.badge || ""))
            ? "Скоро в продаже"
            : p.badge || "Скоро в продаже";
    const specs = Array.isArray(p.specs) ? p.specs.filter(Boolean).slice(0, 4) : [];
    const useCases = Array.isArray(p.useCases) ? p.useCases.filter(Boolean).slice(0, 3) : [];
    const subtitle = String(p.cardSubtitle || "").trim();
    const audience = String(p.audience || "").trim() || (useCases.length ? useCases.join(", ") : "");
    const highlight = String(p.highlight || "").trim();
    const packageIncludes = String(p.packageIncludes || "").trim();
    const shortFallback = String(p.short || "").trim();
    const facts = [];
    if (audience) {
      facts.push(
        `<div class="product-fact"><span class="product-fact-label">Для кого</span><p>${escAttr(audience)}</p></div>`
      );
    }
    if (highlight) {
      facts.push(
        `<div class="product-fact"><span class="product-fact-label">Главное</span><p>${escAttr(highlight)}</p></div>`
      );
    } else if (shortFallback) {
      facts.push(
        `<div class="product-fact"><span class="product-fact-label">О модели</span><div class="rich-text product-short">${shortFallback}</div></div>`
      );
    }
    if (specs.length) {
      facts.push(
        `<div class="product-fact"><span class="product-fact-label">Характеристики</span><ul class="product-benefits" aria-label="Характеристики">${specs
          .map((item) => `<li>${escAttr(item)}</li>`)
          .join("")}</ul></div>`
      );
    }
    if (packageIncludes) {
      facts.push(
        `<div class="product-fact"><span class="product-fact-label">В комплекте</span><p>${escAttr(packageIncludes)}</p></div>`
      );
    }
    const action = available
      ? `<div class="product-meta-actions">
              <a class="btn btn-primary" href="${buyHref}">Купить «${escAttr(name)}»</a>
              <a class="btn btn-ghost" href="${href}">Подробнее о модели</a>
            </div>`
      : `<div class="product-meta-actions">
              <button class="btn btn-primary" type="button" data-notify-product="${escAttr(
                p.id
              )}" data-notify-name="${escAttr(name)}">Узнать о поступлении</button>
            </div>`;
    const loadingAttr = imageLoading === "eager" ? 'loading="eager"' : 'loading="lazy"';
    const priorityAttr = fetchPriority ? ` fetchpriority="${fetchPriority}"` : "";
    return `
        <article class="product reveal visible ${available ? "" : "product-soon"}" id="product-${escAttr(p.id)}">
          <a class="product-media" href="${href}">
            <img src="${escAttr(p.image)}" alt="${escAttr(p.imageAlt || name)}" ${loadingAttr}${priorityAttr} />
          </a>
          <div class="product-body">
            ${badge ? `<div class="badge">${escAttr(badge)}</div>` : ""}
            <h3><a href="${href}">${escAttr(name)}</a></h3>
            ${subtitle ? `<p class="product-card-sub">${escAttr(subtitle)}</p>` : ""}
            ${
              available
                ? `<div class="product-price-row">${priceLabel}</div>`
                : `<p class="product-status-line">Скоро в продаже</p>`
            }
            ${facts.length ? `<div class="product-facts">${facts.join("")}</div>` : ""}
            <div class="product-meta">
              ${action}
            </div>
          </div>
        </article>`;
  };

  const renderCatalog = (products, site = {}) => {
    const root = document.getElementById("catalogProducts");
    if (!root) return;
    const title = document.querySelector("#catalog .section-head h2");
    const lead = document.querySelector("#catalog .section-head .lead");
    if (title && site.catalogTitle) title.textContent = site.catalogTitle;
    if (lead && site.catalogLead) lead.textContent = site.catalogLead;

    const list = Array.isArray(products) ? products : [];
    const available = list.filter((p) => p.availableForOrder !== false);
    const soon = list.filter((p) => p.availableForOrder === false);

    const parts = available.map((p, index) =>
      renderProductCard(p, {
        available: true,
        imageLoading: "lazy",
        fetchPriority: undefined
      })
    );

    if (soon.length) {
      parts.push(`
        <div class="catalog-soon-divider reveal visible">
          <h3>Скоро в продаже</h3>
          <p class="form-note">Модели для дачи, сада и загородного дома — оставьте заявку на оповещение</p>
        </div>`);
      soon.forEach((p) => {
        parts.push(
          renderProductCard(p, {
            available: false,
            imageLoading: "lazy"
          })
        );
      });
    }

    root.innerHTML = parts.join("");
  };

  const reviewsForSale = (reviews, products = []) => {
    const list = Array.isArray(products) ? products : [];
    if (!list.length) return reviews || [];
    const orderableIds = new Set(
      list.filter((p) => p.availableForOrder !== false).map((p) => String(p.id))
    );
    return (reviews || []).filter((review) => {
      const pid = String(review.productId || "").trim();
      if (!pid) return true;
      return orderableIds.has(pid);
    });
  };

  const renderReviews = (reviews, site = {}, products = []) => {
    const section = document.getElementById("reviews");
    const root = document.getElementById("reviewsGrid");
    if (!root) return;
    const title = document.querySelector("#reviews .section-head h2");
    const lead = document.querySelector("#reviews .section-head .lead");
    if (title && site.reviewsTitle) title.textContent = site.reviewsTitle;
    if (lead && site.reviewsLead) lead.textContent = site.reviewsLead;
    reviews = reviewsForSale(reviews, products);
    if (!reviews.length) {
      if (section) section.hidden = true;
      return;
    }
    if (section) section.hidden = false;
    root.innerHTML = reviews
      .map((r) => {
        const media = r.video
          ? `<div class="review-media"><video src="${escAttr(r.video)}" controls playsinline preload="metadata"></video></div>`
          : "";
        return `
      <article class="review reveal visible ${r.video ? "has-media" : ""}">
        ${media}
        <div class="stars" aria-label="${r.rating || 5} из 5">${stars(r.rating)}</div>
        <p>«${String(r.text || "").replace(/^«|»$/g, "")}»</p>
        <footer>
          <strong>${r.author || ""}</strong>
          <span>${r.meta || ""}</span>
        </footer>
      </article>`;
      })
      .join("");
  };

  const renderNews = (news, site = {}) => {
    const section = document.getElementById("news");
    const root = document.getElementById("newsGrid");
    if (!section || !root) return;
    const title = section.querySelector(".section-head h2");
    const lead = section.querySelector(".section-head .lead");
    if (title && site.newsTitle) title.textContent = site.newsTitle;
    if (lead && site.newsLead) lead.textContent = site.newsLead;
    if (!news.length) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    root.innerHTML = news
      .map((n) => {
        const date = n.publishedAt
          ? new Date(n.publishedAt).toLocaleDateString("ru-RU")
          : "";
        const linked = n.productId ? window.NMP_getProduct?.(n.productId) : null;
        const available = !n.productId || (linked ? linked.availableForOrder !== false : true);
        const orderHref = n.productId
          ? `checkout.html?buy=${encodeURIComponent(n.productId)}`
          : "/#catalog";
        const moreHref = n.productId
          ? productHref(linked || { id: n.productId })
          : "/#catalog";
        const primary = available
          ? `<a class="btn btn-primary" href="${orderHref}">Заказать</a>`
          : `<button class="btn btn-primary" type="button" data-notify-product="${escAttr(
              n.productId
            )}" data-notify-name="${escAttr(linked?.name || n.title || "")}">Сообщить о поступлении</button>`;
        return `
        <article class="news-card reveal visible">
          ${n.image ? `<img src="${n.image}" alt="${escAttr(n.title || "Новость Northern Magical Place")}" loading="lazy" />` : ""}
          <div>
            ${date ? `<p class="form-note">${date}</p>` : ""}
            <h3>${n.title || ""}</h3>
            <div class="rich-text">${n.excerpt || n.body || ""}</div>
            <div class="news-actions">
              ${primary}
              <a class="btn btn-ghost" href="${moreHref}">Подробнее</a>
            </div>
          </div>
        </article>`;
      })
      .join("");
  };

  const renderPromos = (promotions) => {
    const root = document.getElementById("promoStrip");
    if (!root) return;
    // Временно скрываем полосу акций под героем — слишком навязчиво на старте продаж.
    root.hidden = true;
    root.innerHTML = "";
    return;
  };

  const mediaUrl = (item, fallback) => {
    if (item && typeof item === "object") return item.url || fallback;
    return item || fallback;
  };

  const toPublicUrl = (url) => {
    const raw = String(url || "").trim();
    if (!raw || /^(https?:|data:|blob:)/i.test(raw)) return raw;
    return raw.startsWith("/") ? raw : `/${raw.replace(/^\.\//, "")}`;
  };

  const toPublicSrcset = (srcset) =>
    String(srcset || "")
      .split(",")
      .map((part) => {
        const trimmed = part.trim();
        if (!trimmed) return "";
        const bits = trimmed.split(/\s+/);
        const u = toPublicUrl(bits.shift());
        return [u, ...bits].join(" ");
      })
      .filter(Boolean)
      .join(", ");

  const escHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const applyMedia = (site = {}) => {
    const media = site.media || {};
    const hero = media.hero;
    const heroUrl = toPublicUrl(mediaUrl(hero, ""));
    if (heroUrl) {
      document.documentElement.style.setProperty("--hero-image", `url("${heroUrl}")`);
      const img = document.querySelector(".hero-bg img, [data-cms-media='hero']");
      if (img) {
        img.src = heroUrl;
        if (hero?.srcset) img.setAttribute("srcset", toPublicSrcset(hero.srcset));
        else img.removeAttribute("srcset");
      }
    }
    const pageHero = toPublicUrl(mediaUrl(media.pageHero, ""));
    if (pageHero) {
      document.documentElement.style.setProperty("--page-hero-image", `url("${pageHero}")`);
    }
    const catalogBg = toPublicUrl(mediaUrl(media.catalogBg, ""));
    if (catalogBg) {
      document.documentElement.style.setProperty("--catalog-bg-image", `url("${catalogBg}")`);
    }
    const contactBg = toPublicUrl(mediaUrl(media.contactBg, ""));
    if (contactBg) {
      document.documentElement.style.setProperty("--contact-bg-image", `url("${contactBg}")`);
    }
    const map = {
      about: media.about,
      lifeRiver: media.lifeRiver,
      lifeHouse: media.lifeHouse,
      lifeLake: media.lifeLake,
      lifeCamp: media.lifeCamp,
      logo: media.logo
    };
    Object.entries(map).forEach(([slot, item]) => {
      const url = toPublicUrl(mediaUrl(item, ""));
      if (!url) return;
      document.querySelectorAll(`[data-cms-media="${slot}"]`).forEach((el) => {
        if (el.tagName === "IMG") {
          el.src = url;
          if (item?.srcset) el.setAttribute("srcset", toPublicSrcset(item.srcset));
          else el.removeAttribute("srcset");
        }
      });
    });
    const logoUrl = toPublicUrl(mediaUrl(media.logo, ""));
    if (logoUrl) {
      document.querySelectorAll(".brand img, .footer-logo, .footer-brand img").forEach((el) => {
        el.src = logoUrl;
      });
    }
    if (site.aboutTitle) {
      const aboutH2 = document.querySelector("#about h2, .about-text h2");
      if (aboutH2) aboutH2.textContent = site.aboutTitle;
    }
    if (site.aboutText) {
      const wrap = document.querySelector(".about-text");
      if (wrap) {
        const h2 = wrap.querySelector("h2");
        const paras = String(site.aboutText)
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter(Boolean);
        wrap.innerHTML = `${h2 ? h2.outerHTML : ""}` + paras.map((p) => `<p>${escHtml(p)}</p>`).join("");
      }
    }
    if (site.featuresTitle) {
      const el = document.querySelector("#features .section-head h2, #features .section-title");
      if (el) el.textContent = site.featuresTitle;
    }
    if (site.featuresLead) {
      const el = document.querySelector("#features .section-head .lead, #features .section-title + .lead");
      if (el) el.textContent = site.featuresLead;
    }
    if (site.lifestyleTitle) {
      const el = document.querySelector("#lifestyle .section-head h2");
      if (el) el.textContent = site.lifestyleTitle;
    }
    if (site.lifestyleLead) {
      const el = document.querySelector("#lifestyle .section-head .lead");
      if (el) el.textContent = site.lifestyleLead;
    }
    if (site.contactTitle) {
      const el = document.querySelector("#contact h2");
      if (el) el.textContent = site.contactTitle;
    }
    if (site.contactLead) {
      const el = document.querySelector("#contact .lead");
      if (el) el.textContent = site.contactLead;
    }
  };

  const applyHero = (site = {}, products = []) => {
    applyMedia(site);
    const h1 = document.querySelector(".hero-copy h1");
    const lead = document.querySelector(".hero-copy .lead");
    if (h1 && site.heroTitle) h1.textContent = site.heroTitle;
    if (lead && site.heroLead) lead.textContent = site.heroLead;
    const orderBtn = document.querySelector(".hero-actions a.btn-ghost");
    const featured =
      products.find((p) => p.slug === "severnyy-kochevnik" || String(p.id) === "1") || products[0];
    if (orderBtn && featured && featured.availableForOrder === false) {
      orderBtn.textContent = "Узнать о поступлении";
      orderBtn.setAttribute("href", productHref(featured));
    }
  };

  const applyContacts = (contacts = {}) => {
    if (!contacts || !Object.keys(contacts).length) return;
    if (window.NMP_CONFIG) {
      window.NMP_CONFIG.contacts = { ...(window.NMP_CONFIG.contacts || {}), ...contacts };
    }
    const maxLink = document.querySelector(".messenger-max, a[aria-label='Написать в MAX']");
    if (maxLink) {
      const card = contacts.maxCard || "images/max-ss.webp";
      maxLink.setAttribute("href", "#max-card");
      maxLink.setAttribute("data-max-card", card);
    }
    const ig = document.querySelector(".messenger-instagram");
    if (ig && contacts.instagram) {
      ig.setAttribute("href", contacts.instagram);
      ig.hidden = false;
    } else if (ig && contacts.instagram === "") {
      ig.hidden = true;
    }
    const igText = document.querySelector(".contact-instagram-text");
    if (igText && contacts.instagram) {
      igText.setAttribute("href", contacts.instagram);
      const handle = String(contacts.instagram).replace(/\/+$/, "").split("/").pop();
      if (handle) igText.textContent = "@" + handle;
      igText.closest("div")?.removeAttribute("hidden");
    }
    const tg = document.querySelector('.messenger-links a[title="Telegram"]');
    if (tg && contacts.telegram) tg.setAttribute("href", contacts.telegram);
    const wa = document.querySelector('.messenger-links a[title="WhatsApp"]');
    if (wa && contacts.whatsapp) wa.setAttribute("href", contacts.whatsapp);
  };

  const openMaxCard = (src) => {
    let overlay = document.getElementById("maxCardOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "maxCardOverlay";
      overlay.className = "max-card-overlay";
      overlay.innerHTML = `
        <div class="max-card-dialog" role="dialog" aria-modal="true" aria-label="MAX Сергей Самойлов">
          <button type="button" class="max-card-close" aria-label="Закрыть">×</button>
          <img src="${src}" alt="QR-код MAX — Сергей Самойлов" />
          <p>Отсканируйте код в приложении MAX, чтобы написать Сергею Самойлову</p>
        </div>`;
      document.body.appendChild(overlay);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay || e.target.classList.contains("max-card-close")) {
          overlay.hidden = true;
        }
      });
    } else {
      const img = overlay.querySelector("img");
      if (img) {
        img.src = src;
        img.alt = "QR-код MAX — Сергей Самойлов";
      }
      overlay.hidden = false;
      return;
    }
    overlay.hidden = false;
  };

  const boot = async () => {
    try {
      const res = await fetch(apiBase() + "/api/cms");
      if (!res.ok) throw new Error("CMS unavailable");
      const data = await res.json();
      applyProducts(data.products || []);
      applyHero(data.site || {}, data.products || []);
      applyContacts(data.site?.contacts || {});
      renderCatalog(data.products || [], data.site || {});
      renderReviews(data.reviews || [], data.site || {}, data.products || []);
      renderNews(data.news || [], data.site || {});
      renderPromos(data.promotions || []);
      window.NMP_CMS = data;
      return data;
    } catch (error) {
      console.warn("CMS fallback to local products.js", error);
      if (window.NMP_PRODUCTS?.length) {
        renderCatalog(window.NMP_PRODUCTS, {});
      }
      return null;
    }
  };

  window.NMP_cmsReady = new Promise((resolve) => {
    const start = () => {
      boot().then(resolve);
    };
    if (document.querySelector(".hero-bg img") && document.readyState !== "complete") {
      window.addEventListener("load", start, { once: true });
    } else {
      start();
    }
  });

  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-max-card], .messenger-max");
    if (!link) return;
    event.preventDefault();
    openMaxCard(link.getAttribute("data-max-card") || window.NMP_CONFIG?.contacts?.maxCard || "images/max-ss.webp");
  });
})();

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
    window.NMP_getProduct = (id) =>
      (window.NMP_PRODUCTS || []).find(
        (item) => item.id === String(id) || item.slug === String(id)
      );
  };

  const renderProductCard = (p, { available, imageLoading, fetchPriority }) => {
    const href = productHref(p);
    const buyHref = `checkout.html?buy=${encodeURIComponent(p.id)}`;
    const priceLabel = !available
      ? Number(p.price || p.basePrice || p.effectivePrice) > 0
        ? `<span class="price">от ${money(p.price || p.basePrice || p.effectivePrice)}</span>`
        : `<span class="price price-soon">Цена по запросу</span>`
      : p.hasPromo
        ? `<span class="price"><s class="price-old">${money(p.basePrice)}</s> ${money(p.effectivePrice)}</span>`
        : `<span class="price">${money(p.effectivePrice || p.price)}</span>`;
    const badge = available && p.promoActive && p.promoLabel ? p.promoLabel : p.badge;
    const specs = Array.isArray(p.specs) ? p.specs.filter(Boolean).slice(0, 4) : [];
    const useCases = Array.isArray(p.useCases) ? p.useCases.filter(Boolean).slice(0, 3) : [];
    const benefits =
      specs.length || useCases.length
        ? `<div class="product-value">
            ${
              specs.length
                ? `<ul class="product-benefits" aria-label="Преимущества">
                    ${specs.map((item) => `<li>${item}</li>`).join("")}
                  </ul>`
                : ""
            }
            ${
              useCases.length
                ? `<p class="product-usecases-line"><span>Где применять:</span> ${useCases.join(" · ")}</p>`
                : ""
            }
          </div>`
        : "";
    const action = available
      ? `<div class="product-meta-actions">
              <a class="btn btn-primary" href="${buyHref}">Купить</a>
              <button class="btn btn-ghost" type="button" data-add-cart="${escAttr(p.id)}">В корзину</button>
              <a class="btn btn-ghost" href="${href}">Подробнее</a>
            </div>`
      : `<button class="btn btn-primary" type="button" data-notify-product="${escAttr(
          p.id
        )}" data-notify-name="${escAttr(p.name)}">Сообщить о поступлении</button>
            <a class="btn btn-ghost" href="${href}">Подробнее</a>`;
    const loadingAttr = imageLoading === "eager" ? 'loading="eager"' : 'loading="lazy"';
    const priorityAttr = fetchPriority ? ` fetchpriority="${fetchPriority}"` : "";
    return `
        <article class="product reveal visible ${available ? "" : "product-soon"}" id="product-${p.id}">
          <a class="product-media" href="${href}">
            <img src="${p.image}" alt="${p.imageAlt || p.name}" ${loadingAttr}${priorityAttr} />
          </a>
          <div class="product-body">
            ${badge ? `<div class="badge">${badge}</div>` : ""}
            <h3><a href="${href}">${p.name}</a></h3>
            <p class="sku-label">Артикул ${p.sku || ""}</p>
            <div class="product-price-row">${priceLabel}</div>
            <div class="product-meta">
              ${action}
            </div>
            <div class="rich-text product-short">${p.short || ""}</div>
            ${benefits}
            ${
              available
                ? ""
                : `<p class="form-note product-soon-note">Пока в подготовке — можно оставить заявку на оповещение</p>`
            }
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
        imageLoading: index < 2 ? "eager" : "lazy",
        fetchPriority: index < 2 ? "high" : undefined
      })
    );

    if (soon.length) {
      parts.push(`
        <div class="catalog-soon-divider reveal visible">
          <h3>Скоро в продаже</h3>
          <p class="form-note">Модели в подготовке — оставьте заявку</p>
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
    const availableIds = new Set(
      list.filter((p) => p.availableForOrder !== false).map((p) => String(p.id))
    );
    const unavailableNames = list
      .filter((p) => p.availableForOrder === false)
      .map((p) => String(p.name || "").trim().toLowerCase())
      .filter(Boolean);
    return (reviews || []).filter((review) => {
      const pid = String(review.productId || "").trim();
      if (pid) return availableIds.has(pid);
      const meta = String(review.meta || "").toLowerCase();
      if (!meta || !unavailableNames.length) return true;
      return !unavailableNames.some((name) => meta.includes(name));
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
          : "index.html#catalog";
        const moreHref = n.productId
          ? productHref(linked || { id: n.productId })
          : "index.html#catalog";
        const primary = available
          ? `<a class="btn btn-primary" href="${orderHref}">Заказать</a>`
          : `<button class="btn btn-primary" type="button" data-notify-product="${escAttr(
              n.productId
            )}" data-notify-name="${escAttr(linked?.name || n.title || "")}">Сообщить о поступлении</button>`;
        return `
        <article class="news-card reveal visible">
          ${n.image ? `<img src="${n.image}" alt="" loading="lazy" />` : ""}
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

  const applyHero = (site = {}) => {
    const h1 = document.querySelector(".hero-copy h1");
    const lead = document.querySelector(".hero-copy .lead");
    if (h1 && site.heroTitle) h1.textContent = site.heroTitle;
    if (lead && site.heroLead) lead.textContent = site.heroLead;
  };

  const applyContacts = (contacts = {}) => {
    if (!contacts || !Object.keys(contacts).length) return;
    if (window.NMP_CONFIG) {
      window.NMP_CONFIG.contacts = { ...(window.NMP_CONFIG.contacts || {}), ...contacts };
    }
    const maxLink = document.querySelector(".messenger-max, a[aria-label='Написать в MAX']");
    if (maxLink) {
      const card = contacts.maxCard || "images/MAX_SS.webp";
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
      overlay.querySelector("img").src = src;
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
      applyHero(data.site || {});
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

  window.NMP_cmsReady = boot();

  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-max-card], .messenger-max");
    if (!link) return;
    event.preventDefault();
    openMaxCard(link.getAttribute("data-max-card") || window.NMP_CONFIG?.contacts?.maxCard || "images/MAX_SS.webp");
  });
})();

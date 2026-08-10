(() => {
  const apiBase = () => window.NMP_CONFIG?.apiBase || "";

  const money = (value) =>
    typeof window.NMP_formatPrice === "function"
      ? window.NMP_formatPrice(value)
      : new Intl.NumberFormat("ru-RU").format(value) + " ₽";

  const stars = (n) => "★".repeat(Math.max(1, Math.min(5, Number(n) || 5)));

  const applyProducts = (products) => {
    if (!Array.isArray(products) || !products.length) return;
    window.NMP_PRODUCTS = products;
  };

  const renderCatalog = (products, site = {}) => {
    const root = document.getElementById("catalogProducts");
    if (!root) return;
    const title = document.querySelector("#catalog .section-head h2");
    const lead = document.querySelector("#catalog .section-head .lead");
    if (title && site.catalogTitle) title.textContent = site.catalogTitle;
    if (lead && site.catalogLead) lead.textContent = site.catalogLead;

    root.innerHTML = products
      .map((p) => {
        const priceLabel = p.hasPromo
          ? `<span class="price"><s class="price-old">${money(p.basePrice)}</s> ${money(p.effectivePrice)}</span>`
          : `<span class="price">от ${money(p.effectivePrice || p.price)}</span>`;
        const badge = p.promoActive && p.promoLabel ? p.promoLabel : p.badge;
        return `
        <article class="product reveal visible" id="product-${p.id}">
          <a class="product-media" href="product.html?id=${encodeURIComponent(p.id)}">
            <img src="${p.image}" alt="${p.imageAlt || p.name}" />
          </a>
          <div class="product-body">
            ${badge ? `<div class="badge">${badge}</div>` : ""}
            <h3><a href="product.html?id=${encodeURIComponent(p.id)}">${p.name}</a></h3>
            <p class="sku-label">Артикул ${p.sku || ""}</p>
            <p>${p.short || ""}</p>
            <div class="product-meta">
              ${priceLabel}
              <a class="btn btn-primary" href="product.html?id=${encodeURIComponent(p.id)}">Подробнее</a>
            </div>
          </div>
        </article>`;
      })
      .join("");
  };

  const renderReviews = (reviews, site = {}) => {
    const root = document.getElementById("reviewsGrid");
    if (!root) return;
    const title = document.querySelector("#reviews .section-head h2");
    const lead = document.querySelector("#reviews .section-head .lead");
    if (title && site.reviewsTitle) title.textContent = site.reviewsTitle;
    if (lead && site.reviewsLead) lead.textContent = site.reviewsLead;
    if (!reviews.length) return;
    root.innerHTML = reviews
      .map(
        (r) => `
      <article class="review reveal visible">
        <div class="stars" aria-label="${r.rating || 5} из 5">${stars(r.rating)}</div>
        <p>«${String(r.text || "").replace(/^«|»$/g, "")}»</p>
        <footer>
          <strong>${r.author || ""}</strong>
          <span>${r.meta || ""}</span>
        </footer>
      </article>`
      )
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
        const orderHref = n.productId
          ? `checkout.html?buy=${encodeURIComponent(n.productId)}`
          : "index.html#catalog";
        const moreHref = n.productId
          ? `product.html?id=${encodeURIComponent(n.productId)}`
          : "index.html#catalog";
        return `
        <article class="news-card reveal visible">
          ${n.image ? `<img src="${n.image}" alt="" />` : ""}
          <div>
            ${date ? `<p class="form-note">${date}</p>` : ""}
            <h3>${n.title || ""}</h3>
            <p>${n.excerpt || n.body || ""}</p>
            <div class="news-actions">
              <a class="btn btn-primary" href="${orderHref}">Заказать</a>
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
    if (!promotions.length) {
      root.hidden = true;
      root.innerHTML = "";
      return;
    }
    root.hidden = false;
    root.innerHTML = `
      <div class="container promo-strip-inner">
        ${promotions
          .map((p) => {
            const link = p.productId ? `product.html?id=${encodeURIComponent(p.productId)}` : "#catalog";
            return `
            <a class="promo-card" href="${link}">
              ${p.badge ? `<span class="badge">${p.badge}</span>` : ""}
              <strong>${p.title || "Спецпредложение"}</strong>
              <span>${p.text || ""}</span>
            </a>`;
          })
          .join("")}
      </div>`;
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
      const card = contacts.maxCard || "images/MAX_SS.jpg";
      maxLink.setAttribute("href", "#max-card");
      maxLink.setAttribute("data-max-card", card);
    }
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
      renderReviews(data.reviews || [], data.site || {});
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
    openMaxCard(link.getAttribute("data-max-card") || window.NMP_CONFIG?.contacts?.maxCard || "images/MAX_SS.jpg");
  });
})();

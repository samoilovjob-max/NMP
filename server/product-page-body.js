const {
  stripHtml,
  formatRub,
  stars,
  reviewCountLabel,
  productPath,
  storefrontBadge,
  productPitchChips,
  productPitchText
} = require("./product-rich");

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function productTitles(product) {
  const titleName = String(product.cardTitle || product.name || "").trim();
  let titleSub = String(product.cardSubtitle || "").trim();
  if (!titleSub && product.h1 && product.h1 !== titleName) {
    const h1 = String(product.h1).trim();
    if (h1.startsWith(titleName) && h1.includes("—")) {
      titleSub = h1.slice(titleName.length).replace(/^[\s—–-]+/, "").trim();
    } else if (h1 !== titleName) {
      titleSub = h1;
    }
  }
  return { titleName, titleSub };
}

function priceBlock(product, available) {
  const price = Number(product.price || product.effectivePrice || 0);
  if (available) {
    if (product.hasPromo && product.basePrice) {
      return `<p class="price-lg"><s class="price-old">${esc(formatRub(product.basePrice))}</s> ${esc(
        formatRub(price)
      )}</p>`;
    }
    return `<p class="price-lg">${esc(formatRub(price))}</p>`;
  }
  if (price > 0) return `<p class="price-lg">от ${esc(formatRub(price))}</p>`;
  return `<p class="price-lg price-soon">Цена по запросу</p>`;
}

function ratingHtml(reviews, pagePath, available) {
  if (!available || !Array.isArray(reviews) || !reviews.length) return "";
  const ratings = reviews.map((r) => Number(r.rating || 5)).filter((n) => n > 0);
  const avg = ratings.reduce((sum, n) => sum + n, 0) / Math.max(1, ratings.length);
  const avgLabel = avg.toFixed(1).replace(".", ",");
  return `<a class="product-rating product-rating-link product-rating-inline product-rating-highlight" href="${esc(
    pagePath
  )}#product-reviews" aria-label="Читать отзывы покупателей">
      <span class="stars" aria-hidden="true">${stars(avg)}</span>
      <span>${esc(avgLabel)} · ${esc(reviewCountLabel(reviews.length))}</span>
    </a>`;
}

function reviewsPanel(reviews, reviewAvg) {
  if (!reviews.length) return "";
  return `<section class="product-panel product-reviews-panel is-orderable" id="product-reviews" aria-label="Отзывы покупателей">
      <div class="product-panel-head">
        <h2>Отзывы покупателей</h2>
        <p class="product-panel-meta">${esc(reviewAvg.toFixed(1).replace(".", ","))} · ${esc(
    reviewCountLabel(reviews.length)
  )}</p>
      </div>
      <div class="reviews-grid product-reviews-grid">
        ${reviews
          .slice(0, 5)
          .map((review) => {
            const rating = Number(review.rating || 5);
            const body = stripHtml(review.text || review.body || "").replace(/^«|»$/g, "");
            const author = String(review.author || review.name || "Покупатель").trim();
            const meta = String(review.meta || "").trim();
            return `<article class="review review-compact">
              <div class="stars" aria-label="${rating} из 5">${stars(rating)}</div>
              <p>«${esc(body)}»</p>
              <footer>
                <strong>${esc(author)}</strong>
                ${meta ? `<span>${esc(meta)}</span>` : ""}
              </footer>
            </article>`;
          })
          .join("")}
      </div>
    </section>`;
}

/**
 * Unified product card layout for all /product/:slug pages (SSR + no-JS fallback).
 */
function buildProductPageBody(product, rich) {
  const available = product.availableForOrder !== false;
  const specs = Array.isArray(product.specs) ? product.specs : [];
  const useCases = Array.isArray(product.useCases) ? product.useCases : [];
  const faq = Array.isArray(product.faq) ? product.faq : [];
  const gallery = Array.isArray(product.gallery) ? product.gallery : [];
  const galleryAlts = Array.isArray(product.galleryAlts) ? product.galleryAlts : [];
  const image = product.image || "";
  const galleryItems = image
    ? [image, ...gallery.filter((src) => src && src !== image)]
    : gallery;
  const matchedReviews = Array.isArray(rich.matchedReviews) ? rich.matchedReviews : [];
  const reviewAvg =
    matchedReviews.length > 0
      ? matchedReviews.reduce((sum, r) => sum + Number(r.rating || 5), 0) / matchedReviews.length
      : 0;

  const pagePath = rich.canonical
    ? new URL(rich.canonical).pathname
    : productPath(product.slug || product.id);
  const sectionHref = (id) => `${pagePath}#${id}`;

  const { titleName, titleSub } = productTitles(product);
  const badgeLabel = storefrontBadge(product, available);
  const pitchChips = productPitchChips(product);
  const shortLead = productPitchText(product, available);

  const serviceNotes = available
    ? [
        "Оплата через ЮKassa",
        "Сборка 1–2 дня · отгрузка до 48 ч",
        "СДЭК по России · Петрозаводск",
        "Гарантия 90 дней · <a href=\"usage.html\">эксплуатация</a>"
      ]
    : [
        String(product.availabilityNote || "").trim() ||
          "Модель готовится к продаже — оставьте заявку на оповещение.",
        "СДЭК по России · Петрозаводск",
        "Оплата через ЮKassa после запуска продаж",
        "<a href=\"/kostrovye-chashi.html\">Другие модели в каталоге</a>"
      ];

  const jumpSections = [
    product.description && { id: "product-desc", label: "Описание" },
    (specs.length || useCases.length) && { id: "product-specs", label: "Характеристики" },
    matchedReviews.length && { id: "product-reviews", label: "Отзывы" },
    faq.length && { id: "product-faq", label: "Вопросы" }
  ].filter(Boolean);

  return `
    <nav class="product-breadcrumbs" aria-label="Хлебные крошки">
      <a href="/">Главная</a>
      <span aria-hidden="true">/</span>
      <a href="/kostrovye-chashi.html">Костровые чаши</a>
      <span aria-hidden="true">/</span>
      <span>${esc(titleName)}</span>
    </nav>
    <div class="product-hero">
      <div class="product-gallery">
        <div class="product-stage">
          <img id="mainImage" src="${esc(image)}" alt="${esc(product.imageAlt || product.name)}" />
        </div>
        ${
          galleryItems.length > 1
            ? `<div class="thumbs">${galleryItems
                .map(
                  (src, index) =>
                    `<button type="button" class="thumb ${index === 0 ? "active" : ""}" data-src="${esc(
                      src
                    )}" data-alt="${esc(galleryAlts[index] || product.imageAlt || product.name)}"><img src="${esc(
                      src
                    )}" alt="${esc(galleryAlts[index] || product.imageAlt || product.name)}" loading="lazy" /></button>`
                )
                .join("")}</div>`
            : ""
        }
      </div>
      <div class="product-buy-panel product-info">
        <div class="product-buy-card">
          ${badgeLabel ? `<div class="badge">${esc(badgeLabel)}</div>` : ""}
          <h1>${esc(titleName)}</h1>
          ${titleSub ? `<p class="product-h1-sub">${esc(titleSub)}</p>` : ""}
          <p class="sku-label">Артикул ${esc(product.sku || "")}</p>
          <div class="product-buy-price-row">
            ${priceBlock(product, available)}
            ${ratingHtml(matchedReviews, pagePath, available)}
          </div>
          <div class="product-actions">
            ${
              available
                ? `<a class="btn btn-primary" href="checkout.html?buy=${encodeURIComponent(product.id)}">Купить</a>
            <button class="btn btn-ghost" type="button" data-add-cart="${product.id}">В корзину</button>`
                : `<button class="btn btn-primary" type="button" data-notify-product="${product.id}" data-notify-name="${esc(
                    product.name
                  )}">Сообщить о поступлении</button>
            <a class="btn btn-ghost" href="/kostrovye-chashi.html">Каталог</a>`
            }
          </div>
          ${shortLead ? `<p class="product-pitch">${esc(shortLead)}${shortLead.length >= 180 ? "…" : ""}</p>` : ""}
          ${
            pitchChips.length
              ? `<ul class="product-spec-chips" aria-label="Ключевые особенности">${pitchChips
                  .map((item) => `<li>${esc(item)}</li>`)
                  .join("")}</ul>`
              : ""
          }
          <ul class="product-service-grid" aria-label="Доставка и оплата">
            ${serviceNotes.map((item) => `<li>${item}</li>`).join("")}
          </ul>
        </div>
        ${
          jumpSections.length
            ? `<nav class="product-jump-nav" aria-label="Разделы страницы">${jumpSections
                .map((s) => `<a href="${esc(sectionHref(s.id))}">${esc(s.label)}</a>`)
                .join("")}</nav>`
            : ""
        }
      </div>
    </div>
    <div id="product-details" class="product-lower">
      ${
        product.description
          ? `<section class="product-panel" id="product-desc">
              <h2>О модели</h2>
              <div class="rich-text product-desc-text">${product.description}</div>
            </section>`
          : ""
      }
      ${
        specs.length || useCases.length
          ? `<section class="product-panel" id="product-specs">
              ${specs.length ? `<h2>Характеристики</h2><ul class="spec-list spec-list-compact">${specs
                  .map((item) => `<li>${esc(item)}</li>`)
                  .join("")}</ul>` : ""}
              ${
                useCases.length
                  ? `<div class="product-use-block">
                      <h3>Где применять</h3>
                      <ul class="product-use-chips">${useCases
                        .map((item) => `<li>${esc(item)}</li>`)
                        .join("")}</ul>
                    </div>`
                  : ""
              }
            </section>`
          : ""
      }
      ${reviewsPanel(matchedReviews, reviewAvg)}
      ${
        faq.length
          ? `<section class="product-panel" id="product-faq">
              <h2>Частые вопросы</h2>
              <div class="product-faq">
                ${faq
                  .map(
                    (item) => `
                  <details class="product-faq-item">
                    <summary>${esc(item.q)}</summary>
                    <p>${esc(item.a)}</p>
                  </details>`
                  )
                  .join("")}
              </div>
            </section>`
          : ""
      }
      <footer class="product-page-footer">
        <p class="form-note">Смотрите также:
          <a href="/kostrovye-chashi.html">каталог</a> ·
          <a href="/kostrovaya-chasha-dlya-avtoputeshestviy.html">для автопутешествий</a> ·
          <a href="/kostrovaya-chasha-ili-mangal.html">чаша или мангал</a>
        </p>
        <p><a href="/kostrovye-chashi.html">← Все изделия</a></p>
      </footer>
    </div>`;
}

module.exports = { buildProductPageBody };

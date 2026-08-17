(() => {
  const boot = async () => {
  if (window.NMP_cmsReady) await window.NMP_cmsReady;
  const params = new URLSearchParams(window.location.search);
  const pathMatch = window.location.pathname.match(/^\/product\/([^/]+)\/?$/);
  const slugFromPath = pathMatch ? decodeURIComponent(pathMatch[1]) : "";
  const id = params.get("id") || params.get("slug") || slugFromPath || "1";
  const getProduct =
    window.NMP_getProduct ||
    ((key) =>
      (window.NMP_PRODUCTS || []).find(
        (item) => item.id === String(key) || item.slug === String(key)
      ));
  const product = getProduct(id);
  const root = document.getElementById("productRoot");
  const siteUrl = "https://northmp.su";
  const escAttr =
    typeof window.NMP_escAttr === "function"
      ? window.NMP_escAttr
      : (value) =>
          String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/</g, "&lt;");

  const upsertMeta = (attr, key, content) => {
    if (!content) return;
    let el = document.head.querySelector(`meta[${attr}="${key}"]`);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute("content", content);
  };

  const upsertLink = (rel, href) => {
    let el = document.head.querySelector(`link[rel="${rel}"]`);
    if (!el) {
      el = document.createElement("link");
      el.setAttribute("rel", rel);
      document.head.appendChild(el);
    }
    el.setAttribute("href", href);
  };

  if (!product || !root) {
    if (root) {
      root.innerHTML = `<p class="lead">Товар не найден. <a href="/kostrovye-chashi.html">Вернуться в каталог</a></p>`;
    }
    document.title = "Товар не найден — Северное магическое место";
    return;
  }

  const pagePath = `/product/${encodeURIComponent(product.slug || product.id)}`;
  const pageUrl = `${siteUrl}${pagePath}`;
  const sectionHref = (id) => `${pagePath}#${id}`;
  const scrollToProductSection = (id) => {
    const el = document.getElementById(id);
    if (!el) return false;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    const hash = `#${encodeURIComponent(id)}`;
    if (window.location.hash !== hash) {
      history.replaceState(null, "", `${pagePath}${hash}`);
    }
    return true;
  };
  const bindProductSectionLinks = (container) => {
    container.querySelectorAll(".product-jump-nav a, .product-rating-link").forEach((link) => {
      link.addEventListener("click", (event) => {
        const raw = (link.getAttribute("href") || "").split("#")[1];
        if (!raw) return;
        const id = decodeURIComponent(raw);
        if (!scrollToProductSection(id)) return;
        event.preventDefault();
      });
    });
  };
  const abs = (src) => {
    const raw = String(src || "").trim();
    if (!raw) return `${siteUrl}/images/main-product.webp`;
    return raw.startsWith("http") ? raw : `${siteUrl}/${raw.replace(/^\//, "")}`;
  };
  const absoluteImage = abs(product.image);
  const gallery = product.gallery || [product.image];
  const galleryAbs = [...new Set([absoluteImage, ...gallery.map(abs)])];
  const displayName = product.cardTitle || product.h1 || product.name;
  const pageTitle = product.seoTitle || `${displayName} | Северное магическое место`;
  const pageDesc =
    product.seoDescription ||
    String(product.short || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const available = product.availableForOrder !== false;
  const priceNum = Number(product.price || product.effectivePrice || 0);
  const priceValidUntil = "2027-12-31";
  const priceValidFrom = "2026-01-01";

  document.title = pageTitle;
  upsertMeta("name", "description", pageDesc);
  upsertMeta("name", "keywords", (product.keywords || []).join(", "));
  upsertMeta("property", "og:type", "product");
  upsertMeta("property", "og:site_name", "Северное магическое место — Northern Magical Place");
  upsertMeta("property", "og:locale", "ru_RU");
  upsertMeta("property", "og:title", pageTitle);
  upsertMeta("property", "og:description", pageDesc);
  upsertMeta("property", "og:url", pageUrl);
  upsertMeta("property", "og:image", absoluteImage);
  upsertMeta("property", "og:image:alt", product.imageAlt || displayName);
  upsertMeta("property", "product:brand", "Северное магическое место");
  upsertMeta("property", "product:availability", available ? "in stock" : "preorder");
  upsertMeta("property", "product:condition", "new");
  upsertMeta("property", "product:retailer_item_id", product.sku || product.id);
  if (priceNum > 0) {
    upsertMeta("property", "product:price:amount", priceNum.toFixed(2));
    upsertMeta("property", "product:price:currency", "RUB");
  }
  upsertMeta("name", "twitter:card", "summary_large_image");
  upsertMeta("name", "twitter:title", pageTitle);
  upsertMeta("name", "twitter:description", pageDesc);
  upsertMeta("name", "twitter:image", absoluteImage);
  upsertLink("canonical", pageUrl);

  const cmsReviews = Array.isArray(window.NMP_CMS?.reviews) ? window.NMP_CMS.reviews : [];
  const matchedReviews = available
    ? cmsReviews.filter((review) => {
        if (review.published === false) return false;
        const pid = String(review.productId || "").trim();
        if (pid) return pid === String(product.id) || pid === String(product.slug);
        const meta = String(review.meta || "").toLowerCase();
        return meta.includes(String(product.name || "").toLowerCase());
      })
    : [];
  const reviewTitle = (review) => {
    const body = String(review.text || "")
      .replace(/<[^>]+>/g, " ")
      .trim();
    const sentence = body.split(/[.!?]/)[0].trim();
    if (sentence.length >= 12 && sentence.length <= 80) return sentence;
    if (sentence.length > 80) return `${sentence.slice(0, 77).trim()}…`;
    return `Отзыв о ${displayName}`;
  };
  const stars = (value) => "★".repeat(Math.max(1, Math.min(5, Math.round(Number(value) || 5))));
  const reviewCountLabel = (count) => {
    const n = Number(count) || 0;
    const abs = Math.abs(n) % 100;
    const d = abs % 10;
    if (abs > 10 && abs < 20) return `${n} отзывов`;
    if (d === 1) return `${n} отзыв`;
    if (d >= 2 && d <= 4) return `${n} отзыва`;
    return `${n} отзывов`;
  };

  const offer = {
    "@type": "Offer",
    url: pageUrl,
    priceCurrency: "RUB",
    price: priceNum > 0 ? priceNum.toFixed(2) : "0.00",
    priceValidUntil,
    validFrom: priceValidFrom,
    availability: available
      ? "https://schema.org/InStock"
      : "https://schema.org/PreOrder",
    itemCondition: "https://schema.org/NewCondition",
    seller: {
      "@type": "Organization",
      name: "Northern Magical Place",
      alternateName: "Северное магическое место",
      url: `${siteUrl}/`
    },
    hasMerchantReturnPolicy: {
      "@type": "MerchantReturnPolicy",
      applicableCountry: "RU",
      returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
      merchantReturnDays: 14,
      returnMethod: "https://schema.org/ReturnByMail",
      returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
      merchantReturnLink: `${siteUrl}/buyers.html#return`
    },
    shippingDetails: {
      "@type": "OfferShippingDetails",
      shippingRate: { "@type": "MonetaryAmount", value: "0", currency: "RUB" },
      shippingDestination: { "@type": "DefinedRegion", addressCountry: "RU" },
      deliveryTime: {
        "@type": "ShippingDeliveryTime",
        handlingTime: {
          "@type": "QuantitativeValue",
          minValue: 1,
          maxValue: 4,
          unitCode: "DAY"
        },
        transitTime: {
          "@type": "QuantitativeValue",
          minValue: 2,
          maxValue: 14,
          unitCode: "DAY"
        }
      }
    }
  };

  const productNode = {
    "@type": "Product",
    "@id": `${pageUrl}#product`,
    name: displayName,
    sku: product.sku,
    mpn: product.sku,
    image: galleryAbs,
    description: pageDesc,
    brand: {
      "@type": "Brand",
      name: "Northern Magical Place",
      alternateName: "Северное магическое место"
    },
    category: [
      {
        "@type": "CategoryCode",
        name: "Home & Garden > Fireplaces",
        inCodeSet: "https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt",
        codeValue: "6792"
      },
      "Костровые чаши"
    ],
    material: "Конструкционная сталь",
    offers: offer
  };

  if (matchedReviews.length) {
    const ratings = matchedReviews.map((r) => Number(r.rating || 5));
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    productNode.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(avg.toFixed(1)),
      bestRating: 5,
      worstRating: 1,
      ratingCount: matchedReviews.length,
      reviewCount: matchedReviews.length
    };
    productNode.review = matchedReviews.slice(0, 5).map((review) => {
      const date = String(review.publishedAt || review.updatedAt || "").slice(0, 10);
      const node = {
        "@type": "Review",
        name: reviewTitle(review),
        reviewBody: String(review.text || "")
          .replace(/<[^>]+>/g, " ")
          .trim(),
        author: {
          "@type": "Person",
          name: String(review.author || review.name || review.meta || "Покупатель").trim()
        },
        reviewRating: {
          "@type": "Rating",
          ratingValue: Number(review.rating || 5),
          bestRating: 5,
          worstRating: 1
        },
        itemReviewed: { "@id": `${pageUrl}#product` }
      };
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) node.datePublished = date;
      return node;
    });
  }

  const jsonLdBlocks = [
    { "@context": "https://schema.org", ...productNode },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Главная", item: `${siteUrl}/` },
        { "@type": "ListItem", position: 2, name: "Костровые чаши", item: `${siteUrl}/kostrovye-chashi.html` },
        { "@type": "ListItem", position: 3, name: displayName, item: pageUrl }
      ]
    }
  ];

  if (product.faq?.length) {
    jsonLdBlocks.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: product.faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a }
      }))
    });
  }

  const hasServerJsonLd = document.querySelector('script[data-seo-jsonld="1"]');
  if (!hasServerJsonLd) {
    document.querySelectorAll('script[type="application/ld+json"]').forEach((node) => node.remove());
    jsonLdBlocks.forEach((data) => {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.dataset.seoJsonld = "1";
      script.textContent = JSON.stringify(data);
      document.head.appendChild(script);
    });
  }

  const galleryAlts = product.galleryAlts || [];
  const useCases = Array.isArray(product.useCases) ? product.useCases : [];
  const specs = Array.isArray(product.specs) ? product.specs : [];
  const reviewAvg =
    matchedReviews.length > 0
      ? matchedReviews.reduce((sum, r) => sum + Number(r.rating || 5), 0) / matchedReviews.length
      : 0;
  const ratingHtml = matchedReviews.length
    ? `<a class="product-rating product-rating-link product-rating-inline product-rating-highlight" href="${sectionHref("product-reviews")}" aria-label="Читать отзывы покупателей">
        <span class="stars" aria-hidden="true">${stars(reviewAvg)}</span>
        <span>${reviewAvg.toFixed(1).replace(".", ",")} · ${reviewCountLabel(matchedReviews.length)}</span>
      </a>`
    : "";

  const priceLabel = product.hasPromo
    ? `<s class="price-old">${window.NMP_formatPrice(product.basePrice || product.price)}</s> ${window.NMP_formatPrice(product.price)}`
    : window.NMP_formatPrice(product.price);

  const shortLead =
    product.short ||
    String(product.description || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180);

  const titleName = String(product.cardTitle || product.name || displayName).trim();
  let titleSub = String(product.cardSubtitle || "").trim();
  if (!titleSub && product.h1 && product.h1 !== titleName) {
    const h1 = String(product.h1).trim();
    if (h1.startsWith(titleName) && h1.includes("—")) {
      titleSub = h1.slice(titleName.length).replace(/^[\s—–-]+/, "").trim();
    } else if (h1 !== titleName) {
      titleSub = h1;
    }
  }
  const badgeLabel = product.badge || (available ? "" : "Скоро в продаже");
  const specChips = specs.slice(0, 4);
  const serviceNotes = available
    ? [
        "Оплата через ЮKassa",
        "Сборка 1–2 дня · отгрузка до 48 ч",
        "СДЭК по России · Петрозаводск",
        "Гарантия 90 дней · <a href=\"usage.html\">эксплуатация</a>"
      ]
    : [
        product.availabilityNote ||
          "Модель готовится к продаже — оставьте заявку на оповещение.",
        "СДЭК по России · Петрозаводск",
        "Оплата через ЮKassa после запуска продаж",
        "<a href=\"/kostrovye-chashi.html\">Другие модели в каталоге</a>"
      ];

  const jumpSections = [
    product.description && { id: "product-desc", label: "Описание" },
    (specs.length || useCases.length) && { id: "product-specs", label: "Характеристики" },
    matchedReviews.length && { id: "product-reviews", label: "Отзывы" },
    product.faq?.length && { id: "product-faq", label: "Вопросы" }
  ].filter(Boolean);

  const pageHtml = `
    <nav class="product-breadcrumbs reveal visible" aria-label="Хлебные крошки">
      <a href="/">Главная</a>
      <span aria-hidden="true">/</span>
      <a href="/kostrovye-chashi.html">Костровые чаши</a>
      <span aria-hidden="true">/</span>
      <span>${escAttr(titleName)}</span>
    </nav>
    <div class="product-hero reveal visible">
      <div class="product-gallery">
        <div class="product-stage">
          <img id="mainImage" src="${product.image}" alt="${escAttr(product.imageAlt || product.name)}" />
        </div>
        <div class="thumbs">
          ${gallery
            .map(
              (src, index) =>
                `<button type="button" class="thumb ${index === 0 ? "active" : ""}" data-src="${src}" data-alt="${escAttr(
                  galleryAlts[index] || product.imageAlt || product.name
                )}"><img src="${src}" alt="${escAttr(galleryAlts[index] || product.imageAlt || product.name)}" loading="lazy" /></button>`
            )
            .join("")}
        </div>
      </div>
      <div class="product-buy-panel product-info">
        <div class="product-buy-card">
          ${badgeLabel ? `<div class="badge">${escAttr(badgeLabel)}</div>` : ""}
          <h1>${escAttr(titleName)}</h1>
          ${titleSub ? `<p class="product-h1-sub">${escAttr(titleSub)}</p>` : ""}
          <p class="sku-label">Артикул ${escAttr(product.sku || "")}</p>
          <div class="product-buy-price-row">
            ${
              available
                ? `<p class="price-lg">${priceLabel}</p>`
                : Number(product.price) > 0
                  ? `<p class="price-lg">от ${window.NMP_formatPrice(product.price)}</p>`
                  : `<p class="price-lg price-soon">Цена по запросу</p>`
            }
            ${ratingHtml || ""}
          </div>
          <div class="product-actions">
            ${
              available
                ? `<a class="btn btn-primary" href="checkout.html?buy=${encodeURIComponent(product.id)}">Купить</a>
            <button class="btn btn-ghost" type="button" data-add-cart="${product.id}">В корзину</button>`
                : `<button class="btn btn-primary" type="button" data-notify-product="${product.id}" data-notify-name="${escAttr(product.name)}">Сообщить о поступлении</button>
            <a class="btn btn-ghost" href="/kostrovye-chashi.html">Каталог</a>`
            }
          </div>
          ${shortLead ? `<p class="product-pitch">${escAttr(shortLead)}${shortLead.length >= 180 ? "…" : ""}</p>` : ""}
          ${
            specChips.length
              ? `<ul class="product-spec-chips" aria-label="Ключевые особенности">${specChips
                  .map((item) => `<li>${escAttr(item)}</li>`)
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
                .map((s) => `<a href="${sectionHref(s.id)}">${s.label}</a>`)
                .join("")}</nav>`
            : ""
        }
      </div>
    </div>
    <div id="product-details" class="product-lower reveal visible">
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
                  .map((item) => `<li>${escAttr(item)}</li>`)
                  .join("")}</ul>` : ""}
              ${
                useCases.length
                  ? `<div class="product-use-block">
                      <h3>Где применять</h3>
                      <ul class="product-use-chips">${useCases
                        .map((item) => `<li>${escAttr(item)}</li>`)
                        .join("")}</ul>
                    </div>`
                  : ""
              }
            </section>`
          : ""
      }
      ${
        matchedReviews.length
          ? `<section class="product-panel product-reviews-panel is-orderable" id="product-reviews" aria-label="Отзывы покупателей">
              <div class="product-panel-head">
                <h2>Отзывы покупателей</h2>
                <p class="product-panel-meta">${reviewAvg.toFixed(1).replace(".", ",")} · ${reviewCountLabel(
                  matchedReviews.length
                )}</p>
              </div>
              <div class="reviews-grid product-reviews-grid">
                ${matchedReviews
                  .slice(0, 5)
                  .map((review) => {
                    const rating = Number(review.rating || 5);
                    const body = String(review.text || "")
                      .replace(/<[^>]+>/g, " ")
                      .replace(/^«|»$/g, "")
                      .trim();
                    return `<article class="review review-compact">
                      <div class="stars" aria-label="${rating} из 5">${stars(rating)}</div>
                      <p>«${escAttr(body)}»</p>
                      <footer>
                        <strong>${escAttr(review.author || "Покупатель")}</strong>
                        ${review.meta ? `<span>${escAttr(review.meta)}</span>` : ""}
                      </footer>
                    </article>`;
                  })
                  .join("")}
              </div>
            </section>`
          : ""
      }
      ${
        product.faq?.length
          ? `<section class="product-panel" id="product-faq">
              <h2>Частые вопросы</h2>
              <div class="product-faq">
                ${product.faq
                  .map(
                    (item) => `
                  <details class="product-faq-item">
                    <summary>${escAttr(item.q)}</summary>
                    <p>${escAttr(item.a)}</p>
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
    </div>
  `;

  const ssrProductId =
    root.querySelector("[data-add-cart]")?.getAttribute("data-add-cart") ||
    root.querySelector("[data-notify-product]")?.getAttribute("data-notify-product") ||
    "";
  const useSsrLayout = root.querySelector(".product-hero") && String(ssrProductId) === String(product.id);

  if (useSsrLayout) {
    root.querySelectorAll(".product-breadcrumbs, .product-hero, .product-lower").forEach((el) => {
      el.classList.add("reveal", "visible");
    });
  } else {
    root.innerHTML = pageHtml;
  }

  document.getElementById("productStickyBuy")?.remove();
  if (available) {
    const stickyEl = document.createElement("div");
    stickyEl.className = "product-sticky-buy";
    stickyEl.id = "productStickyBuy";
    stickyEl.innerHTML = `
      <div class="product-sticky-buy-inner">
        <div>
          <strong>${product.name}</strong>
          <span class="price">${window.NMP_formatPrice(product.price)}</span>
        </div>
        <div class="product-sticky-actions">
          <a class="btn btn-primary" href="checkout.html?buy=${encodeURIComponent(product.id)}">Купить</a>
          <button class="btn btn-ghost" type="button" data-add-cart="${product.id}">В корзину</button>
        </div>
      </div>`;
    document.body.appendChild(stickyEl);
  }

  bindProductSectionLinks(root);
  const initialHash = String(window.location.hash || "").replace(/^#/, "");
  if (initialHash) {
    window.requestAnimationFrame(() => scrollToProductSection(decodeURIComponent(initialHash)));
    window.setTimeout(() => scrollToProductSection(decodeURIComponent(initialHash)), 350);
  }

  const mainImage = document.getElementById("mainImage");
  root.querySelectorAll(".thumb").forEach((btn) => {
    btn.addEventListener("click", () => {
      root.querySelectorAll(".thumb").forEach((el) => el.classList.remove("active"));
      btn.classList.add("active");
      mainImage.src = btn.getAttribute("data-src");
      mainImage.alt = btn.getAttribute("data-alt") || product.name;
    });
  });

  const sticky = document.getElementById("productStickyBuy");
  const actions = root.querySelector(".product-actions");
  if (sticky && actions && "IntersectionObserver" in window) {
    // Show sticky only after primary CTAs leave the viewport (not on first paint)
    const io = new IntersectionObserver(
      ([entry]) => {
        const scrolledPast = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        sticky.classList.toggle("is-visible", scrolledPast);
      },
      { threshold: 0, rootMargin: "-72px 0px 0px 0px" }
    );
    io.observe(actions);
  }
  root.querySelector("[data-add-cart]")?.addEventListener("click", () => {
    if (product.availableForOrder === false) {
      window.NMP_openAvailabilityNotify?.(product);
      return;
    }
    window.NMP_Store.addToCart(product.id);
    window.NMP_toast(`«${product.name}» добавлен в корзину`);
  });

  root.querySelector("[data-notify-product]")?.addEventListener("click", () => {
    window.NMP_openAvailabilityNotify?.(product);
  });

  window.NMP_analytics?.ready?.then(() => {
    window.NMP_analytics.trackViewItem(product);
  });

  };
  void boot();
})();

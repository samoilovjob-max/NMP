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

  const pageUrl = `${siteUrl}/product/${encodeURIComponent(product.slug || product.id)}`;
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
  const priceValidUntil = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  })();

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
  const matchedReviews = cmsReviews.filter((review) => {
    const pid = String(review.productId || "").trim();
    if (pid) return pid === String(product.id) || pid === String(product.slug);
    const meta = String(review.meta || "").toLowerCase();
    return meta.includes(String(product.name || "").toLowerCase());
  });

  const offer = {
    "@type": "Offer",
    url: pageUrl,
    priceCurrency: "RUB",
    price: priceNum > 0 ? priceNum.toFixed(2) : "0.00",
    priceValidUntil,
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
    category: (product.keywords || [])[0] || "Костровые чаши",
    material: "Конструкционная сталь",
    offers: offer
  };

  if (matchedReviews.length) {
    const ratings = matchedReviews.map((r) => Number(r.rating || 5));
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    productNode.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(avg.toFixed(1)),
      reviewCount: matchedReviews.length,
      bestRating: 5,
      worstRating: 1
    };
    productNode.review = matchedReviews.slice(0, 5).map((review) => ({
      "@type": "Review",
      reviewBody: String(review.text || "")
        .replace(/<[^>]+>/g, " ")
        .trim(),
      author: {
        "@type": "Person",
        name: String(review.author || review.name || review.meta || "Покупатель").trim()
      },
      reviewRating: {
        "@type": "Rating",
        ratingValue: String(Number(review.rating || 5)),
        bestRating: "5",
        worstRating: "1"
      }
    }));
  }

  const graph = [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Главная", item: `${siteUrl}/` },
        { "@type": "ListItem", position: 2, name: "Костровые чаши", item: `${siteUrl}/kostrovye-chashi.html` },
        { "@type": "ListItem", position: 3, name: displayName, item: pageUrl }
      ]
    },
    productNode
  ];

  if (product.faq?.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: product.faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a }
      }))
    });
  }

  document.querySelectorAll('script[type="application/ld+json"]').forEach((node) => node.remove());
  const injectJsonLd = (data) => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.dataset.seoJsonld = "1";
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  };
  injectJsonLd({ "@context": "https://schema.org", "@graph": graph });

  const galleryAlts = product.galleryAlts || [];
  const useCases = Array.isArray(product.useCases) ? product.useCases : [];
  const specs = Array.isArray(product.specs) ? product.specs : [];
  const highlightSpecs = specs.slice(0, 4);

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

  root.innerHTML = `
    <nav class="product-breadcrumbs reveal visible" aria-label="Хлебные крошки">
      <a href="/">Главная</a>
      <span aria-hidden="true">/</span>
      <a href="/kostrovye-chashi.html">Костровые чаши</a>
      <span aria-hidden="true">/</span>
      <span>${escAttr(displayName)}</span>
    </nav>
    <div class="product-gallery reveal visible">
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
    <div class="product-info reveal visible">
      <div class="badge">${product.badge || (available ? "" : "Скоро в продаже")}</div>
      <h1>${product.h1 || product.name}</h1>
      <p class="sku-label">Артикул ${product.sku}</p>
      ${
        available
          ? `<p class="price-lg">${priceLabel}</p>`
          : Number(product.price) > 0
            ? `<p class="price-lg">от ${window.NMP_formatPrice(product.price)}</p>`
            : `<p class="price-lg price-soon">Цена по запросу</p>`
      }
      <div class="product-actions">
        ${
          available
            ? `<a class="btn btn-primary" href="checkout.html?buy=${encodeURIComponent(product.id)}">Купить</a>
        <button class="btn btn-ghost" type="button" data-add-cart="${product.id}">В корзину</button>
        <a class="btn btn-ghost" href="#product-details">Подробнее</a>`
            : `<button class="btn btn-primary" type="button" data-notify-product="${product.id}" data-notify-name="${product.name}">Сообщить о поступлении</button>
        <a class="btn btn-ghost" href="/kostrovye-chashi.html">Смотреть каталог</a>`
        }
      </div>
      ${shortLead ? `<p class="product-pitch">${shortLead}${shortLead.length >= 180 ? "…" : ""}</p>` : ""}
      ${
        highlightSpecs.length
          ? `<ul class="product-benefits product-benefits-page" aria-label="Ключевые преимущества">
              ${highlightSpecs.map((item) => `<li>${item}</li>`).join("")}
            </ul>`
          : ""
      }
      <ul class="trust-list">
        <li>Оплата через ЮKassa</li>
        <li>Сборка 1–2 рабочих дня · отгрузка до 48 ч</li>
        <li>СДЭК по России · самовывоз в Петрозаводске</li>
        <li>Статус заказа — в личном кабинете или Telegram</li>
        <li><a href="usage.html">Правила эксплуатации и гарантия 3 мес. (90 дней)</a></li>
      </ul>
      <p class="form-note">${
        available
          ? "Доставка СДЭК, самовывоз или адресная доставка по Петрозаводску · Оплата через ЮKassa · статусы — в кабинете или Telegram"
          : product.availabilityNote ||
            "Модель ещё готовится к продаже. Оставьте контакты — сообщим, когда можно будет заказать."
      }</p>

      <div id="product-details" class="product-details">
        <div class="lead rich-text">${product.description || ""}</div>
        ${
          specs.length
            ? `<section class="seo-block">
                <h2>Характеристики</h2>
                <ul class="spec-list">${specs.map((item) => `<li>${item}</li>`).join("")}</ul>
              </section>`
            : ""
        }
        ${
          useCases.length
            ? `<section class="seo-block product-usecases"><h2>Где применять</h2><ul class="spec-list">${useCases
                .map((item) => `<li>${item}</li>`)
                .join("")}</ul></section>`
            : ""
        }

        ${
          product.faq?.length
            ? `<section class="seo-block">
                <h2>Частые вопросы</h2>
                <div class="product-faq">
                  ${product.faq
                    .map(
                      (item) => `
                    <details class="product-faq-item">
                      <summary>${item.q}</summary>
                      <p>${item.a}</p>
                    </details>`
                    )
                    .join("")}
                </div>
              </section>`
            : ""
        }
      </div>

      <p class="form-note">Смотрите также: <a href="/kostrovye-chashi.html">каталог костровых чаш Northern Magical Place</a></p>
      <p><a href="/kostrovye-chashi.html">← Все изделия</a></p>
    </div>
  `;

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

(() => {
  const boot = async () => {
  if (window.NMP_cmsReady) await window.NMP_cmsReady;
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id") || params.get("slug") || "1";
  const getProduct =
    window.NMP_getProduct ||
    ((key) =>
      (window.NMP_PRODUCTS || []).find(
        (item) => item.id === String(key) || item.slug === String(key)
      ));
  const product = getProduct(id);
  const root = document.getElementById("productRoot");
  const siteUrl = "https://northmp.su";

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
      root.innerHTML = `<p class="lead">Товар не найден. <a href="index.html#catalog">Вернуться в каталог</a></p>`;
    }
    document.title = "Товар не найден — Northern Magical Place";
    return;
  }

  const pageUrl = `${siteUrl}/product.html?id=${encodeURIComponent(product.id)}`;
  const absoluteImage = product.image.startsWith("http")
    ? product.image
    : `${siteUrl}/${product.image.replace(/^\//, "")}`;

  document.title = product.seoTitle || `${product.name} — Northern Magical Place`;
  upsertMeta("name", "description", product.seoDescription || product.short);
  upsertMeta("name", "keywords", (product.keywords || []).join(", "));
  upsertMeta("property", "og:type", "product");
  upsertMeta("property", "og:site_name", "Northern Magical Place");
  upsertMeta("property", "og:locale", "ru_RU");
  upsertMeta("property", "og:title", product.seoTitle || product.name);
  upsertMeta("property", "og:description", product.seoDescription || product.short);
  upsertMeta("property", "og:url", pageUrl);
  upsertMeta("property", "og:image", absoluteImage);
  upsertMeta("name", "twitter:card", "summary_large_image");
  upsertMeta("name", "twitter:title", product.seoTitle || product.name);
  upsertMeta("name", "twitter:description", product.seoDescription || product.short);
  upsertMeta("name", "twitter:image", absoluteImage);
  upsertLink("canonical", pageUrl);

  const available = product.availableForOrder !== false;

  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    mpn: product.sku,
    image: [absoluteImage],
    description: product.seoDescription || product.description,
    brand: {
      "@type": "Brand",
      name: "Northern Magical Place"
    },
    category: (product.keywords || [])[0] || "Костровые системы",
    offers: {
      "@type": "Offer",
      url: pageUrl,
      priceCurrency: "RUB",
      price: String(product.price),
      availability: available
        ? "https://schema.org/InStock"
        : "https://schema.org/PreOrder",
      itemCondition: "https://schema.org/NewCondition",
      seller: {
        "@type": "Organization",
        name: "Northern Magical Place"
      }
    }
  };

  const faqSchema =
    product.faq?.length
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: product.faq.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: {
              "@type": "Answer",
              text: item.a
            }
          }))
        }
      : null;

  document.querySelectorAll("script[data-seo-jsonld]").forEach((node) => node.remove());
  const injectJsonLd = (data) => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.dataset.seoJsonld = "1";
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  };
  injectJsonLd(productSchema);
  if (faqSchema) injectJsonLd(faqSchema);

  const gallery = product.gallery || [product.image];
  const galleryAlts = product.galleryAlts || [];

  const priceLabel = product.hasPromo
    ? `${window.NMP_formatPrice(product.basePrice || product.price)} → ${window.NMP_formatPrice(product.price)}`
    : window.NMP_formatPrice(product.price);

  root.innerHTML = `
    <div class="product-gallery reveal visible">
      <div class="product-stage">
        <img id="mainImage" src="${product.image}" alt="${product.imageAlt || product.name}" />
      </div>
      <div class="thumbs">
        ${gallery
          .map(
            (src, index) =>
              `<button type="button" class="thumb ${index === 0 ? "active" : ""}" data-src="${src}" data-alt="${
                galleryAlts[index] || product.imageAlt || product.name
              }"><img src="${src}" alt="${galleryAlts[index] || product.name}" /></button>`
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
          : `<p class="price-lg price-soon">Цена по запросу</p>`
      }
      <p class="lead">${product.description}</p>
      <ul class="spec-list">
        ${product.specs.map((item) => `<li>${item}</li>`).join("")}
      </ul>
      <div class="product-actions">
        ${
          available
            ? `<a class="btn btn-primary" href="checkout.html?buy=${product.id}">Оформить заказ</a>
        <button class="btn btn-ghost" type="button" data-add-cart="${product.id}">В корзину</button>`
            : `<button class="btn btn-primary" type="button" data-notify-product="${product.id}" data-notify-name="${product.name}">Сообщить о поступлении</button>
        <a class="btn btn-ghost" href="index.html#catalog">Смотреть каталог</a>`
        }
      </div>
      <p class="form-note">${
        available
          ? "Доставка СДЭК, самовывоз или адресная доставка по Петрозаводску · Оплата через ЮKassa"
          : product.availabilityNote ||
            "Модель ещё готовится к продаже. Оставьте контакты — сообщим, когда можно будет заказать."
      }</p>

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

      <p class="form-note">Смотрите также: <a href="index.html#catalog">каталог костровых систем Northern Magical Place</a></p>
      <p><a href="index.html#catalog">← Все изделия</a></p>
    </div>
  `;

  const mainImage = document.getElementById("mainImage");
  root.querySelectorAll(".thumb").forEach((btn) => {
    btn.addEventListener("click", () => {
      root.querySelectorAll(".thumb").forEach((el) => el.classList.remove("active"));
      btn.classList.add("active");
      mainImage.src = btn.getAttribute("data-src");
      mainImage.alt = btn.getAttribute("data-alt") || product.name;
    });
  });

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

  };
  void boot();
})();
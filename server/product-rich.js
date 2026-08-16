const SITE = `https://${String(process.env.CANONICAL_HOST || "northmp.su")
  .trim()
  .toLowerCase()}`;

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(pathOrUrl) {
  const raw = String(pathOrUrl || "").trim();
  if (!raw) return `${SITE}/images/main-product.webp`;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${SITE}/${raw.replace(/^\//, "")}`;
}

function productDisplayName(product) {
  return String(product.cardTitle || product.h1 || product.name || "Костровая чаша").trim();
}

function productDescription(product) {
  return (
    stripHtml(product.seoDescription) ||
    stripHtml(product.short) ||
    stripHtml(product.description).slice(0, 300)
  );
}

function productImages(product) {
  const list = [];
  const push = (src) => {
    if (!src) return;
    const url = absoluteUrl(src);
    if (!list.includes(url)) list.push(url);
  };
  push(product.image);
  (Array.isArray(product.gallery) ? product.gallery : []).forEach(push);
  if (!list.length) push("images/main-product.webp");
  return list;
}

function priceValidUntil() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function formatRub(value) {
  const n = Number(value || 0);
  return `${new Intl.NumberFormat("ru-RU").format(n)} ₽`;
}

function reviewsForProduct(product, reviews = []) {
  const id = String(product.id || "");
  const slug = String(product.slug || "");
  const name = String(product.name || "").toLowerCase();
  return (reviews || []).filter((review) => {
    if (review.published === false) return false;
    const pid = String(review.productId || "").trim();
    if (pid && (pid === id || pid === slug)) return true;
    if (pid) return false;
    const meta = String(review.meta || "").toLowerCase();
    return name && meta.includes(name);
  });
}

function buildOffer(product, canonical) {
  const available = product.availableForOrder !== false;
  const price = Number(product.price || product.effectivePrice || 0);
  const offer = {
    "@type": "Offer",
    url: canonical,
    priceCurrency: "RUB",
    price: price > 0 ? price.toFixed(2) : "0.00",
    priceValidUntil: priceValidUntil(),
    availability: available
      ? "https://schema.org/InStock"
      : "https://schema.org/PreOrder",
    itemCondition: "https://schema.org/NewCondition",
    seller: {
      "@type": "Organization",
      name: "Northern Magical Place",
      alternateName: "Северное магическое место",
      url: `${SITE}/`
    },
    hasMerchantReturnPolicy: {
      "@type": "MerchantReturnPolicy",
      applicableCountry: "RU",
      returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
      merchantReturnDays: 14,
      returnMethod: "https://schema.org/ReturnByMail",
      returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
      merchantReturnLink: `${SITE}/buyers.html#return`
    },
    shippingDetails: {
      "@type": "OfferShippingDetails",
      shippingRate: {
        "@type": "MonetaryAmount",
        value: "0",
        currency: "RUB"
      },
      shippingDestination: {
        "@type": "DefinedRegion",
        addressCountry: "RU"
      },
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
  return offer;
}

function buildProductGraph(product, reviews = []) {
  const canonical = `${SITE}/product.html?slug=${encodeURIComponent(product.slug)}`;
  const name = productDisplayName(product);
  const description = productDescription(product);
  const images = productImages(product);
  const matchedReviews = reviewsForProduct(product, reviews);

  const productNode = {
    "@type": "Product",
    "@id": `${canonical}#product`,
    name,
    sku: product.sku || undefined,
    mpn: product.sku || undefined,
    image: images,
    description,
    brand: {
      "@type": "Brand",
      name: "Northern Magical Place",
      alternateName: "Северное магическое место"
    },
    category: "Костровые чаши",
    material: "Конструкционная сталь",
    countryOfOrigin: {
      "@type": "Country",
      name: "Россия"
    },
    offers: buildOffer(product, canonical)
  };

  if (matchedReviews.length) {
    const ratings = matchedReviews
      .map((r) => Number(r.rating || 5))
      .filter((n) => n > 0);
    const avg =
      ratings.reduce((sum, n) => sum + n, 0) / Math.max(1, ratings.length);
    productNode.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(avg.toFixed(1)),
      reviewCount: matchedReviews.length,
      bestRating: 5,
      worstRating: 1
    };
    productNode.review = matchedReviews.slice(0, 5).map((review) => ({
      "@type": "Review",
      reviewBody: stripHtml(review.text || review.body || ""),
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
      "@id": `${canonical}#breadcrumb`,
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Главная",
          item: `${SITE}/`
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Каталог",
          item: `${SITE}/#catalog`
        },
        {
          "@type": "ListItem",
          position: 3,
          name,
          item: canonical
        }
      ]
    },
    productNode
  ];

  const faq = Array.isArray(product.faq) ? product.faq : [];
  if (faq.length) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${canonical}#faq`,
      mainEntity: faq.map((item) => ({
        "@type": "Question",
        name: String(item.q || "").trim(),
        acceptedAnswer: {
          "@type": "Answer",
          text: String(item.a || "").trim()
        }
      }))
    });
  }

  return {
    canonical,
    name,
    description,
    images,
    available: product.availableForOrder !== false,
    price: Number(product.price || product.effectivePrice || 0),
    priceLabel: formatRub(product.price || product.effectivePrice || 0),
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": graph
    }
  };
}

module.exports = {
  SITE,
  stripHtml,
  absoluteUrl,
  productDisplayName,
  productDescription,
  productImages,
  formatRub,
  reviewsForProduct,
  buildProductGraph
};

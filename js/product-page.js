(() => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id") || "1";
  const product = window.NMP_getProduct(id);
  const root = document.getElementById("productRoot");

  if (!product || !root) {
    if (root) root.innerHTML = `<p class="lead">Товар не найден. <a href="index.html#catalog">Вернуться в каталог</a></p>`;
    return;
  }

  document.title = `${product.name} — Northern Magical Place`;

  root.innerHTML = `
    <div class="product-gallery reveal visible">
      <div class="product-stage">
        <img id="mainImage" src="${product.image}" alt="${product.name}" />
      </div>
      <div class="thumbs">
        ${product.gallery
          .map(
            (src, index) =>
              `<button type="button" class="thumb ${index === 0 ? "active" : ""}" data-src="${src}"><img src="${src}" alt="" /></button>`
          )
          .join("")}
      </div>
    </div>
    <div class="product-info reveal visible">
      <div class="badge">${product.badge}</div>
      <h1>${product.name}</h1>
      <p class="sku-label">Артикул ${product.sku}</p>
      <p class="price-lg">${window.NMP_formatPrice(product.price)}</p>
      <p class="lead">${product.description}</p>
      <ul class="spec-list">
        ${product.specs.map((item) => `<li>${item}</li>`).join("")}
      </ul>
      <div class="product-actions">
        <a class="btn btn-primary" href="checkout.html?buy=${product.id}">Оформить заказ</a>
        <button class="btn btn-ghost" type="button" data-add-cart="${product.id}">В корзину</button>
      </div>
      <p class="form-note">Доставка по России через СДЭК · Оплата через ЮKassa · После заказа откроется личный кабинет</p>
      <p><a href="index.html#catalog">← Все изделия</a></p>
    </div>
  `;

  const mainImage = document.getElementById("mainImage");
  root.querySelectorAll(".thumb").forEach((btn) => {
    btn.addEventListener("click", () => {
      root.querySelectorAll(".thumb").forEach((el) => el.classList.remove("active"));
      btn.classList.add("active");
      mainImage.src = btn.getAttribute("data-src");
    });
  });

  // re-bind add to cart for dynamically inserted button
  root.querySelector("[data-add-cart]")?.addEventListener("click", () => {
    window.NMP_Store.addToCart(product.id);
    window.NMP_toast(`«${product.name}» добавлен в корзину`);
  });
})();

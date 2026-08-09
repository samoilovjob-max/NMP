(() => {
  const Store = window.NMP_Store;
  const params = new URLSearchParams(window.location.search);
  const buyId = params.get("buy");

  if (buyId) {
    Store.addToCart(buyId, 1);
  }

  const DEMO_PVZ = {
    Москва: [
      { code: "MSK45", address: "г. Москва, ул. Вавилова, 5 · ПВЗ СДЭК" },
      { code: "MSK12", address: "г. Москва, Ленинградский пр-т, 36 · ПВЗ СДЭК" },
      { code: "MSK88", address: "г. Москва, ул. Профсоюзная, 56 · ПВЗ СДЭК" }
    ],
    "Санкт-Петербург": [
      { code: "SPB21", address: "г. Санкт-Петербург, Невский пр., 100 · ПВЗ СДЭК" },
      { code: "SPB07", address: "г. Санкт-Петербург, ул. Савушкина, 141 · ПВЗ СДЭК" }
    ],
    Петрозаводск: [
      { code: "PTZ01", address: "г. Петрозаводск, пр. Ленина, 21 · ПВЗ СДЭК" },
      { code: "PTZ03", address: "г. Петрозаводск, ул. Кирова, 8 · ПВЗ СДЭК" }
    ],
    default: [
      { code: "CDEK01", address: "Центральный ПВЗ СДЭК в выбранном городе" },
      { code: "CDEK02", address: "ПВЗ СДЭК у вокзала / ТЦ" },
      { code: "CDEK03", address: "ПВЗ СДЭК в спальном районе" }
    ]
  };

  const summaryEl = document.getElementById("checkoutSummary");
  const form = document.getElementById("checkoutForm");
  const cityInput = document.getElementById("city");
  const pvzList = document.getElementById("pvzList");
  const pvzCode = document.getElementById("pvzCode");
  const pvzAddress = document.getElementById("pvzAddress");
  const pvzSelected = document.getElementById("pvzSelected");
  const user = Store.getUser();

  if (user) {
    form.lastName.value = user.lastName || "";
    form.firstName.value = user.firstName || "";
    form.middleName.value = user.middleName || "";
    form.phone.value = user.phone || "";
    form.email.value = user.email || "";
    if (user.city) cityInput.value = user.city;
  }

  const cartLines = () => {
    const cart = Store.getCart();
    return cart
      .map((line) => {
        const product = window.NMP_getProduct(line.productId);
        if (!product) return null;
        return { ...line, product, sum: product.price * line.qty };
      })
      .filter(Boolean);
  };

  const renderSummary = () => {
    const lines = cartLines();
    if (!lines.length) {
      summaryEl.innerHTML = `
        <h2>Корзина пуста</h2>
        <p class="lead">Выберите изделие в каталоге.</p>
        <a class="btn btn-primary" href="index.html#catalog">К изделиям</a>`;
      form.querySelector("button[type=submit]").disabled = true;
      return;
    }

    const total = lines.reduce((s, l) => s + l.sum, 0);
    summaryEl.innerHTML = `
      <h2>Ваш заказ</h2>
      <div class="summary-lines">
        ${lines
          .map(
            (line) => `
          <div class="summary-line">
            <img src="${line.product.image}" alt="" />
            <div>
              <strong>${line.product.name}</strong>
              <div class="qty-row">
                <button type="button" data-qty-minus="${line.productId}">−</button>
                <span>${line.qty}</span>
                <button type="button" data-qty-plus="${line.productId}">+</button>
              </div>
            </div>
            <div class="sum">${window.NMP_formatPrice(line.sum)}</div>
          </div>`
          )
          .join("")}
      </div>
      <div class="summary-total">
        <span>Итого</span>
        <strong>${window.NMP_formatPrice(total)}</strong>
      </div>
      <p class="form-note">Отправка всех заказов — курьерская служба СДЭК</p>`;

    summaryEl.querySelectorAll("[data-qty-minus]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-qty-minus");
        const line = Store.getCart().find((i) => i.productId === id);
        Store.updateQty(id, (line?.qty || 1) - 1);
        renderSummary();
      });
    });
    summaryEl.querySelectorAll("[data-qty-plus]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-qty-plus");
        const line = Store.getCart().find((i) => i.productId === id);
        Store.updateQty(id, (line?.qty || 0) + 1);
        renderSummary();
      });
    });
    form.querySelector("button[type=submit]").disabled = false;
  };

  const renderPvz = (city) => {
    const list = DEMO_PVZ[city] || DEMO_PVZ.default.map((item) => ({
      ...item,
      address: `г. ${city || "…"} · ${item.address}`
    }));
    pvzList.innerHTML = list
      .map(
        (item) => `
      <button type="button" class="pvz-item" role="option" data-code="${item.code}" data-address="${item.address}">
        <strong>${item.code}</strong>
        <span>${item.address}</span>
      </button>`
      )
      .join("");

    pvzList.querySelectorAll(".pvz-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        pvzList.querySelectorAll(".pvz-item").forEach((el) => el.classList.remove("active"));
        btn.classList.add("active");
        pvzCode.value = btn.dataset.code;
        pvzAddress.value = btn.dataset.address;
        pvzSelected.textContent = "Выбрано: " + btn.dataset.address;
      });
    });
  };

  cityInput.addEventListener("change", () => renderPvz(cityInput.value.trim()));
  cityInput.addEventListener("blur", () => {
    if (cityInput.value.trim()) renderPvz(cityInput.value.trim());
  });
  if (cityInput.value) renderPvz(cityInput.value);

  // Official CDEK widget when credentials exist; otherwise helper opens list focus
  document.getElementById("openCdekWidget")?.addEventListener("click", () => {
    const box = document.getElementById("cdekWidget");
    const cfg = window.NMP_CONFIG?.cdek || {};
    if (cfg.account && cfg.secure && window.CDEKWidget) {
      box.hidden = false;
      box.innerHTML = "";
      // eslint-disable-next-line no-new
      new window.CDEKWidget({
        from: cfg.fromCity || "Петрозаводск",
        root: "cdekWidget",
        apiKey: cfg.secure,
        servicePath: "https://api.cdek.ru/v2",
        defaultLocation: cityInput.value || "Москва",
        onChoose(type, tariff, address) {
          pvzCode.value = address?.code || address?.number || "CDEK";
          pvzAddress.value = address?.address || address?.formatted || String(address);
          pvzSelected.textContent = "Выбрано: " + pvzAddress.value;
        }
      });
    } else {
      window.NMP_toast("Выберите город и пункт выдачи из списка. Для карты СДЭК добавьте ключи API в js/config.js");
      cityInput.focus();
      if (cityInput.value) renderPvz(cityInput.value.trim());
    }
  });

  const startYooKassa = async (order, total) => {
    const shopId = window.NMP_CONFIG?.yookassa?.shopId;
    // Без бэкенда полноценный платёж ЮKassa создать нельзя (confirmation_token).
    // Если shopId задан — показываем инструкцию и демо-успех; иначе демо-оплата.
    if (!shopId) {
      Store.updateOrder(order.id, { paymentStatus: "paid", paidAt: new Date().toISOString() });
      window.NMP_toast("Демо-оплата принята (добавьте shopId ЮKassa в js/config.js для боевого режима)");
      Store.clearCart();
      window.location.href = `account.html?order=${order.id}`;
      return;
    }

    // Боевой сценарий: обычно confirmation_token приходит с вашего сервера.
    // Здесь — безопасный fallback с пометкой pending + кабинет.
    Store.updateOrder(order.id, {
      paymentStatus: "pending",
      yookassa: { shopId, amount: total, note: "Создайте платёж на сервере и передайте confirmation_token" }
    });
    window.NMP_toast("Заказ создан. Для боевой ЮKassa нужен сервер с секретным ключом.");
    Store.clearCart();
    window.location.href = `account.html?order=${order.id}`;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const lines = cartLines();
    if (!lines.length) return;
    if (!pvzCode.value || !pvzAddress.value) {
      window.NMP_toast("Выберите пункт выдачи СДЭК");
      return;
    }

    const profile = {
      lastName: form.lastName.value.trim(),
      firstName: form.firstName.value.trim(),
      middleName: form.middleName.value.trim(),
      phone: form.phone.value.trim(),
      email: form.email.value.trim(),
      city: cityInput.value.trim()
    };
    Store.ensureUser(profile);

    const total = lines.reduce((s, l) => s + l.sum, 0);
    const order = Store.createOrder({
      ...profile,
      items: lines.map((l) => ({
        productId: l.productId,
        name: l.product.name,
        price: l.product.price,
        qty: l.qty,
        image: l.product.image
      })),
      total,
      city: profile.city,
      pvzCode: pvzCode.value,
      pvzAddress: pvzAddress.value,
      comment: form.comment.value.trim()
    });

    await startYooKassa(order, total);
  });

  renderSummary();
})();

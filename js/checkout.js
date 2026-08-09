(() => {
  const Store = window.NMP_Store;
  const params = new URLSearchParams(window.location.search);
  const buyId = params.get("buy");
  if (buyId) Store.addToCart(buyId, 1);

  const api = (path, options) =>
    fetch((window.NMP_CONFIG?.apiBase || "") + path, {
      headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
      ...options
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.message || "Ошибка API"), { data, status: res.status });
      return data;
    });

  const form = document.getElementById("checkoutForm");
  const summaryEl = document.getElementById("checkoutSummary");
  const cityInput = document.getElementById("city");
  const cityCodeInput = document.getElementById("cityCode");
  const citySuggest = document.getElementById("citySuggest");
  const pvzList = document.getElementById("pvzList");
  const pvzCode = document.getElementById("pvzCode");
  const pvzAddress = document.getElementById("pvzAddress");
  const pvzSelected = document.getElementById("pvzSelected");
  const deliveryInfo = document.getElementById("deliveryInfo");
  const tariffCodeInput = document.getElementById("tariffCode");
  const payBtn = document.getElementById("payBtn");
  const mapBox = document.getElementById("cdekWidget");
  let publicConfig = null;
  let pvzMap = null;
  let pvzMarkersLayer = null;
  let latestPvz = [];

  const user = Store.getUser();
  if (user) {
    form.lastName.value = user.lastName || "";
    form.firstName.value = user.firstName || "";
    form.middleName.value = user.middleName || "";
    form.phone.value = user.phone || "";
    form.email.value = user.email || "";
    if (user.city) cityInput.value = user.city;
    if (user.cityCode) cityCodeInput.value = user.cityCode;
  }

  const cartLines = () =>
    Store.getCart()
      .map((line) => {
        const product = window.NMP_getProduct(line.productId);
        return product ? { ...line, product, sum: product.price * line.qty } : null;
      })
      .filter(Boolean);

  const renderSummary = () => {
    const lines = cartLines();
    if (!lines.length) {
      summaryEl.innerHTML = `<h2>Корзина пуста</h2><p class="lead">Выберите изделие в каталоге.</p><a class="btn btn-primary" href="index.html#catalog">К изделиям</a>`;
      payBtn.disabled = true;
      return;
    }
    const total = lines.reduce((s, l) => s + l.sum, 0);
    const delivery = Number(deliveryInfo?.dataset?.sum || 0);
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
              <span class="sku-label">Артикул ${line.product.sku}</span>
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
      <div class="summary-total"><span>Товары</span><strong>${window.NMP_formatPrice(total)}</strong></div>
      <div class="summary-total"><span>Доставка СДЭК</span><strong id="deliverySumLabel">${
        delivery ? window.NMP_formatPrice(delivery) : "—"
      }</strong></div>
      <div class="summary-total"><span>Итого</span><strong>${window.NMP_formatPrice(total + delivery)}</strong></div>
      <p class="form-note">Отправка из ${publicConfig?.fromCity || "Петрозаводска"}, ${
      publicConfig?.fromAddress || "Лесной проспект 47"
    }</p>
      <p class="form-note">${
        publicConfig?.payments?.mode === "yookassa"
          ? "Оплата через ЮKassa (redirect)"
          : "Сейчас демо-оплата. После добавления ключей ЮKassa включится боевой режим."
      }</p>`;

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
    payBtn.disabled = false;
  };

  const calculateDelivery = async () => {
    if (!cityCodeInput.value) return;
    try {
      const data = await api("/api/cdek/calculate", {
        method: "POST",
        body: JSON.stringify({
          toCityCode: Number(cityCodeInput.value),
          toPvzCode: pvzCode.value || undefined,
          tariffCode: tariffCodeInput.value ? Number(tariffCodeInput.value) : undefined
        })
      });
      if (data.tariff) {
        tariffCodeInput.value = data.tariff.code || 136;
        deliveryInfo.dataset.sum = String(data.tariff.delivery_sum || 0);
        deliveryInfo.textContent = `Тариф: ${data.tariff.name || "СДЭК"} · ${window.NMP_formatPrice(
          data.tariff.delivery_sum || 0
        )} · ${data.tariff.period_min || "?"}–${data.tariff.period_max || "?"} дн.`;
      } else {
        deliveryInfo.textContent = "Не удалось рассчитать тариф для этого города";
        deliveryInfo.dataset.sum = "0";
      }
      renderSummary();
    } catch (error) {
      deliveryInfo.textContent = "Расчёт СДЭК временно недоступен: " + error.message;
    }
  };

  const selectPvz = (item) => {
    if (!item) return;
    pvzCode.value = item.code || "";
    pvzAddress.value = item.address || item.name || "";
    pvzSelected.textContent = "Выбрано: " + pvzAddress.value;
    pvzList.querySelectorAll(".pvz-item").forEach((el) => {
      el.classList.toggle("active", el.dataset.code === item.code);
    });
    calculateDelivery();
  };

  const renderPvzList = (list) => {
    if (!list.length) {
      pvzList.innerHTML = `<p class="form-note">В этом городе пока нет доступных ПВЗ</p>`;
      return;
    }
    pvzList.innerHTML = list
      .map(
        (item) => `
        <button type="button" class="pvz-item${item.code === pvzCode.value ? " active" : ""}" data-code="${item.code}" data-address="${item.address}">
          <strong>${item.code}</strong>
          <span>${item.address}</span>
          <span>${item.work_time || ""}</span>
        </button>`
      )
      .join("");
    pvzList.querySelectorAll(".pvz-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = latestPvz.find((p) => p.code === btn.dataset.code);
        selectPvz(item || { code: btn.dataset.code, address: btn.dataset.address });
      });
    });
  };

  const showOsmMap = (list) => {
    if (!window.L || !mapBox) return;
    const mapEl = document.getElementById("pvzMap");
    if (!mapEl) return;

    mapBox.hidden = false;
    const points = list.filter((p) => Number(p.latitude) && Number(p.longitude));

    if (!pvzMap) {
      pvzMap = window.L.map(mapEl, { scrollWheelZoom: true });
      window.L
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        })
        .addTo(pvzMap);
      pvzMarkersLayer = window.L.layerGroup().addTo(pvzMap);
    }

    pvzMarkersLayer.clearLayers();
    const bounds = [];
    points.forEach((item) => {
      const latLng = [Number(item.latitude), Number(item.longitude)];
      bounds.push(latLng);
      const marker = window.L.marker(latLng);
      marker.bindPopup(`
        <div class="pvz-popup">
          <strong>${item.code}</strong>
          <div>${item.address || ""}</div>
          <div>${item.work_time || ""}</div>
          <button type="button" data-pick="${item.code}">Выбрать этот ПВЗ</button>
        </div>
      `);
      marker.on("popupopen", () => {
        const btn = document.querySelector(`.pvz-popup button[data-pick="${item.code}"]`);
        btn?.addEventListener("click", () => {
          selectPvz(item);
          marker.closePopup();
          window.NMP_toast("ПВЗ выбран: " + item.code);
        });
      });
      marker.on("click", () => selectPvz(item));
      marker.addTo(pvzMarkersLayer);
    });

    window.setTimeout(() => {
      pvzMap.invalidateSize();
      if (bounds.length) pvzMap.fitBounds(bounds, { padding: [28, 28], maxZoom: 14 });
      else pvzMap.setView([61.7849, 34.3469], 11);
    }, 60);
  };

  const loadPvz = async (cityCode, { showMap = false } = {}) => {
    pvzList.innerHTML = `<p class="form-note">Загружаем пункты выдачи СДЭК…</p>`;
    try {
      const list = await api(`/api/cdek/pvz?city_code=${encodeURIComponent(cityCode)}`);
      latestPvz = Array.isArray(list) ? list : [];
      renderPvzList(latestPvz);
      if (showMap) {
        if (!window.L) {
          window.NMP_toast("Карта недоступна. Выберите ПВЗ из списка ниже.");
        } else {
          showOsmMap(latestPvz);
        }
      }
    } catch (error) {
      pvzList.innerHTML = `<p class="form-note">Ошибка загрузки ПВЗ: ${error.message}</p>`;
    }
  };

  let suggestTimer = null;
  cityInput.addEventListener("input", () => {
    window.clearTimeout(suggestTimer);
    suggestTimer = window.setTimeout(async () => {
      const q = cityInput.value.trim();
      if (q.length < 2) {
        citySuggest.innerHTML = "";
        return;
      }
      try {
        const cities = await api(`/api/cdek/cities?q=${encodeURIComponent(q)}`);
        citySuggest.innerHTML = cities
          .map(
            (c) =>
              `<button type="button" class="suggest-item" data-code="${c.code}" data-city="${c.city}">${c.city}${
                c.region ? ", " + c.region : ""
              }</button>`
          )
          .join("");
        citySuggest.querySelectorAll(".suggest-item").forEach((btn) => {
          btn.addEventListener("click", () => {
            cityInput.value = btn.dataset.city;
            cityCodeInput.value = btn.dataset.code;
            citySuggest.innerHTML = "";
            pvzCode.value = "";
            pvzAddress.value = "";
            pvzSelected.textContent = "Пункт выдачи не выбран";
            loadPvz(btn.dataset.code);
            calculateDelivery();
          });
        });
      } catch {
        citySuggest.innerHTML = "";
      }
    }, 250);
  });

  document.getElementById("openCdekWidget")?.addEventListener("click", async () => {
    if (!cityCodeInput.value) {
      window.NMP_toast("Сначала выберите город получения");
      cityInput.focus();
      return;
    }
    await loadPvz(cityCodeInput.value, { showMap: true });
    mapBox?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const lines = cartLines();
    if (!lines.length) return;
    if (!cityCodeInput.value || !pvzCode.value || !pvzAddress.value) {
      window.NMP_toast("Выберите город и пункт выдачи СДЭК");
      return;
    }

    const profile = {
      lastName: form.lastName.value.trim(),
      firstName: form.firstName.value.trim(),
      middleName: form.middleName.value.trim(),
      phone: form.phone.value.trim(),
      email: form.email.value.trim(),
      city: cityInput.value.trim(),
      cityCode: cityCodeInput.value
    };
    Store.ensureUser(profile);

    payBtn.disabled = true;
    payBtn.textContent = "Создаём заказ…";

    try {
      const created = await api("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          ...profile,
          pvzCode: pvzCode.value,
          pvzAddress: pvzAddress.value,
          tariffCode: Number(tariffCodeInput.value || 136),
          deliverySum: Number(deliveryInfo.dataset.sum || 0),
          comment: form.comment.value.trim(),
          items: lines.map((l) => ({ productId: l.productId, qty: l.qty }))
        })
      });

      const order = created.order;
      Store.createOrder({
        id: order.id,
        ...profile,
        items: order.items,
        total: order.total,
        goodsTotal: order.goodsTotal,
        deliverySum: order.deliverySum,
        city: order.city,
        cityCode: order.cityCode,
        pvzCode: order.pvzCode,
        pvzAddress: order.pvzAddress,
        tariffCode: order.tariffCode,
        comment: order.comment,
        paymentStatus: order.paymentStatus,
        status: order.status,
        shipByAt: order.shipByAt,
        cdek: order.cdek
      });

      payBtn.textContent = "Переход к оплате…";
      const pay = await api("/api/payments/create", {
        method: "POST",
        body: JSON.stringify({ orderId: order.id })
      });

      Store.clearCart();

      if (pay.mode === "demo" || !pay.confirmationUrl?.includes("yookassa")) {
        // Демо: сразу подтверждаем оплату на сервере
        if (pay.mode === "demo") {
          const demo = await api(`/api/payments/demo/${encodeURIComponent(order.id)}`, {
            method: "POST",
            body: "{}"
          });
          Store.updateOrder(order.id, {
            paymentStatus: demo.order.paymentStatus,
            status: demo.order.status,
            paidAt: demo.order.paidAt,
            shipByAt: demo.order.shipByAt,
            cdek: demo.order.cdek
          });
          window.NMP_toast("Демо-оплата прошла, заказ в сборке");
          window.location.href = `account.html?order=${encodeURIComponent(order.id)}`;
          return;
        }
      }

      if (pay.confirmationUrl) {
        window.location.href = pay.confirmationUrl;
        return;
      }

      window.location.href = `account.html?order=${encodeURIComponent(order.id)}`;
    } catch (error) {
      window.NMP_toast(error.message || "Не удалось оформить заказ");
      payBtn.disabled = false;
      payBtn.textContent = "Оплатить через ЮKassa";
    }
  });

  api("/api/config/public")
    .then((cfg) => {
      publicConfig = cfg;
      window.NMP_CONFIG.cdek = { ...window.NMP_CONFIG.cdek, ...cfg };
      window.NMP_CONFIG.yookassa = {
        ...window.NMP_CONFIG.yookassa,
        shopId: cfg.payments?.shopId || "",
        mode: cfg.payments?.mode || "demo"
      };
      if (cfg.payments?.mode === "yookassa") {
        payBtn.textContent = "Оплатить через ЮKassa";
      } else {
        payBtn.textContent = "Оплатить (демо) и создать заказ";
      }
    })
    .catch(() => {
      deliveryInfo.textContent =
        "Сервер не запущен. Выполните npm start и откройте сайт через http://localhost:3000";
    })
    .finally(() => {
      renderSummary();
      if (cityCodeInput.value) {
        loadPvz(cityCodeInput.value, { showMap: false });
        calculateDelivery();
      }
    });
})();

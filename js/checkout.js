(() => {
  const Store = window.NMP_Store;
  const params = new URLSearchParams(window.location.search);
  const buyId = params.get("buy");
  if (buyId) {
    const product = window.NMP_getProduct?.(buyId);
    if (product && product.availableForOrder === false) {
      window.NMP_toast?.(`«${product.name}» пока недоступен к заказу`);
      window.setTimeout(() => {
        window.location.href = `product.html?id=${encodeURIComponent(product.id)}`;
      }, 400);
    } else {
      Store.addToCart(buyId, 1);
    }
  }

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
  const agreeBox = document.getElementById("agree");
  const mapBox = document.getElementById("cdekWidget");
  const pvzToolbar = document.querySelector(".pvz-toolbar");
  const cdekBlock = document.getElementById("cdekDeliveryBlock");
  const pickupInfo = document.getElementById("pickupInfo");
  const localInfo = document.getElementById("localInfo");
  const statusNote = document.getElementById("checkoutStatusNote");
  let publicConfig = null;
  let pvzMap = null;
  let pvzMarkersLayer = null;
  let latestPvz = [];
  let pvzCollapsed = false;

  const PICKUP_CITY = "Петрозаводск";
  const PICKUP_ADDRESS = "г. Петрозаводск, ул. Университетская 7/3";
  const LOCAL_LABEL = "Адресная доставка по г. Петрозаводску (по договорённости)";

  const getDeliveryMethod = () =>
    form.querySelector('input[name="deliveryMethod"]:checked')?.value || "cdek";

  const deliveryMethodLabel = (method) =>
    ({
      cdek: "Доставка СДЭК",
      pickup: "Самовывоз со склада",
      local: "Адресная доставка по Петрозаводску"
    })[method] || method;

  const setPvzExtrasVisible = (visible) => {
    if (pvzToolbar) pvzToolbar.hidden = !visible;
    if (mapBox && !visible) mapBox.hidden = true;
  };

  const syncDeliveryMethod = () => {
    const method = getDeliveryMethod();
    const isCdek = method === "cdek";
    if (cdekBlock) cdekBlock.hidden = !isCdek;
    if (pickupInfo) pickupInfo.hidden = method !== "pickup";
    if (localInfo) localInfo.hidden = method !== "local";

    if (cityInput) cityInput.required = isCdek;
    if (cityCodeInput) cityCodeInput.required = isCdek;

    if (method === "pickup") {
      if (deliveryInfo) {
        deliveryInfo.dataset.sum = "0";
        deliveryInfo.textContent = "Самовывоз · доставка 0 ₽ · отгрузка по договорённости";
      }
      if (statusNote) {
        statusNote.textContent =
          "После оплаты согласуем дату самовывоза со склада: г. Петрозаводск, ул. Университетская 7/3.";
      }
    } else if (method === "local") {
      if (deliveryInfo) {
        deliveryInfo.dataset.sum = "0";
        deliveryInfo.textContent = "Адресная доставка по Петрозаводску · по договорённости · 0 ₽ в заказе";
      }
      if (statusNote) {
        statusNote.textContent =
          "После оплаты свяжемся с вами, чтобы согласовать адресную доставку по Петрозаводску.";
      }
    } else if (statusNote) {
      statusNote.textContent =
        "После оплаты в личном кабинете статусы: сборка → отправка (сдача в СДЭК) → прибыл для получения.";
    }

    renderSummary();
  };

  const syncPayButton = () => {
    const hasCart = cartLines().length > 0;
    const agreed = Boolean(agreeBox?.checked);
    payBtn.disabled = !(hasCart && agreed);
  };

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
        if (!product || product.availableForOrder === false) return null;
        return product ? { ...line, product, sum: product.price * line.qty } : null;
      })
      .filter(Boolean);

  const renderSummary = () => {
    const lines = cartLines();
    if (!lines.length) {
      summaryEl.innerHTML = `<h2>Корзина пуста</h2><p class="lead">Выберите изделие в каталоге.</p><a class="btn btn-primary" href="index.html#catalog">К изделиям</a>`;
      syncPayButton();
      return;
    }
    const total = lines.reduce((s, l) => s + l.sum, 0);
    const method = getDeliveryMethod();
    const delivery = method === "cdek" ? Number(deliveryInfo?.dataset?.sum || 0) : 0;
    const deliveryTitle = deliveryMethodLabel(method);
    const deliveryValue =
      method === "cdek"
        ? delivery
          ? window.NMP_formatPrice(delivery)
          : "—"
        : "0 ₽ · по договорённости";
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
      <div class="summary-total"><span>${deliveryTitle}</span><strong id="deliverySumLabel">${deliveryValue}</strong></div>
      <div class="summary-total"><span>Итого</span><strong>${window.NMP_formatPrice(total + delivery)}</strong></div>
      ${
        method === "pickup"
          ? `<p class="form-note">Самовывоз: ${PICKUP_ADDRESS}. Отгрузка по предварительной договорённости.</p>`
          : method === "local"
            ? `<p class="form-note">${LOCAL_LABEL}. Укажите адрес в комментарии.</p>`
            : `<p class="form-note">Отправка из ${publicConfig?.fromCity || "Петрозаводска"}, ${
                publicConfig?.fromAddress || "Лесной проспект 47"
              }</p>`
      }
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
    syncPayButton();
  };

  const calculateDelivery = async () => {
    if (getDeliveryMethod() !== "cdek") return;
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

  let latestCities = [];

  const buildPvzItemContent = (item, { selected = false } = {}) => {
    const title = document.createElement("strong");
    title.className = "pvz-item-code";
    title.textContent = selected
      ? "Выбран ПВЗ · " + (item.code || "")
      : item.code || "ПВЗ";

    const addr = document.createElement("span");
    addr.className = "pvz-item-addr";
    addr.textContent = item.address || item.name || "";

    const meta = document.createElement("span");
    meta.className = "pvz-item-meta";
    const bits = [];
    if (item.work_time) bits.push(item.work_time);
    if (item.type) bits.push(String(item.type));
    meta.textContent = bits.join(" · ");
    if (!meta.textContent) meta.hidden = true;

    return [title, addr, meta];
  };

  const renderSelectedPvz = (item) => {
    pvzList.replaceChildren();
    const selected = document.createElement("div");
    selected.className = "pvz-item active pvz-item-selected";
    selected.append(...buildPvzItemContent(item, { selected: true }));
    pvzList.appendChild(selected);

    const changeBtn = document.createElement("button");
    changeBtn.type = "button";
    changeBtn.className = "btn btn-ghost pvz-change-btn";
    changeBtn.textContent = "Изменить пункт выдачи";
    changeBtn.addEventListener("click", () => {
      pvzCollapsed = false;
      pvzCode.value = "";
      pvzAddress.value = "";
      pvzSelected.textContent = "Пункт выдачи не выбран — выберите из списка ниже";
      setPvzExtrasVisible(true);
      renderPvzList(latestPvz);
    });
    pvzList.appendChild(changeBtn);
  };

  const selectPvz = (item) => {
    if (!item) return;
    pvzCode.value = String(item.code || "");
    pvzAddress.value = String(item.address || item.name || "");
    pvzSelected.textContent = "Выбрано: " + pvzAddress.value;
    pvzSelected.style.color = "#f3f1ec";
    pvzCollapsed = true;
    setPvzExtrasVisible(false);
    renderSelectedPvz(item);
    calculateDelivery();
    window.NMP_toast?.("ПВЗ выбран: " + item.code);
  };

  const renderPvzList = (list) => {
    pvzList.replaceChildren();
    if (!list.length) {
      const empty = document.createElement("p");
      empty.className = "form-note";
      empty.textContent = "В этом городе пока нет доступных ПВЗ";
      pvzList.appendChild(empty);
      return;
    }

    if (pvzCollapsed && pvzCode.value) {
      const selected = list.find((item) => String(item.code) === pvzCode.value);
      if (selected) {
        renderSelectedPvz(selected);
        return;
      }
    }

    const hint = document.createElement("p");
    hint.className = "form-note";
    hint.textContent = `Найдено ПВЗ: ${list.length}. Нажмите на пункт ниже, чтобы выбрать.`;
    pvzList.appendChild(hint);

    list.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pvz-item";
      btn.dataset.code = String(item.code || "");
      btn.append(...buildPvzItemContent(item));
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        selectPvz(item);
      });
      pvzList.appendChild(btn);
    });
  };

  const showOsmMap = (list) => {
    if (!window.L || !mapBox) return;
    const mapEl = document.getElementById("pvzMap");
    if (!mapEl) return;

    mapBox.hidden = false;
    const points = list.filter((p) => Number(p.latitude) && Number(p.longitude));

    if (!pvzMap) {
      pvzMap = window.L.map(mapEl, {
        scrollWheelZoom: false,
        tapTolerance: 25
      });
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
      const popup = document.createElement("div");
      popup.className = "pvz-popup";
      popup.innerHTML = `<strong></strong><div class="addr"></div><div class="time"></div>`;
      popup.querySelector("strong").textContent = item.code || "";
      popup.querySelector(".addr").textContent = item.address || "";
      popup.querySelector(".time").textContent = item.work_time || "";
      const pick = document.createElement("button");
      pick.type = "button";
      pick.textContent = "Выбрать этот ПВЗ";
      pick.addEventListener("click", () => {
        selectPvz(item);
        marker.closePopup();
      });
      popup.appendChild(pick);
      marker.bindPopup(popup);
      marker.on("click", () => selectPvz(item));
      marker.addTo(pvzMarkersLayer);
    });

    window.setTimeout(() => {
      pvzMap.invalidateSize();
      if (bounds.length) pvzMap.fitBounds(bounds, { padding: [28, 28], maxZoom: 14 });
      else pvzMap.setView([61.7849, 34.3469], 11);
    }, 120);
  };

  const applyCity = (city) => {
    if (!city) return;
    cityInput.value = city.city || cityInput.value;
    cityCodeInput.value = String(city.code || "");
    citySuggest.replaceChildren();
    pvzCollapsed = false;
    pvzCode.value = "";
    pvzAddress.value = "";
    pvzSelected.textContent = "Пункт выдачи не выбран — выберите из списка ниже";
    setPvzExtrasVisible(true);
    loadPvz(cityCodeInput.value, { showMap: false });
    calculateDelivery();
  };

  agreeBox?.addEventListener("change", () => {
    syncPayButton();
  });

  const loadPvz = async (cityCode, { showMap = false } = {}) => {
    if (!cityCode) {
      pvzList.innerHTML = `<p class="form-note">Сначала выберите город из подсказки</p>`;
      return;
    }
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
      // На мобильных сразу показываем список, чтобы можно было выбрать без карты
      pvzList.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
      pvzList.innerHTML = "";
      const err = document.createElement("p");
      err.className = "form-note";
      err.textContent = "Ошибка загрузки ПВЗ: " + error.message;
      pvzList.appendChild(err);
    }
  };

  let suggestTimer = null;
  cityInput.addEventListener("input", () => {
    window.clearTimeout(suggestTimer);
    cityCodeInput.value = "";
    suggestTimer = window.setTimeout(async () => {
      const q = cityInput.value.trim();
      if (q.length < 2) {
        citySuggest.replaceChildren();
        latestCities = [];
        return;
      }
      try {
        const cities = await api(`/api/cdek/cities?q=${encodeURIComponent(q)}`);
        latestCities = Array.isArray(cities) ? cities : [];
        citySuggest.replaceChildren();
        latestCities.forEach((c) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "suggest-item";
          btn.textContent = c.city + (c.region ? ", " + c.region : "");
          btn.addEventListener("click", () => applyCity(c));
          citySuggest.appendChild(btn);
        });
      } catch {
        citySuggest.replaceChildren();
        latestCities = [];
      }
    }, 250);
  });

  // Если пользователь не нажал подсказку — берём первый точный/ближайший город
  cityInput.addEventListener("change", () => {
    if (cityCodeInput.value || !latestCities.length) return;
    const q = cityInput.value.trim().toLowerCase();
    const exact = latestCities.find((c) => String(c.city || "").toLowerCase() === q);
    applyCity(exact || latestCities[0]);
  });

  document.getElementById("openCdekWidget")?.addEventListener("click", async () => {
    if (!cityCodeInput.value) {
      window.NMP_toast("Сначала выберите город получения из подсказки");
      cityInput.focus();
      return;
    }
    await loadPvz(cityCodeInput.value, { showMap: true });
    // Список важнее карты для выбора
    pvzList.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const lines = cartLines();
    if (!lines.length) return;
    if (!agreeBox?.checked) {
      window.NMP_toast("Подтвердите согласие с политикой конфиденциальности");
      syncPayButton();
      return;
    }

    const method = getDeliveryMethod();
    let city = cityInput.value.trim();
    let cityCode = cityCodeInput.value;
    let nextPvzCode = pvzCode.value;
    let nextPvzAddress = pvzAddress.value;
    let nextTariff = Number(tariffCodeInput.value || 136);
    let nextDeliverySum = Number(deliveryInfo.dataset.sum || 0);

    if (method === "cdek") {
      if (!cityCode || !nextPvzCode || !nextPvzAddress) {
        window.NMP_toast("Выберите город и пункт выдачи СДЭК");
        return;
      }
    } else if (method === "pickup") {
      city = PICKUP_CITY;
      cityCode = String(publicConfig?.fromCityCode || cityCode || "450");
      nextPvzCode = "PICKUP";
      nextPvzAddress = PICKUP_ADDRESS;
      nextTariff = 0;
      nextDeliverySum = 0;
    } else if (method === "local") {
      city = PICKUP_CITY;
      cityCode = String(publicConfig?.fromCityCode || cityCode || "450");
      nextPvzCode = "LOCAL";
      nextPvzAddress = LOCAL_LABEL;
      nextTariff = 0;
      nextDeliverySum = 0;
      if (!form.comment.value.trim()) {
        window.NMP_toast("Укажите адрес доставки в комментарии к заказу");
        form.comment.focus();
        return;
      }
    }

    const profile = {
      lastName: form.lastName.value.trim(),
      firstName: form.firstName.value.trim(),
      middleName: form.middleName.value.trim(),
      phone: form.phone.value.trim(),
      email: form.email.value.trim(),
      city,
      cityCode
    };
    Store.ensureUser(profile);

    payBtn.disabled = true;
    payBtn.textContent = "Создаём заказ…";

    try {
      const created = await api("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          ...profile,
          deliveryMethod: method,
          pvzCode: nextPvzCode,
          pvzAddress: nextPvzAddress,
          tariffCode: nextTariff,
          deliverySum: nextDeliverySum,
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
        deliveryMethod: order.deliveryMethod || method,
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
      payBtn.textContent =
        publicConfig?.payments?.mode === "yookassa"
          ? "Оплатить через ЮKassa"
          : "Оплатить (демо) и создать заказ";
      syncPayButton();
    }
  });

  form.querySelectorAll('input[name="deliveryMethod"]').forEach((input) => {
    input.addEventListener("change", () => syncDeliveryMethod());
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
      syncDeliveryMethod();
      syncPayButton();
      if (getDeliveryMethod() === "cdek" && cityCodeInput.value) {
        loadPvz(cityCodeInput.value, { showMap: false });
        calculateDelivery();
      }
    });
})();

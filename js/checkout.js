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
  let publicConfig = null;
  let calcTimer = null;

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
      form.querySelector("button[type=submit]").disabled = true;
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
    form.querySelector("button[type=submit]").disabled = false;
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

  const loadPvz = async (cityCode) => {
    pvzList.innerHTML = `<p class="form-note">Загружаем пункты выдачи СДЭК…</p>`;
    try {
      const list = await api(`/api/cdek/pvz?city_code=${encodeURIComponent(cityCode)}`);
      if (!list.length) {
        pvzList.innerHTML = `<p class="form-note">В этом городе пока нет доступных ПВЗ</p>`;
        return;
      }
      pvzList.innerHTML = list
        .map(
          (item) => `
        <button type="button" class="pvz-item" data-code="${item.code}" data-address="${item.address}">
          <strong>${item.code}</strong>
          <span>${item.address}</span>
          <span>${item.work_time || ""}</span>
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
          calculateDelivery();
        });
      });
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
    const box = document.getElementById("cdekWidget");
    if (!publicConfig) return;
    if (!cityCodeInput.value) {
      window.NMP_toast("Сначала выберите город получения");
      cityInput.focus();
      return;
    }

    if (publicConfig.yandexMapsApiKey && window.CDEKWidget) {
      box.hidden = false;
      box.innerHTML = "";
      // eslint-disable-next-line no-new
      new window.CDEKWidget({
        from: {
          country_code: "RU",
          city: publicConfig.fromCity,
          code: publicConfig.fromCityCode,
          address: publicConfig.fromAddress
        },
        root: "cdekWidget",
        apiKey: publicConfig.yandexMapsApiKey,
        servicePath: publicConfig.servicePath || "/api/cdek/service",
        defaultLocation: cityInput.value,
        lang: "rus",
        currency: "RUB",
        canChoose: true,
        hideDeliveryOptions: { door: true, office: false },
        goods: [
          {
            width: publicConfig.package?.width || 40,
            height: publicConfig.package?.height || 10,
            length: publicConfig.package?.length || 60,
            weight: publicConfig.package?.weight || 8000
          }
        ],
        onChoose(_type, tariff, address) {
          pvzCode.value = address?.code || "";
          pvzAddress.value = address?.address || address?.name || "";
          pvzSelected.textContent = "Выбрано: " + pvzAddress.value;
          if (tariff?.tariff_code) tariffCodeInput.value = tariff.tariff_code;
          calculateDelivery();
        }
      });
    } else {
      window.NMP_toast("Карта доступна после добавления YANDEX_MAPS_API_KEY. Сейчас выберите ПВЗ из списка СДЭК ниже.");
      if (cityCodeInput.value) loadPvz(cityCodeInput.value);
      pvzList.scrollIntoView({ behavior: "smooth", block: "center" });
    }
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

    const goodsTotal = lines.reduce((s, l) => s + l.sum, 0);
    const deliverySum = Number(deliveryInfo.dataset.sum || 0);
    const total = goodsTotal + deliverySum;

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
      goodsTotal,
      deliverySum,
      city: profile.city,
      cityCode: profile.cityCode,
      pvzCode: pvzCode.value,
      pvzAddress: pvzAddress.value,
      tariffCode: Number(tariffCodeInput.value || 136),
      comment: form.comment.value.trim()
    });

    // Демо-оплата (ЮKassa подключается отдельно через shopId + backend)
    Store.updateOrder(order.id, { paymentStatus: "paid", paidAt: new Date().toISOString() });

    try {
      const cdek = await api("/api/cdek/orders", {
        method: "POST",
        body: JSON.stringify({
          number: order.id,
          tariffCode: order.tariffCode || 136,
          toCityCode: Number(profile.cityCode),
          pvzCode: order.pvzCode,
          pvzAddress: order.pvzAddress,
          comment: order.comment,
          recipient: {
            name: `${profile.lastName} ${profile.firstName} ${profile.middleName || ""}`.trim(),
            phone: profile.phone,
            email: profile.email
          },
          items: order.items
        })
      });

      Store.updateOrder(order.id, {
        status: "assembly",
        cdek: {
          ...order.cdek,
          trackNumber: cdek.cdekNumber || "",
          uuid: cdek.uuid || "",
          city: profile.city,
          pvzCode: order.pvzCode,
          pvzAddress: order.pvzAddress,
          stage: cdek.cdekNumber
            ? `Создан в СДЭК · № ${cdek.cdekNumber}`
            : "Заявка создана в СДЭК, номер появится после обработки",
          history: [
            ...(order.cdek?.history || []),
            {
              at: new Date().toISOString(),
              title: "Передано в СДЭК",
              detail: cdek.cdekNumber || cdek.uuid || "Заявка принята"
            }
          ]
        }
      });
      window.NMP_toast("Заказ оплачен и создан в СДЭК");
    } catch (error) {
      Store.updateOrder(order.id, {
        cdek: {
          ...order.cdek,
          stage: "Оплата принята. Создание накладной СДЭК требует проверки данных: " + error.message
        }
      });
      window.NMP_toast("Заказ сохранён. СДЭК: " + error.message);
    }

    Store.clearCart();
    window.location.href = `account.html?order=${order.id}`;
  });

  api("/api/config/public")
    .then((cfg) => {
      publicConfig = cfg;
      window.NMP_CONFIG.cdek = { ...window.NMP_CONFIG.cdek, ...cfg };
    })
    .catch(() => {
      deliveryInfo.textContent =
        "Сервер СДЭК не запущен. Выполните npm start и откройте сайт через http://localhost:3000";
    })
    .finally(() => {
      renderSummary();
      if (cityCodeInput.value) {
        loadPvz(cityCodeInput.value);
        calculateDelivery();
      }
    });
})();

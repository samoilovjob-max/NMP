(() => {
  const Store = window.NMP_Store;
  const root = document.getElementById("accountRoot");
  const params = new URLSearchParams(window.location.search);
  const focusId = params.get("order");
  const paymentReturn = params.get("payment") === "return";
  const payDemo = params.get("pay") === "demo";

  const api = (path, options) =>
    fetch((window.NMP_CONFIG?.apiBase || "") + path, {
      headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
      ...options
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.message || "Ошибка API"), { data, status: res.status });
      return data;
    });

  const lookupFormHtml = () => `
    <form class="account-lookup" id="orderLookupForm">
      <h3>Найти заказ</h3>
      <p class="form-note">Введите номер заказа и телефон, указанный при оформлении.</p>
      <div class="field-row">
        <div class="field">
          <label for="lookupOrderId">Номер заказа</label>
          <input id="lookupOrderId" name="orderId" required autocomplete="off" />
        </div>
        <div class="field">
          <label for="lookupPhone">Телефон</label>
          <input id="lookupPhone" name="phone" type="tel" required placeholder="+7..." autocomplete="tel" />
        </div>
      </div>
      <button class="btn btn-primary" type="submit">Найти заказ</button>
    </form>`;

  const bindLookupForm = () => {
    const form = document.getElementById("orderLookupForm");
    if (!form) return;
    const phoneInput = form.querySelector("#lookupPhone");
    if (phoneInput && typeof window.NMP_bindPhoneMask === "function") {
      window.NMP_bindPhoneMask(phoneInput);
    }
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const orderId = String(form.orderId.value || "").trim();
      const phoneRaw = String(form.phone.value || "").trim();
      const phone =
        typeof window.NMP_normalizePhone === "function"
          ? window.NMP_normalizePhone(phoneRaw)
          : phoneRaw;
      if (!orderId || !phoneRaw) {
        window.NMP_toast("Укажите номер заказа и телефон");
        return;
      }
      try {
        const qs = new URLSearchParams({
          orderId,
          phone: phone ? `+${phone}` : phoneRaw
        });
        const data = await api(`/api/orders/lookup?${qs.toString()}`);
        if (!data.order) throw new Error("Заказ не найден");
        Store.createOrder(data.order);
        if (data.order.customer || data.order.phone) {
          Store.ensureUser?.({
            lastName: data.order.customer?.lastName || data.order.lastName || "",
            firstName: data.order.customer?.firstName || data.order.firstName || "",
            middleName: data.order.customer?.middleName || data.order.middleName || "",
            phone: data.order.customer?.phone || data.order.phone || phoneRaw,
            email: data.order.customer?.email || data.order.email || "",
            city: data.order.city || data.order.customer?.city || "",
            cityCode: data.order.cityCode || data.order.customer?.cityCode || ""
          });
        }
        window.NMP_toast("Заказ найден");
        window.history.replaceState({}, "", `account.html?order=${encodeURIComponent(data.order.id)}`);
        await render();
        document.getElementById(`order-${data.order.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (err) {
        window.NMP_toast(err.message || "Не удалось найти заказ");
      }
    });
  };

  const bindRepayButtons = () => {
    root.querySelectorAll("[data-repay]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const orderId = btn.getAttribute("data-repay");
        btn.disabled = true;
        try {
          const pay = await api("/api/payments/create", {
            method: "POST",
            body: JSON.stringify({ orderId })
          });
          const url = pay.paymentUrl || pay.confirmationUrl;
          if (url) {
            window.location.href = url;
            return;
          }
          window.NMP_toast("Ссылка на оплату недоступна");
        } catch (err) {
          window.NMP_toast(err.message || "Не удалось создать оплату");
        } finally {
          btn.disabled = false;
        }
      });
    });
  };

  const syncFromServer = async (order) => {
    try {
      const live = await api(`/api/payments/status/${encodeURIComponent(order.id)}`);
      if (live.order) {
        return Store.updateOrder(order.id, {
          ...live.order,
          cdek: live.order.cdek
        });
      }
    } catch {
      /* keep local */
    }
    return order;
  };

  const syncCdek = async (order) => {
    const query = order.cdek?.trackNumber || order.cdek?.uuid || order.id;
    if (!query || order.paymentStatus !== "paid") return order;
    try {
      const live = await api(`/api/cdek/track/${encodeURIComponent(query)}`);
      const history = (live.history || []).map((h) => ({
        at: h.date_time,
        title: h.name,
        detail: h.city || ""
      }));
      return Store.updateOrder(order.id, {
        status: live.statusSite || order.status,
        cdek: {
          ...order.cdek,
          trackNumber: live.cdekNumber || order.cdek?.trackNumber || "",
          uuid: live.uuid || order.cdek?.uuid || "",
          stage: live.current?.name || order.cdek?.stage,
          history: history.length ? history : order.cdek?.history || []
        }
      });
    } catch {
      return order;
    }
  };

  const render = async () => {
    if (focusId && payDemo) {
      try {
        const demo = await api(`/api/payments/demo/${encodeURIComponent(focusId)}`, {
          method: "POST",
          body: "{}"
        });
        Store.createOrder({ ...demo.order, id: demo.order.id });
      } catch {
        /* ignore */
      }
    }

    if (focusId && paymentReturn) {
      window.NMP_toast("Проверяем оплату…");
    }

    const user = Store.getUser();
    let orders = Store.getOrders();

    if (focusId && !orders.find((o) => o.id === focusId)) {
      try {
        const remote = await api(`/api/orders/${encodeURIComponent(focusId)}`);
        if (remote.order) Store.createOrder(remote.order);
        orders = Store.getOrders();
      } catch {
        /* ignore */
      }
    }

    orders = await Promise.all(
      orders.map(async (order) => {
        let next = await syncFromServer(order);
        next = await syncCdek(next);
        return next;
      })
    );

    if (!user && !orders.length) {
      root.innerHTML = `
        <div class="account-empty">
          <h2>Пока нет заказов</h2>
          <p class="lead">Личный кабинет появится автоматически после оформления первого заказа.</p>
          ${lookupFormHtml()}
          <a class="btn btn-primary" href="index.html#catalog">Выбрать изделие</a>
        </div>`;
      bindLookupForm();
      return;
    }

    root.innerHTML = `
      <aside class="account-profile">
        <h2>Профиль</h2>
        ${
          user
            ? `<p><strong>${user.lastName || ""} ${user.firstName || ""} ${user.middleName || ""}</strong></p>
               <p>${user.phone || ""}</p>
               <p>${user.email || ""}</p>
               <p>${user.city || ""}</p>`
            : `<p class="lead">Данные появятся после заказа</p>`
        }
        ${lookupFormHtml()}
        <button class="btn btn-ghost" type="button" id="refreshTracking">Обновить статусы</button>
        <a class="btn btn-ghost" href="checkout.html">Перейти в корзину</a>
      </aside>
      <div class="account-orders">
        <h2>Мои заказы</h2>
        ${
          orders.length
            ? orders
                .map((order) => {
                  const active = order.id === focusId ? " active-order" : "";
                  const canRepay =
                    order.paymentStatus !== "paid" && order.paymentStatus !== "canceled";
                  return `
              <article class="order-card${active}" id="order-${order.id}">
                <header>
                  <div>
                    <div class="badge">${Store.statusLabel(order.status)}</div>
                    <h3>Заказ ${order.id}</h3>
                    <p class="form-note">${new Date(order.createdAt).toLocaleString("ru-RU")}</p>
                  </div>
                  <div class="order-total">${window.NMP_formatPrice(order.total)}</div>
                </header>

                <div class="status-track">
                  <div class="step ${order.paymentStatus === "paid" || ["assembly", "shipped", "arrived"].includes(order.status) ? "done" : ""}">Оплата</div>
                  <div class="step ${["assembly", "shipped", "arrived"].includes(order.status) ? "done" : ""}">Сборка</div>
                  <div class="step ${["shipped", "arrived"].includes(order.status) ? "done" : ""}">${
                    order.deliveryMethod === "pickup"
                      ? "К выдаче"
                      : order.deliveryMethod === "local"
                        ? "Доставка"
                        : "Отправка · СДЭК"
                  }</div>
                  <div class="step ${order.status === "arrived" ? "done" : ""}">${
                    order.deliveryMethod === "pickup" || order.deliveryMethod === "local"
                      ? "Получен"
                      : "Прибыл"
                  }</div>
                </div>

                <div class="order-items">
                  ${(order.items || [])
                    .map(
                      (item) => `
                    <div class="summary-line">
                      <img src="${item.image}" alt="" />
                      <div>
                        <strong>${item.name}</strong>
                        <span class="sku-label">Артикул ${item.sku || "—"}</span>
                        <span>${item.qty} × ${window.NMP_formatPrice(item.price)}</span>
                      </div>
                    </div>`
                    )
                    .join("")}
                </div>

                <div class="cdek-box">
                  <h4>${
                    order.deliveryMethod === "pickup"
                      ? "Самовывоз"
                      : order.deliveryMethod === "local"
                        ? "Адресная доставка"
                        : "Доставка и трекинг"
                  }</h4>
                  <p><strong>Способ:</strong> ${
                    order.deliveryMethod === "pickup"
                      ? "Самовывоз со склада"
                      : order.deliveryMethod === "local"
                        ? "Адресная доставка по Петрозаводску"
                        : "СДЭК до ПВЗ"
                  }</p>
                  <p><strong>Этап:</strong> ${order.cdek?.stage || "—"}</p>
                  ${
                    (order.deliveryMethod || "cdek") === "cdek"
                      ? `<p><strong>Трек-номер:</strong> ${
                          order.cdek?.trackNumber || "ожидается после обработки заявки"
                        }</p>
                  <p><strong>ПВЗ:</strong> ${order.pvzAddress || order.cdek?.pvzAddress || "—"}</p>`
                      : `<p><strong>Адрес:</strong> ${
                          order.localAddress || order.pvzAddress || "—"
                        }</p>
                  ${
                    order.deliveryMethod === "pickup"
                      ? `<p class="form-note">Отгрузка по предварительной договорённости. Мы свяжемся с вами после оплаты.</p>`
                      : `<p class="form-note">Доставка по городу — по предварительной договорённости. Комментарий: ${
                          order.comment || "—"
                        }</p>`
                  }`
                  }
                  ${
                    order.shipByAt
                      ? `<p><strong>План отгрузки:</strong> до ${new Date(order.shipByAt).toLocaleString("ru-RU")}</p>`
                      : ""
                  }
                  ${
                    order.cdek?.history?.length
                      ? `<ul class="track-history">${order.cdek.history
                          .slice(0, 8)
                          .map(
                            (h) =>
                              `<li><strong>${h.title || ""}</strong><span>${h.detail || ""} ${
                                h.at ? new Date(h.at).toLocaleString("ru-RU") : ""
                              }</span></li>`
                          )
                          .join("")}</ul>`
                      : ""
                  }
                  ${
                    order.cdek?.trackNumber
                      ? `<a class="btn btn-ghost" target="_blank" rel="noopener" href="https://www.cdek.ru/ru/tracking?order_id=${encodeURIComponent(
                          order.cdek.trackNumber
                        )}">Открыть на сайте СДЭК</a>`
                      : ""
                  }
                </div>

                <p class="form-note">Оплата: ${
                  order.paymentStatus === "paid"
                    ? "оплачен"
                    : order.paymentStatus === "canceled"
                      ? "отменена"
                      : "ожидает оплату"
                }</p>
                ${
                  canRepay
                    ? `<button class="btn btn-primary" type="button" data-repay="${order.id}">Оплатить</button>`
                    : ""
                }
              </article>`;
                })
                .join("")
            : `<p class="lead">Заказов пока нет</p>`
        }
      </div>`;

    bindLookupForm();
    bindRepayButtons();

    document.getElementById("refreshTracking")?.addEventListener("click", () => {
      window.NMP_toast("Обновляем статусы…");
      render();
    });
  };

  render().then(() => {
    if (focusId) {
      document.getElementById(`order-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
})();

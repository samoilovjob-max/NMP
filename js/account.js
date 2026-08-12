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
      <p class="form-note">Достаточно одного поля: номер заказа <strong>или</strong> телефон из оформления. Можно указать оба — так надёжнее.</p>
      <div class="field-row">
        <div class="field">
          <label for="lookupOrderId">Номер заказа</label>
          <input id="lookupOrderId" name="orderId" autocomplete="off" placeholder="NMP-…" />
        </div>
        <div class="field">
          <label for="lookupPhone">Телефон</label>
          <input id="lookupPhone" name="phone" type="tel" placeholder="+7..." autocomplete="tel" />
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
      const phoneDigits = String(phone || phoneRaw || "").replace(/\D/g, "");
      if (!orderId && phoneDigits.length < 10) {
        window.NMP_toast("Укажите номер заказа или телефон");
        return;
      }
      try {
        const qs = new URLSearchParams();
        if (orderId) qs.set("orderId", orderId);
        if (phoneDigits.length >= 10) {
          qs.set("phone", phone ? `+${phone}` : phoneRaw);
        }
        const data = await api(`/api/orders/lookup?${qs.toString()}`);
        const found = Array.isArray(data.orders) && data.orders.length
          ? data.orders
          : data.order
            ? [data.order]
            : [];
        if (!found.length) throw new Error("Заказ не найден");

        found.forEach((order) => Store.createOrder(order));
        const primary = found[0];
        if (primary.customer || primary.phone) {
          Store.ensureUser?.({
            lastName: primary.customer?.lastName || primary.lastName || "",
            firstName: primary.customer?.firstName || primary.firstName || "",
            middleName: primary.customer?.middleName || primary.middleName || "",
            phone: primary.customer?.phone || primary.phone || phoneRaw,
            email: primary.customer?.email || primary.email || "",
            city: primary.city || primary.customer?.city || "",
            cityCode: primary.cityCode || primary.customer?.cityCode || ""
          });
        }
        window.NMP_toast(
          found.length > 1 ? `Найдено заказов: ${found.length}` : "Заказ найден"
        );
        window.history.replaceState({}, "", `account.html?order=${encodeURIComponent(primary.id)}`);
        await render();
        document.getElementById(`order-${primary.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  const bindTelegramButtons = () => {
    root.querySelectorAll("[data-tg-link]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const orderId = btn.getAttribute("data-tg-link");
        btn.disabled = true;
        try {
          const data = await api(`/api/orders/${encodeURIComponent(orderId)}/telegram-link`);
          if (!data.url) throw new Error("Ссылка недоступна");
          window.open(data.url, "_blank", "noopener");
          window.NMP_toast(
            data.linked
              ? "Бот уже привязан — можно проверить сообщения"
              : "Откройте бота и нажмите Start — привяжем уведомления"
          );
        } catch (err) {
          window.NMP_toast(err.message || "Не удалось получить ссылку Telegram");
        } finally {
          btn.disabled = false;
        }
      });
    });
  };

  const canCustomerCancel = (order) => {
    if (!order || order.status === "cancelled") return false;
    if (["shipped", "arrived"].includes(order.status)) return false;
    if (order.status === "pending_payment") return true;
    if (order.status === "assembly" && !(order.cdek?.trackNumber || order.cdek?.uuid)) return true;
    return false;
  };

  const bindCancelButtons = () => {
    root.querySelectorAll("[data-cancel-order]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const orderId = btn.getAttribute("data-cancel-order");
        const ok = window.confirm(
          `Отменить заказ ${orderId}? Если оплата уже прошла, мы свяжемся по возврату.`
        );
        if (!ok) return;
        btn.disabled = true;
        try {
          const user = Store.getUser?.() || {};
          const data = await api(`/api/orders/${encodeURIComponent(orderId)}/cancel`, {
            method: "POST",
            body: JSON.stringify({
              phone: user.phone || "",
              reason: "Отмена покупателем из личного кабинета"
            })
          });
          if (data.order) Store.createOrder(data.order);
          window.NMP_toast("Заказ отменён");
          await render();
        } catch (err) {
          window.NMP_toast(err.message || "Не удалось отменить заказ");
          btn.disabled = false;
        }
      });
    });
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
          <p class="lead">Личный кабинет появится после оформления заказа. Здесь же статусы доставки и подключение уведомлений в Telegram.</p>
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
                ${
                  canCustomerCancel(order)
                    ? `<button class="btn btn-ghost" type="button" data-cancel-order="${order.id}">Отменить заказ</button>`
                    : ""
                }
                <button class="btn btn-ghost tg-link-btn" type="button" data-tg-link="${order.id}">
                  ${order.telegramLinked ? "Telegram подключён · открыть бота" : "Статус в Telegram"}
                </button>
              </article>`;
                })
                .join("")
            : `<p class="lead">Заказов пока нет</p>`
        }
      </div>`;

    bindLookupForm();
    bindRepayButtons();
    bindTelegramButtons();
    bindCancelButtons();

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

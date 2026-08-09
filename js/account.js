(() => {
  const Store = window.NMP_Store;
  const root = document.getElementById("accountRoot");
  const params = new URLSearchParams(window.location.search);
  const focusId = params.get("order");

  const api = (path) =>
    fetch((window.NMP_CONFIG?.apiBase || "") + path).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.message || "Ошибка API"), { data, status: res.status });
      return data;
    });

  const syncLive = async (order) => {
    const query = order.cdek?.trackNumber || order.cdek?.uuid || order.id;
    if (!query) return Store.syncOrderTracking(order);
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
      return Store.syncOrderTracking(order);
    }
  };

  const render = async () => {
    const user = Store.getUser();
    let orders = Store.getOrders();
    orders = await Promise.all(orders.map((order) => syncLive(order)));

    if (!user && !orders.length) {
      root.innerHTML = `
        <div class="account-empty">
          <h2>Пока нет заказов</h2>
          <p class="lead">Личный кабинет появится автоматически после оформления первого заказа.</p>
          <a class="btn btn-primary" href="index.html#catalog">Выбрать изделие</a>
        </div>`;
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
        <button class="btn btn-ghost" type="button" id="refreshTracking">Обновить статусы СДЭК</button>
        <a class="btn btn-ghost" href="checkout.html">Перейти в корзину</a>
      </aside>
      <div class="account-orders">
        <h2>Мои заказы</h2>
        ${
          orders.length
            ? orders
                .map((order) => {
                  const active = order.id === focusId ? " active-order" : "";
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
                  <div class="step ${["assembly", "shipped", "arrived"].includes(order.status) ? "done" : ""}">Сборка</div>
                  <div class="step ${["shipped", "arrived"].includes(order.status) ? "done" : ""}">Отправка · сдача в СДЭК</div>
                  <div class="step ${order.status === "arrived" ? "done" : ""}">Прибыл для получения</div>
                </div>

                <div class="order-items">
                  ${(order.items || [])
                    .map(
                      (item) => `
                    <div class="summary-line">
                      <img src="${item.image}" alt="" />
                      <div>
                        <strong>${item.name}</strong>
                        <span>${item.qty} × ${window.NMP_formatPrice(item.price)}</span>
                      </div>
                    </div>`
                    )
                    .join("")}
                </div>

                <div class="cdek-box">
                  <h4>СДЭК · живой трекинг</h4>
                  <p><strong>Этап:</strong> ${order.cdek?.stage || "—"}</p>
                  <p><strong>Трек-номер:</strong> ${order.cdek?.trackNumber || "ожидается после обработки заявки"}</p>
                  <p><strong>UUID:</strong> ${order.cdek?.uuid || "—"}</p>
                  <p><strong>ПВЗ:</strong> ${order.pvzAddress || order.cdek?.pvzAddress || "—"}</p>
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
                  order.paymentStatus === "paid" ? "оплачен (ЮKassa / демо)" : "ожидает оплату"
                }</p>
              </article>`;
                })
                .join("")
            : `<p class="lead">Заказов пока нет</p>`
        }
      </div>`;

    document.getElementById("refreshTracking")?.addEventListener("click", () => {
      window.NMP_toast("Обновляем статусы СДЭК…");
      render();
    });
  };

  render().then(() => {
    if (focusId) {
      document.getElementById(`order-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
})();

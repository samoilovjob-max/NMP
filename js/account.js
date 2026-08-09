(() => {
  const Store = window.NMP_Store;
  const root = document.getElementById("accountRoot");
  const params = new URLSearchParams(window.location.search);
  const focusId = params.get("order");

  const render = () => {
    let orders = Store.getOrders().map((order) => Store.syncOrderTracking(order));
    const user = Store.getUser();

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
                  <h4>СДЭК · отслеживание</h4>
                  <p><strong>Этап:</strong> ${order.cdek?.stage || "—"}</p>
                  <p><strong>Трек-номер:</strong> ${order.cdek?.trackNumber || "будет присвоен при сдаче в СДЭК"}</p>
                  <p><strong>ПВЗ:</strong> ${order.pvzAddress || order.cdek?.pvzAddress || "—"}</p>
                  <p class="form-note">При подключении API СДЭК статус подтягивается автоматически из кабинета перевозчика. Сейчас отображается актуальная логика статусов заказа на сайте.</p>
                  ${
                    order.cdek?.trackNumber
                      ? `<a class="btn btn-ghost" target="_blank" rel="noopener" href="https://www.cdek.ru/ru/tracking?order_id=${encodeURIComponent(order.cdek.trackNumber)}">Открыть трекинг СДЭК</a>`
                      : ""
                  }
                </div>

                <p class="form-note">Оплата: ${
                  order.paymentStatus === "paid" ? "оплачен через ЮKassa" : "ожидает оплату / подтверждение ЮKassa"
                }</p>
              </article>`;
                })
                .join("")
            : `<p class="lead">Заказов пока нет</p>`
        }
      </div>`;
  };

  render();
  if (focusId) {
    document.getElementById(`order-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
})();

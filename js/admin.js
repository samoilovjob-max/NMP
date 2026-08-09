(() => {
  const root = document.getElementById("adminRoot");
  const TOKEN_KEY = "nmp_admin_token";

  const getToken = () => sessionStorage.getItem(TOKEN_KEY) || "";
  const setToken = (value) => sessionStorage.setItem(TOKEN_KEY, value);

  const api = (path, options = {}) =>
    fetch((window.NMP_CONFIG?.apiBase || "") + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
        ...(options.headers || {})
      }
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.message || "Ошибка API"), { data, status: res.status });
      return data;
    });

  const money = (value) => window.NMP_formatPrice(Number(value || 0));
  const when = (iso) => (iso ? new Date(iso).toLocaleString("ru-RU") : "—");

  const statusLabel = (status) =>
    ({
      pending_payment: "Ждёт оплату",
      assembly: "Сборка / к отгрузке",
      shipped: "Отправлен",
      arrived: "В ПВЗ",
      cancelled: "Отменён"
    })[status] || status;

  const renderLogin = (error = "") => {
    root.innerHTML = `
      <form class="admin-login" id="adminLogin">
        <h2>Вход в админку</h2>
        <p class="form-note">Токен берётся из <code>ADMIN_TOKEN</code> в файле <code>.env</code>.</p>
        <div class="field">
          <label for="adminToken">ADMIN_TOKEN</label>
          <input id="adminToken" name="token" type="password" required autocomplete="current-password" />
        </div>
        ${error ? `<p class="form-note" style="color:#c45c26">${error}</p>` : ""}
        <button class="btn btn-primary" type="submit">Войти</button>
      </form>`;

    document.getElementById("adminLogin").addEventListener("submit", async (event) => {
      event.preventDefault();
      setToken(event.target.token.value.trim());
      try {
        await load();
      } catch (err) {
        renderLogin(err.message || "Неверный токен");
      }
    });
  };

  const patchOrder = async (id, body) => {
    await api(`/api/admin/orders/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    });
    await load();
  };

  const renderOrders = (payload) => {
    const orders = payload.orders || [];
    const needShip = orders.filter((o) => o.paymentStatus === "paid" && o.status === "assembly");
    const overdue = orders.filter((o) => o.overdue);

    root.innerHTML = `
      <div class="admin-toolbar">
        <div>
          <p class="form-note">SLA отгрузки: ${payload.shipSlaHours || 48} ч после оплаты</p>
          <p><strong>К отгрузке:</strong> ${needShip.length} · <strong>Просрочено:</strong> ${overdue.length}</p>
        </div>
        <div class="admin-actions">
          <button class="btn btn-ghost" type="button" id="adminRefresh">Обновить</button>
          <button class="btn btn-ghost" type="button" id="adminLogout">Выйти</button>
        </div>
      </div>

      <div class="admin-list">
        ${
          orders.length
            ? orders
                .map((order) => {
                  const skus = (order.items || []).map((i) => `${i.sku}×${i.qty}`).join(", ");
                  const names = (order.items || [])
                    .map((i) => `${i.name} (${i.sku}) × ${i.qty}`)
                    .join("<br>");
                  return `
              <article class="admin-order ${order.overdue ? "is-overdue" : ""} ${
                    order.paymentStatus === "paid" && order.status === "assembly" ? "is-ship" : ""
                  }">
                <header>
                  <div>
                    <div class="badge">${statusLabel(order.status)}</div>
                    <h3>${order.id}</h3>
                    <p class="form-note">Создан: ${when(order.createdAt)} · Оплачен: ${when(order.paidAt)}</p>
                  </div>
                  <div class="order-total">${money(order.total)}</div>
                </header>

                <div class="admin-grid">
                  <div>
                    <h4>Товары</h4>
                    <p>${names || "—"}</p>
                    <p class="sku-label">Артикулы: ${skus || "—"}</p>
                  </div>
                  <div>
                    <h4>Клиент</h4>
                    <p>${order.customer?.lastName || ""} ${order.customer?.firstName || ""} ${
                      order.customer?.middleName || ""
                    }</p>
                    <p>${order.customer?.phone || ""}</p>
                    <p>${order.customer?.email || ""}</p>
                  </div>
                  <div>
                    <h4>Отгрузка / СДЭК</h4>
                    <p><strong>Отправить до:</strong> ${when(order.shipByAt)}</p>
                    <p><strong>ПВЗ:</strong> ${order.pvzAddress || "—"}</p>
                    <p><strong>Трек:</strong> ${order.cdek?.trackNumber || "нет"}</p>
                    <p><strong>Этап:</strong> ${order.cdek?.stage || "—"}</p>
                  </div>
                </div>

                <div class="field">
                  <label>Заметка админа</label>
                  <textarea data-notes="${order.id}" rows="2">${order.adminNotes || ""}</textarea>
                </div>

                <div class="admin-actions">
                  <button class="btn btn-ghost" type="button" data-save-notes="${order.id}">Сохранить заметку</button>
                  ${
                    order.paymentStatus !== "paid"
                      ? `<button class="btn btn-primary" type="button" data-mark-paid="${order.id}">Отметить оплаченным</button>`
                      : ""
                  }
                  ${
                    order.paymentStatus === "paid" && !order.cdek?.uuid
                      ? `<button class="btn btn-primary" type="button" data-create-cdek="${order.id}">Создать накладную СДЭК</button>`
                      : ""
                  }
                  ${
                    order.status === "assembly"
                      ? `<button class="btn btn-primary" type="button" data-ship="${order.id}">Отметить: сдан в СДЭК</button>`
                      : ""
                  }
                  ${
                    order.status === "shipped"
                      ? `<button class="btn btn-ghost" type="button" data-arrived="${order.id}">Отметить: прибыл в ПВЗ</button>`
                      : ""
                  }
                </div>
              </article>`;
                })
                .join("")
            : `<p class="lead">Заказов пока нет. Они появятся после оформления на сайте.</p>`
        }
      </div>`;

    document.getElementById("adminRefresh")?.addEventListener("click", () => load());
    document.getElementById("adminLogout")?.addEventListener("click", () => {
      sessionStorage.removeItem(TOKEN_KEY);
      renderLogin();
    });

    root.querySelectorAll("[data-save-notes]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-save-notes");
        const notes = root.querySelector(`[data-notes="${id}"]`)?.value || "";
        await patchOrder(id, { adminNotes: notes });
        window.NMP_toast("Заметка сохранена");
      });
    });
    root.querySelectorAll("[data-mark-paid]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await patchOrder(btn.getAttribute("data-mark-paid"), { markPaid: true });
        window.NMP_toast("Заказ отмечен оплаченным");
      });
    });
    root.querySelectorAll("[data-create-cdek]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await patchOrder(btn.getAttribute("data-create-cdek"), { createCdek: true });
        window.NMP_toast("Накладная СДЭК создана");
      });
    });
    root.querySelectorAll("[data-ship]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await patchOrder(btn.getAttribute("data-ship"), { status: "shipped" });
        window.NMP_toast("Статус: отправлен");
      });
    });
    root.querySelectorAll("[data-arrived]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await patchOrder(btn.getAttribute("data-arrived"), { status: "arrived" });
        window.NMP_toast("Статус: прибыл");
      });
    });
  };

  const load = async () => {
    root.innerHTML = `<p class="form-note">Загружаем заказы…</p>`;
    const data = await api("/api/admin/orders");
    renderOrders(data);
  };

  if (!getToken()) {
    renderLogin();
  } else {
    load().catch((err) => renderLogin(err.message || "Нужен вход"));
  }
})();

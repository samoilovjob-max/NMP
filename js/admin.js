(() => {
  const root = document.getElementById("adminRoot");
  const TOKEN_KEY = "nmp_admin_token";
  let state = {
    tab: "products",
    cms: null,
    orders: null,
    leads: null,
    editingProductId: null,
    orderFilter: "all",
    orderQuery: "",
    expandedOrders: {}
  };

  const normalizeToken = (value) => {
    let token = String(value || "").trim();
    if (/^bearer\s+/i.test(token)) token = token.replace(/^bearer\s+/i, "").trim();
    if (/^admin_token\s*=\s*/i.test(token)) token = token.replace(/^admin_token\s*=\s*/i, "").trim();
    return token;
  };

  const getToken = () => normalizeToken(sessionStorage.getItem(TOKEN_KEY) || "");
  const setToken = (value) => sessionStorage.setItem(TOKEN_KEY, normalizeToken(value));

  const api = (path, options = {}) => {
    const headers = {
      Authorization: `Bearer ${getToken()}`,
      ...(options.headers || {})
    };
    if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
    return fetch((window.NMP_CONFIG?.apiBase || "") + path, {
      ...options,
      headers
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.message || "Ошибка API"), { data, status: res.status });
      return data;
    });
  };

  const money = (value) =>
    typeof window.NMP_formatPrice === "function"
      ? window.NMP_formatPrice(Number(value || 0))
      : new Intl.NumberFormat("ru-RU").format(Number(value || 0)) + " ₽";
  const when = (iso) => (iso ? new Date(iso).toLocaleString("ru-RU") : "—");
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const linesToArray = (text) =>
    String(text || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

  const arrayToLines = (arr) => (Array.isArray(arr) ? arr.join("\n") : "");

  const statusLabel = (status) =>
    ({
      pending_payment: "Ждёт оплату",
      assembly: "Сборка / к отгрузке",
      shipped: "Отправлен",
      arrived: "В ПВЗ",
      cancelled: "Отменён"
    })[status] || status;

  const shell = (inner) => {
    const tabs = [
      ["products", "Товары"],
      ["promotions", "Акции"],
      ["news", "Новости"],
      ["reviews", "Отзывы"],
      ["site", "Тексты сайта"],
      ["leads", "Заявки"],
      ["orders", "Заказы"]
    ];
    return `
      <div class="admin-toolbar">
        <div>
          <h2 style="margin:0">Управление сайтом</h2>
          <p class="form-note">Изменения сразу попадают на витрину и в оплату.</p>
        </div>
        <div class="admin-actions">
          <button class="btn btn-ghost" type="button" id="adminRefresh">Обновить</button>
          <button class="btn btn-ghost" type="button" id="adminLogout">Выйти</button>
        </div>
      </div>
      <nav class="admin-tabs" aria-label="Разделы админки">
        ${tabs
          .map(
            ([id, label]) =>
              `<button type="button" class="admin-tab ${state.tab === id ? "active" : ""}" data-tab="${id}">${label}</button>`
          )
          .join("")}
      </nav>
      <div class="admin-panel">${inner}</div>`;
  };

  const bindShell = () => {
    document.getElementById("adminRefresh")?.addEventListener("click", () => load());
    document.getElementById("adminLogout")?.addEventListener("click", () => {
      sessionStorage.removeItem(TOKEN_KEY);
      renderLogin();
    });
    root.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.tab = btn.getAttribute("data-tab");
        state.editingProductId = null;
        render();
      });
    });
  };

  const deliveryMethodLabel = (method) =>
    ({
      cdek: "Доставка СДЭК",
      pickup: "Самовывоз со склада",
      local: "Адресная доставка по Петрозаводску"
    })[method] || "Доставка СДЭК";

  const paymentLabel = (status) =>
    ({
      paid: "Оплачен",
      pending: "Ждёт оплату",
      waiting_for_capture: "Ждёт списание",
      canceled: "Оплата отменена",
      cancelled: "Оплата отменена"
    })[status] || status || "—";

  const uploadFile = async (file) => {
    const body = new FormData();
    body.append("file", file);
    const data = await api("/api/admin/upload", { method: "POST", body });
    if (data.optimized && data.width) {
      const saved = Math.max(0, Number(data.bytesBefore || 0) - Number(data.bytesAfter || 0));
      const kb = Math.round(saved / 1024);
      window.NMP_toast(
        kb > 0
          ? `Фото оптимизировано (−${kb} КБ, ${data.width}×${data.height})`
          : `Фото подготовлено (${data.width}×${data.height})`
      );
    } else {
      window.NMP_toast("Файл загружен");
    }
    return data.url;
  };

  const bindUploader = (inputId, targetId) => {
    const input = document.getElementById(inputId);
    const target = document.getElementById(targetId);
    if (!input || !target) return;
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        target.value = await uploadFile(file);
      } catch (err) {
        window.NMP_toast(err.message || "Не удалось загрузить");
      }
    });
  };

  /* ---------- Login ---------- */
  const renderLogin = (error = "") => {
    root.innerHTML = `
      <form class="admin-login" id="adminLogin">
        <h2>Вход в админку</h2>
        <p class="form-note">Введите логин и пароль администратора.</p>
        <div class="field">
          <label for="adminLoginName">Логин</label>
          <input id="adminLoginName" name="login" type="text" required autocomplete="username" spellcheck="false" />
        </div>
        <div class="field">
          <label for="adminPassword">Пароль</label>
          <input id="adminPassword" name="password" type="password" required autocomplete="current-password" />
        </div>
        ${error ? `<p class="form-note" style="color:#c45c26">${esc(error)}</p>` : ""}
        <button class="btn btn-primary" type="submit">Войти</button>
      </form>`;
    document.getElementById("adminLogin").addEventListener("submit", async (event) => {
      event.preventDefault();
      const login = String(event.target.login.value || "").trim();
      const password = String(event.target.password.value || "");
      if (!login || !password) {
        renderLogin("Укажите логин и пароль");
        return;
      }
      try {
        const data = await fetch((window.NMP_CONFIG?.apiBase || "") + "/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ login, password })
        }).then(async (res) => {
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(payload.message || "Не удалось войти");
          return payload;
        });
        if (!data?.token) throw new Error("Сервер не вернул сессию");
        setToken(data.token);
        await load();
      } catch (err) {
        sessionStorage.removeItem(TOKEN_KEY);
        renderLogin(err.message || "Неверный логин или пароль");
      }
    });
  };

  /* ---------- Products ---------- */
  const productForm = (p = {}) => {
    const isNew = !p.id;
    return `
      <form class="admin-form" id="productForm">
        <h3>${isNew ? "Новый товар" : "Редактирование: " + esc(p.name || p.id)}</h3>
        <div class="admin-form-grid">
          <div class="field"><label>ID</label><input name="id" value="${esc(p.id || "")}" ${isNew ? "" : "readonly"} required placeholder="5" /></div>
          <div class="field"><label>Артикул (SKU)</label><input name="sku" value="${esc(p.sku || "")}" required /></div>
          <div class="field"><label>Slug (латиница)</label><input name="slug" value="${esc(p.slug || "")}" required /></div>
          <div class="field"><label>Порядок</label><input name="sortOrder" type="number" value="${esc(p.sortOrder ?? 1)}" /></div>
          <div class="field"><label>Название</label><input name="name" value="${esc(p.name || "")}" required /></div>
          <div class="field"><label>Плашка (badge)</label><input name="badge" value="${esc(p.badge || "")}" /></div>
          <div class="field"><label>Цена, ₽</label><input name="price" type="number" min="0" step="1" value="${esc(p.price ?? "")}" required /></div>
          <div class="field"><label>Акционная цена, ₽</label><input name="promoPrice" type="number" min="0" step="1" value="${esc(p.promoPrice ?? "")}" /></div>
          <div class="field"><label>Текст акции на товаре</label><input name="promoLabel" value="${esc(p.promoLabel || "")}" placeholder="−10%" /></div>
          <div class="field check-field"><label><input name="promoActive" type="checkbox" ${p.promoActive ? "checked" : ""}/> Акционная цена активна</label></div>
          <div class="field check-field"><label><input name="active" type="checkbox" ${p.active !== false ? "checked" : ""}/> Показывать на сайте</label></div>
          <div class="field check-field"><label><input name="availableForOrder" type="checkbox" ${
            p.availableForOrder !== false ? "checked" : ""
          }/> Доступен к заказу</label></div>
          <div class="field"><label>Текст, если заказ недоступен</label><input name="availabilityNote" value="${esc(
            p.availabilityNote || ""
          )}" placeholder="Скоро в продаже — оставьте контакты" /></div>
        </div>
        <div class="field"><label>H1 на странице товара</label><input name="h1" value="${esc(p.h1 || "")}" /></div>
        <div class="field"><label>Короткое описание</label><textarea name="short" rows="2">${esc(p.short || "")}</textarea></div>
        <div class="field"><label>Полное описание</label><textarea name="description" rows="5">${esc(p.description || "")}</textarea></div>
        <div class="admin-form-grid">
          <div class="field">
            <label>Главное фото (URL)</label>
            <input name="image" id="productImage" value="${esc(p.image || "")}" required />
            <input type="file" id="productImageFile" accept="image/*" />
          </div>
          <div class="field"><label>Alt главного фото</label><input name="imageAlt" value="${esc(p.imageAlt || "")}" /></div>
        </div>
        <div class="field">
          <label>Галерея — пути к фото (каждый с новой строки)</label>
          <textarea name="gallery" rows="3">${esc(arrayToLines(p.gallery || []))}</textarea>
          <input type="file" id="galleryFile" accept="image/*" />
          <p class="form-note">Выберите файл — путь добавится в список галереи.</p>
        </div>
        <div class="field"><label>Alt галереи (каждый с новой строки)</label><textarea name="galleryAlts" rows="3">${esc(arrayToLines(p.galleryAlts || []))}</textarea></div>
        <div class="field"><label>Характеристики (каждая с новой строки)</label><textarea name="specs" rows="4">${esc(arrayToLines(p.specs || []))}</textarea></div>
        <div class="field"><label>Сценарии применения</label><textarea name="useCases" rows="3">${esc(arrayToLines(p.useCases || []))}</textarea></div>
        <div class="field"><label>Ключевые слова</label><textarea name="keywords" rows="2">${esc(arrayToLines(p.keywords || []))}</textarea></div>
        <div class="field"><label>SEO title</label><input name="seoTitle" value="${esc(p.seoTitle || "")}" /></div>
        <div class="field"><label>SEO description</label><textarea name="seoDescription" rows="2">${esc(p.seoDescription || "")}</textarea></div>
        <div class="field">
          <label>FAQ (формат: вопрос || ответ — каждая пара с новой строки)</label>
          <textarea name="faq" rows="4">${esc(
            (p.faq || []).map((f) => `${f.q || ""} || ${f.a || ""}`).join("\n")
          )}</textarea>
        </div>
        <div class="admin-actions">
          <button class="btn btn-primary" type="submit">Сохранить товар</button>
          <button class="btn btn-ghost" type="button" id="cancelProduct">Отмена</button>
        </div>
      </form>`;
  };

  const readProductForm = (form) => {
    const fd = new FormData(form);
    const faq = linesToArray(fd.get("faq")).map((line) => {
      const [q, ...rest] = line.split("||");
      return { q: (q || "").trim(), a: rest.join("||").trim() };
    });
    const promoPriceRaw = fd.get("promoPrice");
    return {
      id: String(fd.get("id") || "").trim(),
      sku: String(fd.get("sku") || "").trim(),
      slug: String(fd.get("slug") || "").trim(),
      sortOrder: Number(fd.get("sortOrder") || 1),
      name: String(fd.get("name") || "").trim(),
      badge: String(fd.get("badge") || "").trim(),
      price: Number(fd.get("price") || 0),
      promoPrice: promoPriceRaw === "" || promoPriceRaw == null ? null : Number(promoPriceRaw),
      promoLabel: String(fd.get("promoLabel") || "").trim(),
      promoActive: form.promoActive.checked,
      active: form.active.checked,
      availableForOrder: form.availableForOrder.checked,
      availabilityNote: String(fd.get("availabilityNote") || "").trim(),
      h1: String(fd.get("h1") || "").trim(),
      short: String(fd.get("short") || "").trim(),
      description: String(fd.get("description") || "").trim(),
      image: String(fd.get("image") || "").trim(),
      imageAlt: String(fd.get("imageAlt") || "").trim(),
      gallery: linesToArray(fd.get("gallery")),
      galleryAlts: linesToArray(fd.get("galleryAlts")),
      specs: linesToArray(fd.get("specs")),
      useCases: linesToArray(fd.get("useCases")),
      keywords: linesToArray(fd.get("keywords")),
      seoTitle: String(fd.get("seoTitle") || "").trim(),
      seoDescription: String(fd.get("seoDescription") || "").trim(),
      faq
    };
  };

  const renderProducts = () => {
    const products = state.cms?.products || [];
    if (state.editingProductId === "__new__") {
      root.innerHTML = shell(productForm({ active: true, availableForOrder: false, sortOrder: products.length + 1, gallery: [], specs: [], faq: [] }));
      bindShell();
      bindUploader("productImageFile", "productImage");
      document.getElementById("galleryFile")?.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const url = await uploadFile(file);
          const ta = document.querySelector("#productForm textarea[name=gallery]");
          ta.value = (ta.value ? ta.value + "\n" : "") + url;
          window.NMP_toast("Фото добавлено в галерею");
        } catch (err) {
          window.NMP_toast(err.message);
        }
      });
      document.getElementById("cancelProduct")?.addEventListener("click", () => {
        state.editingProductId = null;
        render();
      });
      document.getElementById("productForm")?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const payload = readProductForm(ev.target);
        await api("/api/admin/products", { method: "POST", body: JSON.stringify(payload) });
        window.NMP_toast("Товар создан");
        state.editingProductId = null;
        await load();
      });
      return;
    }

    if (state.editingProductId) {
      const p = products.find((x) => x.id === state.editingProductId);
      if (!p) {
        state.editingProductId = null;
      } else {
        root.innerHTML = shell(productForm(p));
        bindShell();
        bindUploader("productImageFile", "productImage");
        document.getElementById("galleryFile")?.addEventListener("change", async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const url = await uploadFile(file);
            const ta = document.querySelector("#productForm textarea[name=gallery]");
            ta.value = (ta.value ? ta.value + "\n" : "") + url;
            window.NMP_toast("Фото добавлено в галерею");
          } catch (err) {
            window.NMP_toast(err.message);
          }
        });
        document.getElementById("cancelProduct")?.addEventListener("click", () => {
          state.editingProductId = null;
          render();
        });
        document.getElementById("productForm")?.addEventListener("submit", async (ev) => {
          ev.preventDefault();
          const payload = readProductForm(ev.target);
          await api(`/api/admin/products/${encodeURIComponent(p.id)}`, {
            method: "PUT",
            body: JSON.stringify(payload)
          });
          window.NMP_toast("Товар сохранён");
          state.editingProductId = null;
          await load();
        });
        return;
      }
    }

    root.innerHTML = shell(`
      <div class="admin-actions" style="margin-bottom:1rem">
        <button class="btn btn-primary" type="button" id="addProduct">Добавить товар</button>
      </div>
      <div class="admin-table">
        ${products
          .map(
            (p) => `
          <article class="admin-card">
            <img src="${esc(p.image)}" alt="" />
            <div>
              <div class="badge">${
                p.active === false
                  ? "Скрыт"
                  : p.availableForOrder === false
                    ? "Скоро"
                    : p.promoActive
                      ? "Акция"
                      : "К заказу"
              }</div>
              <h3>${esc(p.name)}</h3>
              <p class="sku-label">${esc(p.sku)} · id ${esc(p.id)}</p>
              <p><strong>${money(p.promoActive && p.promoPrice ? p.promoPrice : p.price)}</strong>
                ${p.promoActive && p.promoPrice ? `<span class="form-note">база ${money(p.price)}</span>` : ""}
              </p>
              <p class="form-note">${esc((p.specs || []).slice(0, 2).join(" · "))}</p>
            </div>
            <div class="admin-actions">
              <button class="btn btn-primary" type="button" data-edit-product="${esc(p.id)}">Изменить</button>
              <button class="btn btn-ghost" type="button" data-del-product="${esc(p.id)}">Удалить</button>
            </div>
          </article>`
          )
          .join("") || "<p class='lead'>Товаров пока нет</p>"}
      </div>`);
    bindShell();
    document.getElementById("addProduct")?.addEventListener("click", () => {
      state.editingProductId = "__new__";
      render();
    });
    root.querySelectorAll("[data-edit-product]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.editingProductId = btn.getAttribute("data-edit-product");
        render();
      });
    });
    root.querySelectorAll("[data-del-product]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Удалить товар?")) return;
        await api(`/api/admin/products/${encodeURIComponent(btn.getAttribute("data-del-product"))}`, {
          method: "DELETE"
        });
        window.NMP_toast("Товар удалён");
        await load();
      });
    });
  };

  /* ---------- Generic collection editors ---------- */
  const renderCollection = (key, title, fieldsHtml, toPayload) => {
    const items = state.cms?.[key] || [];
    root.innerHTML = shell(`
      <div class="admin-split">
        <div>
          <h3>${title}</h3>
          <div class="admin-table">
            ${items
              .map(
                (item) => `
              <article class="admin-card compact">
                <div>
                  <h3>${esc(item.title || item.author || item.id)}</h3>
                  <p class="form-note">${esc(item.excerpt || item.text || item.meta || "")}</p>
                  <p class="form-note">${item.published === false || item.active === false ? "Скрыто" : "Опубликовано"}</p>
                </div>
                <div class="admin-actions">
                  <button class="btn btn-ghost" type="button" data-edit-item="${esc(item.id)}">Изменить</button>
                  <button class="btn btn-ghost" type="button" data-del-item="${esc(item.id)}">Удалить</button>
                </div>
              </article>`
              )
              .join("") || "<p class='form-note'>Пока пусто</p>"}
          </div>
        </div>
        <form class="admin-form" id="collectionForm">
          <h3 id="collectionFormTitle">Новая запись</h3>
          <input type="hidden" name="id" id="collectionId" value="" />
          ${fieldsHtml}
          <div class="admin-actions">
            <button class="btn btn-primary" type="submit">Сохранить</button>
            <button class="btn btn-ghost" type="button" id="resetCollection">Очистить форму</button>
          </div>
        </form>
      </div>`);
    bindShell();
    const form = document.getElementById("collectionForm");
    const fill = (item = {}) => {
      form.reset();
      form.id.value = item.id || "";
      document.getElementById("collectionFormTitle").textContent = item.id ? "Редактирование" : "Новая запись";
      Object.keys(item).forEach((k) => {
        const el = form.elements.namedItem(k);
        if (!el) return;
        if (el.type === "checkbox") el.checked = Boolean(item[k]);
        else el.value = item[k] ?? "";
      });
    };
    document.getElementById("resetCollection")?.addEventListener("click", () => fill({}));
    root.querySelectorAll("[data-edit-item]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = items.find((x) => x.id === btn.getAttribute("data-edit-item"));
        if (item) fill(item);
      });
    });
    root.querySelectorAll("[data-del-item]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Удалить запись?")) return;
        await api(`/api/admin/${key}/${encodeURIComponent(btn.getAttribute("data-del-item"))}`, {
          method: "DELETE"
        });
        window.NMP_toast("Удалено");
        await load();
      });
    });
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const payload = toPayload(form);
      if (payload.id) {
        await api(`/api/admin/${key}/${encodeURIComponent(payload.id)}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
      } else {
        delete payload.id;
        await api(`/api/admin/${key}`, { method: "POST", body: JSON.stringify(payload) });
      }
      window.NMP_toast("Сохранено");
      await load();
    });
    bindUploader(`${key}ImageFile`, `${key}Image`);
  };

  const renderNews = () =>
    renderCollection(
      "news",
      "Новости",
      `
      <div class="field"><label>Заголовок</label><input name="title" required /></div>
      <div class="field"><label>Краткий текст</label><textarea name="excerpt" rows="2"></textarea></div>
      <div class="field"><label>Полный текст</label><textarea name="body" rows="4"></textarea></div>
      <div class="field">
        <label>Картинка</label>
        <input name="image" id="newsImage" />
        <input type="file" id="newsImageFile" accept="image/*" />
      </div>
      <div class="field"><label>ID товара для кнопки «Заказать»</label><input name="productId" placeholder="1" /></div>
      <div class="field"><label>Дата публикации</label><input name="publishedAt" type="datetime-local" /></div>
      <div class="field check-field"><label><input name="published" type="checkbox" checked /> Опубликовано</label></div>`,
      (form) => {
        const fd = new FormData(form);
        let publishedAt = String(fd.get("publishedAt") || "");
        if (publishedAt && !publishedAt.endsWith("Z") && publishedAt.length === 16) {
          publishedAt = new Date(publishedAt).toISOString();
        }
        return {
          id: String(fd.get("id") || "").trim(),
          title: String(fd.get("title") || "").trim(),
          excerpt: String(fd.get("excerpt") || "").trim(),
          body: String(fd.get("body") || "").trim(),
          image: String(fd.get("image") || "").trim(),
          productId: String(fd.get("productId") || "").trim(),
          publishedAt: publishedAt || new Date().toISOString(),
          published: form.published.checked
        };
      }
    );

  const renderReviews = () =>
    renderCollection(
      "reviews",
      "Отзывы",
      `
      <div class="field"><label>Автор</label><input name="author" required /></div>
      <div class="field"><label>Подпись (город · товар)</label><input name="meta" /></div>
      <div class="field"><label>Текст отзыва</label><textarea name="text" rows="4" required></textarea></div>
      <div class="field"><label>Оценка (1–5)</label><input name="rating" type="number" min="1" max="5" value="5" /></div>
      <div class="field"><label>Порядок</label><input name="sortOrder" type="number" value="1" /></div>
      <div class="field check-field"><label><input name="published" type="checkbox" checked /> Показывать на сайте</label></div>`,
      (form) => {
        const fd = new FormData(form);
        return {
          id: String(fd.get("id") || "").trim(),
          author: String(fd.get("author") || "").trim(),
          meta: String(fd.get("meta") || "").trim(),
          text: String(fd.get("text") || "").trim(),
          rating: Number(fd.get("rating") || 5),
          sortOrder: Number(fd.get("sortOrder") || 1),
          published: form.published.checked
        };
      }
    );

  const renderPromotions = () =>
    renderCollection(
      "promotions",
      "Акции и спецпредложения",
      `
      <div class="field"><label>Заголовок акции</label><input name="title" required /></div>
      <div class="field"><label>Текст</label><textarea name="text" rows="3"></textarea></div>
      <div class="field"><label>Плашка</label><input name="badge" value="Акция" /></div>
      <div class="field"><label>ID товара (если акция к товару)</label><input name="productId" placeholder="1" /></div>
      <div class="field"><label>Скидка, %</label><input name="discountPercent" type="number" min="0" max="90" value="0" /></div>
      <div class="field">
        <label>Картинка</label>
        <input name="image" id="promotionsImage" />
        <input type="file" id="promotionsImageFile" accept="image/*" />
      </div>
      <div class="field"><label>Начало</label><input name="startsAt" type="datetime-local" /></div>
      <div class="field"><label>Окончание</label><input name="endsAt" type="datetime-local" /></div>
      <div class="field check-field"><label><input name="active" type="checkbox" checked /> Акция активна</label></div>
      <p class="form-note">Чтобы изменить цену товара по акции — откройте товар и задайте «Акционная цена».</p>`,
      (form) => {
        const fd = new FormData(form);
        const norm = (v) => {
          const s = String(v || "");
          if (!s) return "";
          return s.length === 16 ? new Date(s).toISOString() : s;
        };
        return {
          id: String(fd.get("id") || "").trim(),
          title: String(fd.get("title") || "").trim(),
          text: String(fd.get("text") || "").trim(),
          badge: String(fd.get("badge") || "").trim(),
          productId: String(fd.get("productId") || "").trim(),
          discountPercent: Number(fd.get("discountPercent") || 0),
          image: String(fd.get("image") || "").trim(),
          startsAt: norm(fd.get("startsAt")),
          endsAt: norm(fd.get("endsAt")),
          active: form.active.checked
        };
      }
    );

  /* ---------- Site texts ---------- */
  const renderSite = () => {
    const site = state.cms?.site || {};
    const c = site.contacts || {};
    root.innerHTML = shell(`
      <form class="admin-form" id="siteForm">
        <h3>Тексты главной и контакты</h3>
        <div class="field"><label>Заголовок героя (H1)</label><input name="heroTitle" value="${esc(site.heroTitle || "")}" /></div>
        <div class="field"><label>Подзаголовок героя</label><textarea name="heroLead" rows="2">${esc(site.heroLead || "")}</textarea></div>
        <div class="field"><label>Заголовок каталога</label><input name="catalogTitle" value="${esc(site.catalogTitle || "")}" /></div>
        <div class="field"><label>Подзаголовок каталога</label><textarea name="catalogLead" rows="2">${esc(site.catalogLead || "")}</textarea></div>
        <div class="field"><label>Заголовок новостей</label><input name="newsTitle" value="${esc(site.newsTitle || "")}" /></div>
        <div class="field"><label>Подзаголовок новостей</label><input name="newsLead" value="${esc(site.newsLead || "")}" /></div>
        <div class="field"><label>Заголовок отзывов</label><input name="reviewsTitle" value="${esc(site.reviewsTitle || "")}" /></div>
        <div class="field"><label>Подзаголовок отзывов</label><input name="reviewsLead" value="${esc(site.reviewsLead || "")}" /></div>
        <h3>Контакты</h3>
        <div class="admin-form-grid">
          <div class="field"><label>E-mail</label><input name="email" value="${esc(c.email || "")}" /></div>
          <div class="field"><label>Телефон</label><input name="phone" value="${esc(c.phone || "")}" /></div>
          <div class="field"><label>Telegram URL</label><input name="telegram" value="${esc(c.telegram || "")}" /></div>
          <div class="field"><label>WhatsApp URL</label><input name="whatsapp" value="${esc(c.whatsapp || "")}" /></div>
          <div class="field"><label>MAX URL</label><input name="max" value="${esc(c.max || "")}" /></div>
          <div class="field"><label>Instagram URL</label><input name="instagram" value="${esc(c.instagram || "")}" placeholder="https://www.instagram.com/..." /></div>
        </div>
        <button class="btn btn-primary" type="submit">Сохранить тексты</button>
      </form>`);
    bindShell();
    document.getElementById("siteForm")?.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      await api("/api/admin/site", {
        method: "PUT",
        body: JSON.stringify({
          heroTitle: fd.get("heroTitle"),
          heroLead: fd.get("heroLead"),
          catalogTitle: fd.get("catalogTitle"),
          catalogLead: fd.get("catalogLead"),
          newsTitle: fd.get("newsTitle"),
          newsLead: fd.get("newsLead"),
          reviewsTitle: fd.get("reviewsTitle"),
          reviewsLead: fd.get("reviewsLead"),
          contacts: {
            email: fd.get("email"),
            phone: fd.get("phone"),
            telegram: fd.get("telegram"),
            whatsapp: fd.get("whatsapp"),
            max: fd.get("max"),
            instagram: fd.get("instagram")
          }
        })
      });
      window.NMP_toast("Тексты сайта сохранены");
      await load();
    });
  };

  /* ---------- Orders ---------- */
  const patchOrder = async (id, body) => {
    await api(`/api/admin/orders/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    });
    await load();
  };

  const filterOrders = (orders) => {
    const q = String(state.orderQuery || "")
      .trim()
      .toLowerCase();
    return (orders || []).filter((order) => {
      if (state.orderFilter === "ship") {
        if (!(order.paymentStatus === "paid" && order.status === "assembly")) return false;
      } else if (state.orderFilter === "overdue") {
        if (!order.overdue) return false;
      } else if (state.orderFilter === "paid") {
        if (order.paymentStatus !== "paid") return false;
      } else if (state.orderFilter === "pending") {
        if (order.paymentStatus === "paid") return false;
      } else if (state.orderFilter === "shipped") {
        if (!["shipped", "arrived"].includes(order.status)) return false;
      }

      if (!q) return true;
      const hay = [
        order.id,
        order.pvzAddress,
        order.pvzCode,
        order.city,
        order.comment,
        order.cdek?.trackNumber,
        order.customer?.phone,
        order.customer?.email,
        order.customer?.lastName,
        order.customer?.firstName,
        ...(order.items || []).flatMap((i) => [i.sku, i.name])
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  };

  const renderOrderItems = (order) => {
    const items = order.items || [];
    if (!items.length) return "<p>—</p>";
    return `<div class="admin-order-items">${items
      .map((item) => {
        const img = item.image
          ? `<img src="${esc(item.image)}" alt="" loading="lazy" />`
          : `<span class="form-note">нет фото</span>`;
        return `<div class="admin-order-item">
          ${img}
          <div>
            <strong>${esc(item.name || "Товар")}</strong>
            <div class="sku-label">${esc(item.sku || "—")} · ×${esc(item.qty || 1)}</div>
            <div class="form-note">${money(item.price)} / шт</div>
          </div>
          <div class="sum">${money(item.sum ?? Number(item.price || 0) * Number(item.qty || 1))}</div>
        </div>`;
      })
      .join("")}</div>`;
  };

  const renderOrderDetails = (order) => {
    const history = order.cdek?.history || [];
    const open = Boolean(state.expandedOrders[order.id]);
    return `
      <button class="btn btn-ghost" type="button" data-toggle-order="${esc(order.id)}">
        ${open ? "Скрыть подробности" : "Подробнее по заказу"}
      </button>
      <div class="admin-order-details" ${open ? "" : "hidden"} data-order-details="${esc(order.id)}">
        <div class="admin-grid">
          <div>
            <h4>Суммы</h4>
            <div class="admin-money-row"><span>Товары</span><span>${money(order.goodsTotal)}</span></div>
            <div class="admin-money-row"><span>Получение</span><span>${esc(
              deliveryMethodLabel(order.deliveryMethod)
            )}</span></div>
            <div class="admin-money-row"><span>Доставка</span><span>${money(order.deliverySum)}</span></div>
            <div class="admin-money-row total"><span>Итого</span><span>${money(order.total)}</span></div>
            <p class="form-note" style="margin-top:0.55rem">Оплата: ${esc(paymentLabel(order.paymentStatus))}${
              order.paymentId ? ` · ID ${esc(order.paymentId)}` : ""
            }</p>
          </div>
          <div>
            <h4>Доставка / получение</h4>
            <div class="admin-order-meta">
              <div><strong>Способ:</strong> ${esc(deliveryMethodLabel(order.deliveryMethod))}</div>
              <div><strong>Город:</strong> ${esc(order.city || order.customer?.city || "—")} ${
                order.cityCode ? `(код ${esc(order.cityCode)})` : ""
              }</div>
              <div><strong>Адрес / ПВЗ:</strong> ${esc(order.pvzAddress || "—")}</div>
              ${
                (order.deliveryMethod || "cdek") === "cdek"
                  ? `<div><strong>Код ПВЗ:</strong> ${esc(order.pvzCode || "—")}</div>
              <div><strong>Тариф СДЭК:</strong> ${esc(order.tariffCode || "—")}</div>`
                  : ""
              }
              <div><strong>Комментарий клиента:</strong> ${esc(order.comment || "—")}</div>
            </div>
          </div>
          <div>
            <h4>${(order.deliveryMethod || "cdek") === "cdek" ? "СДЭК / трек" : "Статус выдачи"}</h4>
            <div class="admin-order-meta">
              ${
                (order.deliveryMethod || "cdek") === "cdek"
                  ? `<div><strong>UUID:</strong> ${esc(order.cdek?.uuid || "—")}</div>
              <div><strong>Трек:</strong> ${esc(order.cdek?.trackNumber || "нет")}</div>`
                  : ""
              }
              <div><strong>Этап:</strong> ${esc(order.cdek?.stage || "—")}</div>
              <div><strong>Обновлён:</strong> ${when(order.updatedAt)}</div>
            </div>
          </div>
        </div>
        <div>
          <h4>История отгрузки</h4>
          ${
            history.length
              ? `<ul class="admin-history">${history
                  .map(
                    (h) => `<li>
                <strong>${esc(h.title || "Событие")}</strong>
                <span>${when(h.at)}</span>
                ${h.detail ? `<span>${esc(h.detail)}</span>` : ""}
              </li>`
                  )
                  .join("")}</ul>`
              : `<p class="form-note">Пока нет событий по отгрузке.</p>`
          }
        </div>
      </div>`;
  };

  const renderOrders = () => {
    const payload = state.orders || { orders: [] };
    const orders = payload.orders || [];
    const needShip = orders.filter((o) => o.paymentStatus === "paid" && o.status === "assembly");
    const overdue = orders.filter((o) => o.overdue);
    const paid = orders.filter((o) => o.paymentStatus === "paid");
    const pending = orders.filter((o) => o.paymentStatus !== "paid");
    const visible = filterOrders(orders);

    const filters = [
      ["all", `Все (${orders.length})`],
      ["ship", `К отгрузке (${needShip.length})`],
      ["overdue", `Просрочено (${overdue.length})`],
      ["paid", `Оплаченные (${paid.length})`],
      ["pending", `Без оплаты (${pending.length})`],
      ["shipped", "В пути / ПВЗ"]
    ];

    root.innerHTML = shell(`
      <div class="admin-orders-tools">
        <p class="form-note" style="margin:0">SLA отгрузки: ${payload.shipSlaHours || 48} ч. Панель показывает оплату, ПВЗ, трек и историю — удобно вести заказ от сборки до выдачи.</p>
        <div class="admin-orders-stats">
          <span class="admin-stat">Всего: <strong>${orders.length}</strong></span>
          <span class="admin-stat">К отгрузке: <strong>${needShip.length}</strong></span>
          <span class="admin-stat ${overdue.length ? "is-warn" : ""}">Просрочено: <strong>${overdue.length}</strong></span>
          <span class="admin-stat">Оплачено: <strong>${paid.length}</strong></span>
        </div>
        <div class="admin-filter-row">
          ${filters
            .map(
              ([id, label]) =>
                `<button type="button" class="admin-filter ${
                  state.orderFilter === id ? "active" : ""
                }" data-order-filter="${id}">${label}</button>`
            )
            .join("")}
        </div>
        <input class="admin-search" type="search" id="orderSearch" placeholder="Поиск: № заказа, телефон, ФИО, трек, ПВЗ, SKU" value="${esc(
          state.orderQuery
        )}" />
      </div>
      <div class="admin-list">
        ${
          visible.length
            ? visible
                .map((order) => {
                  const fio = [order.customer?.lastName, order.customer?.firstName, order.customer?.middleName]
                    .filter(Boolean)
                    .join(" ");
                  return `
              <article class="admin-order ${order.overdue ? "is-overdue" : ""} ${
                    order.paymentStatus === "paid" && order.status === "assembly" ? "is-ship" : ""
                  }" data-order-card="${esc(order.id)}">
                <header>
                  <div>
                    <div class="admin-order-badges">
                      <span class="admin-pill status">${esc(statusLabel(order.status))}</span>
                      <span class="admin-pill ${
                        order.paymentStatus === "paid" ? "pay-paid" : "pay-pending"
                      }">${esc(paymentLabel(order.paymentStatus))}</span>
                      ${order.overdue ? `<span class="admin-pill warn">Просрочен SLA</span>` : ""}
                      ${
                        order.paymentStatus === "paid" && order.status === "assembly"
                          ? `<span class="admin-pill status">Нужна отгрузка</span>`
                          : ""
                      }
                      ${
                        (order.deliveryMethod || "cdek") !== "cdek"
                          ? `<span class="admin-pill status">${esc(
                              deliveryMethodLabel(order.deliveryMethod)
                            )}</span>`
                          : ""
                      }
                    </div>
                    <h3 style="margin:0.15rem 0">${esc(order.id)}</h3>
                    <p class="form-note">Создан: ${when(order.createdAt)} · Оплачен: ${when(order.paidAt)} · Отправить до: ${when(
                      order.shipByAt
                    )}</p>
                  </div>
                  <div class="order-total">${money(order.total)}</div>
                </header>
                <div class="admin-grid">
                  <div>
                    <h4>Товары</h4>
                    ${renderOrderItems(order)}
                  </div>
                  <div>
                    <h4>Клиент</h4>
                    <div class="admin-order-meta">
                      <div><strong>${esc(fio || "—")}</strong></div>
                      <div>
                        ${esc(order.customer?.phone || "—")}
                        ${
                          order.customer?.phone
                            ? `<button class="btn btn-ghost" type="button" data-copy="${esc(
                                order.customer.phone
                              )}" style="margin-left:0.35rem;padding:0.2rem 0.45rem">Копировать</button>`
                            : ""
                        }
                      </div>
                      <div>${esc(order.customer?.email || "—")}</div>
                      <div>${esc(order.city || order.customer?.city || "")}</div>
                    </div>
                  </div>
                  <div>
                    <h4>Отгрузка / получение</h4>
                    <div class="admin-order-meta">
                      <div><strong>Способ:</strong> ${esc(deliveryMethodLabel(order.deliveryMethod))}</div>
                      <div><strong>${
                        order.deliveryMethod === "pickup"
                          ? "Склад:"
                          : order.deliveryMethod === "local"
                            ? "Доставка:"
                            : "ПВЗ:"
                      }</strong> ${esc(order.pvzAddress || "—")}</div>
                      ${
                        (order.deliveryMethod || "cdek") === "cdek"
                          ? `<div><strong>Код ПВЗ:</strong> ${esc(order.pvzCode || "—")}</div>
                      <div><strong>Трек:</strong> ${esc(order.cdek?.trackNumber || "нет")}</div>
                      <div><strong>Этап:</strong> ${esc(order.cdek?.stage || "—")}</div>`
                          : `<div><strong>Этап:</strong> ${esc(order.cdek?.stage || "—")}</div>
                      <div class="form-note">СДЭК-накладная не нужна — согласуйте выдачу/доставку с клиентом.</div>`
                      }
                    </div>
                  </div>
                </div>
                ${renderOrderDetails(order)}
                <div class="field">
                  <label>Заметка админа</label>
                  <textarea data-notes="${esc(order.id)}" rows="2">${esc(order.adminNotes || "")}</textarea>
                </div>
                <div class="admin-actions">
                  <button class="btn btn-ghost" type="button" data-save-notes="${esc(order.id)}">Сохранить заметку</button>
                  ${
                    order.paymentStatus !== "paid"
                      ? `<button class="btn btn-primary" type="button" data-mark-paid="${esc(
                          order.id
                        )}">Отметить оплаченным</button>`
                      : ""
                  }
                  ${
                    order.paymentStatus === "paid" &&
                    !order.cdek?.uuid &&
                    (order.deliveryMethod || "cdek") === "cdek"
                      ? `<button class="btn btn-primary" type="button" data-create-cdek="${esc(
                          order.id
                        )}">Создать накладную СДЭК</button>`
                      : ""
                  }
                  ${
                    order.status === "assembly"
                      ? `<button class="btn btn-primary" type="button" data-ship="${esc(
                          order.id
                        )}">${
                          order.deliveryMethod === "pickup"
                            ? "Отметить: готов к самовывозу"
                            : order.deliveryMethod === "local"
                              ? "Отметить: выехал к клиенту"
                              : "Отметить: сдан в СДЭК"
                        }</button>`
                      : ""
                  }
                  ${
                    order.status === "shipped"
                      ? `<button class="btn btn-ghost" type="button" data-arrived="${esc(
                          order.id
                        )}">${
                          order.deliveryMethod === "pickup"
                            ? "Отметить: выдан клиенту"
                            : order.deliveryMethod === "local"
                              ? "Отметить: доставлен"
                              : "Отметить: прибыл в ПВЗ"
                        }</button>`
                      : ""
                  }
                </div>
              </article>`;
                })
                .join("")
            : `<p class="lead">${orders.length ? "Нет заказов по текущему фильтру." : "Заказов пока нет."}</p>`
        }
      </div>`);
    bindShell();

    root.querySelectorAll("[data-order-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.orderFilter = btn.getAttribute("data-order-filter") || "all";
        renderOrders();
      });
    });

    const search = document.getElementById("orderSearch");
    let searchTimer = 0;
    search?.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        state.orderQuery = search.value || "";
        renderOrders();
        const again = document.getElementById("orderSearch");
        if (again) {
          again.focus();
          const len = again.value.length;
          again.setSelectionRange(len, len);
        }
      }, 220);
    });

    root.querySelectorAll("[data-toggle-order]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-toggle-order");
        state.expandedOrders[id] = !state.expandedOrders[id];
        renderOrders();
      });
    });

    root.querySelectorAll("[data-copy]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const text = btn.getAttribute("data-copy") || "";
        try {
          await navigator.clipboard.writeText(text);
          window.NMP_toast("Скопировано");
        } catch {
          window.NMP_toast(text);
        }
      });
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

  const renderLeads = () => {
    const list = state.leads || [];
    const fresh = list.filter((l) => l.status === "new").length;
    root.innerHTML = shell(`
      <p class="form-note">Заявки «Сообщить о поступлении» с витрины. Новых: <strong>${fresh}</strong> · Всего: ${list.length}</p>
      <div class="admin-list">
        ${
          list.length
            ? list
                .map((lead) => {
                  return `
              <article class="admin-order ${lead.status === "new" ? "is-ship" : ""}">
                <header>
                  <div>
                    <div class="admin-order-badges">
                      <span class="admin-pill status">${esc(
                        lead.status === "done" ? "Обработана" : lead.status === "new" ? "Новая" : lead.status || "—"
                      )}</span>
                    </div>
                    <h3 style="margin:0.15rem 0">${esc(lead.productName || lead.productId)}</h3>
                    <p class="form-note">${when(lead.createdAt)} · ${esc(lead.productSku || "")} · ${esc(lead.id)}</p>
                  </div>
                </header>
                <div class="admin-order-meta">
                  <div><strong>Имя:</strong> ${esc(lead.name || "—")}</div>
                  <div><strong>Телефон:</strong> ${esc(lead.phone || "—")}</div>
                  <div><strong>E-mail:</strong> ${esc(lead.email || "—")}</div>
                  <div><strong>Комментарий:</strong> ${esc(lead.comment || "—")}</div>
                </div>
                <div class="admin-actions">
                  ${
                    lead.status !== "done"
                      ? `<button class="btn btn-primary" type="button" data-lead-done="${esc(
                          lead.id
                        )}">Отметить обработанной</button>`
                      : `<button class="btn btn-ghost" type="button" data-lead-new="${esc(
                          lead.id
                        )}">Вернуть в новые</button>`
                  }
                </div>
              </article>`;
                })
                .join("")
            : `<p class="lead">Заявок пока нет.</p>`
        }
      </div>`);
    bindShell();
    root.querySelectorAll("[data-lead-done]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await api(`/api/admin/leads/${encodeURIComponent(btn.getAttribute("data-lead-done"))}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "done" })
        });
        window.NMP_toast("Заявка обработана");
        await load();
      });
    });
    root.querySelectorAll("[data-lead-new]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await api(`/api/admin/leads/${encodeURIComponent(btn.getAttribute("data-lead-new"))}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "new" })
        });
        await load();
      });
    });
  };

  const render = () => {
    if (state.tab === "products") return renderProducts();
    if (state.tab === "news") return renderNews();
    if (state.tab === "reviews") return renderReviews();
    if (state.tab === "promotions") return renderPromotions();
    if (state.tab === "site") return renderSite();
    if (state.tab === "leads") return renderLeads();
    return renderOrders();
  };

  const load = async () => {
    root.innerHTML = `<p class="form-note">Загружаем админку…</p>`;
    const [cmsData, ordersData, leadsData] = await Promise.all([
      api("/api/admin/cms"),
      api("/api/admin/orders"),
      api("/api/admin/leads")
    ]);
    state.cms = cmsData;
    state.orders = ordersData;
    state.leads = leadsData.leads || [];
    render();
  };

  if (!getToken()) renderLogin();
  else load().catch((err) => renderLogin(err.message || "Нужен вход"));
})();

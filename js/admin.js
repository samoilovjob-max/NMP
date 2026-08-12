(() => {
  const root = document.getElementById("adminRoot");
  const TOKEN_KEY = "nmp_admin_token";
  let state = {
    tab: "products",
    cms: null,
    orders: null,
    leads: null,
    editingOrderId: null,
    orderFilter: "all",
    orderQuery: "",
    expandedOrders: {},
    exportScope: "paid",
    exportMark: true,
    selectedOrderIds: new Set(),
    selectedLeadIds: new Set()
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

  const tabMeta = {
    products: { label: "Товары", group: "content" },
    news: { label: "Новости", group: "content" },
    reviews: { label: "Отзывы", group: "content" },
    site: { label: "Тексты сайта", group: "content" },
    orders: { label: "Заказы", group: "shop" },
    leads: { label: "Заявки", group: "shop" },
    promotions: { label: "Акции", group: "marketing" }
  };

  const menuIcon = (name) => {
    const icons = {
      products:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v12H4z"/><path d="M8 7V5h8v2"/></svg>',
      news:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h11v16H5z"/><path d="M16 8h3v12h-3"/><path d="M8 8h5M8 12h5M8 16h3"/></svg>',
      reviews:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.2 4.5 5 .7-3.6 3.5.9 5L12 14.8 7.5 16.7l.9-5L4.8 8.2l5-.7z"/></svg>',
      site:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v3H4zM4 10h10v3H4zM4 15h16v3H4z"/></svg>',
      orders:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h15l-1.5 9H7.2L6 7Z"/><path d="M6 7 5 3H2"/><circle cx="9" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/></svg>',
      leads:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="m4 7 8 6 8-6"/></svg>',
      promotions:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12V7h8l6-3v16l-6-3H5z"/><path d="M5 10h8"/></svg>',
      home:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 11 8-7 8 7"/><path d="M6 10v9h12v-9"/></svg>',
      logout:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H5v14h5"/><path d="M13 12H4"/><path d="m16 8 4 4-4 4"/></svg>',
      refresh:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg>'
    };
    return icons[name] || icons.site;
  };

  const setAdminMode = (on) => {
    document.documentElement.classList.add("admin-html");
    document.body.classList.toggle("admin-app", Boolean(on));
    document.body.classList.toggle("admin-login-page", !on);
    if (on) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  };

  const shell = (inner) => {
    const groups = [
      {
        id: "content",
        title: "Контент",
        items: ["products", "news", "reviews", "site"]
      },
      {
        id: "shop",
        title: "Магазин",
        items: ["orders", "leads"]
      },
      {
        id: "marketing",
        title: "Маркетинг",
        items: ["promotions"]
      }
    ];
    const current = tabMeta[state.tab] || tabMeta.products;
    const counts = {
      orders: Array.isArray(state.orders) ? state.orders.length : 0,
      leads: Array.isArray(state.leads) ? state.leads.length : 0,
      products: Array.isArray(state.cms?.products) ? state.cms.products.length : 0
    };

    setAdminMode(true);

    return `
      <aside class="bx-sidebar" aria-label="Меню админки">
        <div class="bx-sidebar-brand">
          <img src="images/logo-mark.webp" alt="" width="36" height="36" />
          <div>
            <strong>NMP Admin</strong>
            <span>Управление сайтом</span>
          </div>
        </div>
        <nav class="bx-menu">
          ${groups
            .map(
              (group) => `
            <div class="bx-menu-group">
              <div class="bx-menu-group-title">${group.title}</div>
              ${group.items
                .map((id) => {
                  const item = tabMeta[id];
                  const count = counts[id];
                  return `
                    <button type="button" class="bx-menu-item ${state.tab === id ? "is-active" : ""}" data-tab="${id}">
                      <span class="bx-menu-icon">${menuIcon(id)}</span>
                      <span class="bx-menu-label">${item.label}</span>
                      ${count ? `<span class="bx-menu-count">${count}</span>` : ""}
                    </button>`;
                })
                .join("")}
            </div>`
            )
            .join("")}
        </nav>
        <div class="bx-sidebar-footer">
          <a class="bx-menu-item bx-menu-link" href="index.html" target="_blank" rel="noopener">
            <span class="bx-menu-icon">${menuIcon("home")}</span>
            <span class="bx-menu-label">Открыть сайт</span>
          </a>
          <button type="button" class="bx-menu-item" id="adminLogout">
            <span class="bx-menu-icon">${menuIcon("logout")}</span>
            <span class="bx-menu-label">Выйти</span>
          </button>
        </div>
      </aside>
      <div class="bx-main">
        <header class="bx-topbar">
          <button type="button" class="bx-menu-toggle" id="adminMenuToggle" aria-label="Меню" aria-expanded="false">
            <span></span><span></span><span></span>
          </button>
          <div class="bx-crumbs">
            <span>Админка</span>
            <span aria-hidden="true">/</span>
            <strong>${current.label}</strong>
          </div>
          <div class="bx-topbar-actions">
            <button class="btn btn-ghost bx-top-btn" type="button" id="adminRefresh">
              <span class="bx-menu-icon">${menuIcon("refresh")}</span>
              Обновить
            </button>
            <a class="btn btn-ghost bx-top-btn" href="index.html" target="_blank" rel="noopener">На сайт</a>
          </div>
        </header>
        <div class="bx-workspace">
          <div class="bx-page-head">
            <h1>${current.label}</h1>
            <p class="form-note">Изменения сразу попадают на витрину и в оплату.</p>
          </div>
          <div class="admin-panel">${inner}</div>
        </div>
      </div>
      <div class="bx-sidebar-backdrop" id="adminSidebarBackdrop" hidden></div>`;
  };

  const bindShell = () => {
    document.getElementById("adminRefresh")?.addEventListener("click", () => load());
    document.getElementById("adminLogout")?.addEventListener("click", () => {
      sessionStorage.removeItem(TOKEN_KEY);
      renderLogin();
    });
    const toggle = document.getElementById("adminMenuToggle");
    const backdrop = document.getElementById("adminSidebarBackdrop");
    const closeMenu = () => {
      document.body.classList.remove("bx-sidebar-open");
      if (toggle) toggle.setAttribute("aria-expanded", "false");
      if (backdrop) backdrop.hidden = true;
    };
    const openMenu = () => {
      document.body.classList.add("bx-sidebar-open");
      if (toggle) toggle.setAttribute("aria-expanded", "true");
      if (backdrop) backdrop.hidden = false;
    };
    toggle?.addEventListener("click", () => {
      if (document.body.classList.contains("bx-sidebar-open")) closeMenu();
      else openMenu();
    });
    backdrop?.addEventListener("click", closeMenu);
    root.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.tab = btn.getAttribute("data-tab");
        state.editingProductId = null;
        closeMenu();
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
    setAdminMode(false);
    root.innerHTML = `
      <div class="bx-login-wrap">
        <form class="admin-login" id="adminLogin">
          <div class="bx-login-brand">
            <img src="images/logo-mark.webp" alt="Northern Magical Place" width="56" height="56" />
            <div>
              <strong>NMP Admin</strong>
              <span>Вход в панель управления</span>
            </div>
          </div>
          <h2>Авторизация</h2>
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
          <a class="form-note" href="index.html">← На сайт</a>
        </form>
      </div>`;
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
        <div class="field"><label>Короткое описание</label><textarea name="short" rows="2" data-rich="product-short" data-rich-label="Карточка товара">${esc(p.short || "")}</textarea></div>
        <div class="field"><label>Полное описание</label><textarea name="description" rows="5" data-rich="product-desc" data-rich-label="Страница товара">${esc(p.description || "")}</textarea></div>
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
        <div class="admin-form-grid">
          <div class="field"><label>Вес упаковки, г</label><input name="packageWeight" type="number" min="0" step="1" value="${esc(p.packageWeight ?? "")}" placeholder="8000" /></div>
          <div class="field"><label>Длина, см</label><input name="packageLength" type="number" min="0" step="1" value="${esc(p.packageLength ?? "")}" placeholder="60" /></div>
          <div class="field"><label>Ширина, см</label><input name="packageWidth" type="number" min="0" step="1" value="${esc(p.packageWidth ?? "")}" placeholder="40" /></div>
          <div class="field"><label>Высота, см</label><input name="packageHeight" type="number" min="0" step="1" value="${esc(p.packageHeight ?? "")}" placeholder="10" /></div>
        </div>
        <p class="form-note">Габариты идут в расчёт СДЭК. Если пусто — берутся значения по умолчанию из .env (PACKAGE_*).</p>
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
      packageWeight: fd.get("packageWeight") === "" ? null : Number(fd.get("packageWeight")),
      packageLength: fd.get("packageLength") === "" ? null : Number(fd.get("packageLength")),
      packageWidth: fd.get("packageWidth") === "" ? null : Number(fd.get("packageWidth")),
      packageHeight: fd.get("packageHeight") === "" ? null : Number(fd.get("packageHeight")),
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
        window.NMP_refreshRichEditors?.(ev.target);
        const payload = readProductForm(ev.target);
        await api("/api/admin/products", { method: "POST", body: JSON.stringify(payload) });
        window.NMP_toast("Товар создан");
        state.editingProductId = null;
        await load();
      });
      window.NMP_mountRichEditors?.(root);
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
          window.NMP_refreshRichEditors?.(ev.target);
          const payload = readProductForm(ev.target);
          await api(`/api/admin/products/${encodeURIComponent(p.id)}`, {
            method: "PUT",
            body: JSON.stringify(payload)
          });
          window.NMP_toast("Товар сохранён");
          state.editingProductId = null;
          await load();
        });
        window.NMP_mountRichEditors?.(root);
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
              .map((item) => {
                const product =
                  key === "reviews" && item.productId
                    ? (state.cms?.products || []).find((p) => String(p.id) === String(item.productId))
                    : null;
                const hiddenOnSite =
                  product && (product.availableForOrder === false || product.active === false);
                return `
              <article class="admin-card compact">
                <div>
                  <h3>${esc(item.title || item.author || item.id)}</h3>
                  <p class="form-note">${esc(
                    String(item.excerpt || item.text || item.meta || "")
                      .replace(/<[^>]+>/g, " ")
                      .replace(/\s+/g, " ")
                      .trim()
                  )}</p>
                  <p class="form-note">${item.published === false || item.active === false ? "Скрыто" : "Опубликовано"}${
                    product ? ` · ${esc(product.name)}` : ""
                  }${hiddenOnSite ? " · не показывается на сайте (товар не в продаже)" : ""}</p>
                </div>
                <div class="admin-actions">
                  <button class="btn btn-ghost" type="button" data-edit-item="${esc(item.id)}">Изменить</button>
                  <button class="btn btn-ghost" type="button" data-del-item="${esc(item.id)}">Удалить</button>
                </div>
              </article>`;
              })
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
      window.NMP_refreshRichEditors?.(form);
    };
    window.NMP_mountRichEditors?.(form);
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
      window.NMP_refreshRichEditors?.(form);
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
    bindUploader(`${key}VideoFile`, `${key}Video`);
  };

  const renderNews = () =>
    renderCollection(
      "news",
      "Новости",
      `
      <div class="field"><label>Заголовок</label><input name="title" required /></div>
      <div class="field"><label>Краткий текст</label><textarea name="excerpt" rows="2" data-rich="news-excerpt" data-rich-label="Карточка новости"></textarea></div>
      <div class="field"><label>Полный текст</label><textarea name="body" rows="4" data-rich="news-body" data-rich-label="Текст новости"></textarea></div>
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

  const renderReviews = () => {
    const products = state.cms?.products || [];
    const productOptions = [
      `<option value="">Без привязки к товару</option>`,
      ...products.map(
        (p) =>
          `<option value="${esc(p.id)}">${esc(p.name)}${
            p.availableForOrder === false ? " (не в продаже)" : ""
          }</option>`
      )
    ].join("");
    return renderCollection(
      "reviews",
      "Отзывы",
      `
      <div class="field"><label>Автор</label><input name="author" required /></div>
      <div class="field"><label>Подпись (город · товар)</label><input name="meta" /></div>
      <div class="field">
        <label>Товар</label>
        <select name="productId">${productOptions}</select>
        <p class="form-note">Отзывы по товарам не в продаже на витрине не показываются.</p>
      </div>
      <div class="field"><label>Текст отзыва</label><textarea name="text" rows="4" required></textarea></div>
      <div class="field"><label>Оценка (1–5)</label><input name="rating" type="number" min="1" max="5" value="5" /></div>
      <div class="field">
        <label>Фото к отзыву</label>
        <input name="image" id="reviewsImage" placeholder="images/..." />
        <input type="file" id="reviewsImageFile" accept="image/*" />
      </div>
      <div class="field">
        <label>Видеоотзыв (URL mp4/webm)</label>
        <input name="video" id="reviewsVideo" placeholder="images/uploads/review.mp4 или https://..." />
        <input type="file" id="reviewsVideoFile" accept="video/mp4,video/webm,video/quicktime" />
        <p class="form-note">Если есть видео — оно показывается вместо фото (фото можно оставить как постер).</p>
      </div>
      <div class="field"><label>Порядок</label><input name="sortOrder" type="number" value="1" /></div>
      <div class="field check-field"><label><input name="published" type="checkbox" checked /> Показывать на сайте</label></div>`,
      (form) => {
        const fd = new FormData(form);
        return {
          id: String(fd.get("id") || "").trim(),
          author: String(fd.get("author") || "").trim(),
          meta: String(fd.get("meta") || "").trim(),
          productId: String(fd.get("productId") || "").trim(),
          text: String(fd.get("text") || "").trim(),
          rating: Number(fd.get("rating") || 5),
          image: String(fd.get("image") || "").trim(),
          video: String(fd.get("video") || "").trim(),
          sortOrder: Number(fd.get("sortOrder") || 1),
          published: form.published.checked
        };
      }
    );
  };

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

  const syncOrder = async (id) => {
    const data = await api(`/api/admin/orders/${encodeURIComponent(id)}/sync`, {
      method: "POST",
      body: JSON.stringify({})
    });
    await load();
    return data;
  };

  const syncAllOrders = async () => {
    const data = await api("/api/admin/orders/sync-all", {
      method: "POST",
      body: JSON.stringify({ limit: 40 })
    });
    await load();
    return data;
  };

  const downloadOrdersFor1c = async (format, ids = []) => {
    const scope = ids.length ? "all" : state.exportScope || "paid";
    const mark = state.exportMark ? "1" : "0";
    const selected = (ids || []).map(String).filter(Boolean);
    const path =
      `/api/admin/orders/export?format=${encodeURIComponent(format)}&scope=${encodeURIComponent(
        scope
      )}&mark=${mark}` + (selected.length ? `&ids=${encodeURIComponent(selected.join(","))}` : "");
    const res = await fetch((window.NMP_CONFIG?.apiBase || "") + path, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Не удалось выгрузить заказы");
    }
    const blob = await res.blob();
    const count = Number(res.headers.get("X-NMP-Export-Count") || 0);
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^"]+)"?/i);
    const filename = match?.[1] || `nmp-orders.${format === "csv" ? "csv" : format === "json" ? "json" : format === "xlsx" || format === "excel" ? "xlsx" : "xml"}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    if (state.exportMark) await load();
    return count;
  };

  const deleteOrder = async (id) => {
    await api(`/api/admin/orders/${encodeURIComponent(id)}`, { method: "DELETE" });
    delete state.expandedOrders[id];
    if (state.editingOrderId === id) state.editingOrderId = null;
    selectedSet("orders").delete(id);
    await load();
  };

  const selectedSet = (kind) => {
    const key = kind === "leads" ? "selectedLeadIds" : "selectedOrderIds";
    if (!(state[key] instanceof Set)) state[key] = new Set();
    return state[key];
  };

  const selectedIds = (kind) => [...selectedSet(kind)];

  const summarizeBulk = (data, word) => {
    const ok = Number(data?.okCount ?? data?.changed ?? data?.deleted ?? 0);
    const fail = Number(data?.failCount ?? 0);
    if (fail) return `${word}: ${ok} успешно, ${fail} с ошибкой`;
    return `${word}: ${ok}`;
  };

  const runOrdersBulk = async (action, extra = {}) => {
    const ids = selectedIds("orders");
    if (!ids.length) {
      window.NMP_toast("Сначала отметьте заказы галочками");
      return;
    }
    const data = await api("/api/admin/orders/bulk", {
      method: "POST",
      body: JSON.stringify({ ids, action, ...extra })
    });
    state.selectedOrderIds = new Set();
    await load();
    return data;
  };

  const runLeadsBulk = async (action, extra = {}) => {
    const ids = selectedIds("leads");
    if (!ids.length) {
      window.NMP_toast("Сначала отметьте заявки галочками");
      return;
    }
    const data = await api("/api/admin/leads/bulk", {
      method: "POST",
      body: JSON.stringify({ ids, action, ...extra })
    });
    state.selectedLeadIds = new Set();
    await load();
    return data;
  };

  const bindSelection = (kind, attr) => {
    const set = selectedSet(kind);
    const boxes = [...root.querySelectorAll(`[${attr}]`)];
    const refresh = () => {
      const countEl = root.querySelector(`[data-selected-count="${kind}"]`);
      const bar = root.querySelector(`[data-bulk-bar="${kind}"]`);
      const selectAll = root.querySelector(`[data-select-all="${kind}"]`);
      const n = set.size;
      if (countEl) countEl.textContent = String(n);
      if (bar) bar.hidden = n === 0;
      boxes.forEach((box) => {
        const id = box.getAttribute(attr);
        const checked = set.has(id);
        box.checked = checked;
        box.closest("article")?.classList.toggle("is-checked", checked);
      });
      if (selectAll) {
        const visibleIds = boxes.map((box) => box.getAttribute(attr));
        selectAll.checked = visibleIds.length > 0 && visibleIds.every((id) => set.has(id));
        selectAll.indeterminate = visibleIds.some((id) => set.has(id)) && !selectAll.checked;
      }
    };
    boxes.forEach((box) => {
      box.addEventListener("change", () => {
        const id = box.getAttribute(attr);
        if (box.checked) set.add(id);
        else set.delete(id);
        refresh();
      });
    });
    root.querySelector(`[data-select-all="${kind}"]`)?.addEventListener("change", (event) => {
      const on = event.target.checked;
      boxes.forEach((box) => {
        const id = box.getAttribute(attr);
        if (on) set.add(id);
        else set.delete(id);
      });
      refresh();
    });
    root.querySelector(`[data-clear-selection="${kind}"]`)?.addEventListener("click", () => {
      set.clear();
      refresh();
    });
    refresh();
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
      } else if (state.orderFilter === "cancelled") {
        if (order.status !== "cancelled") return false;
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

  const renderOrderEditForm = (order) => {
    if (state.editingOrderId !== order.id) return "";
    const c = order.customer || {};
    return `
      <form class="admin-form admin-order-edit" data-edit-order-form="${esc(order.id)}">
        <h4>Редактирование заказа ${esc(order.id)}</h4>
        <div class="admin-form-grid">
          <div class="field"><label>Фамилия</label><input name="lastName" value="${esc(c.lastName || "")}" required /></div>
          <div class="field"><label>Имя</label><input name="firstName" value="${esc(c.firstName || "")}" required /></div>
          <div class="field"><label>Отчество</label><input name="middleName" value="${esc(c.middleName || "")}" /></div>
          <div class="field"><label>Телефон</label><input name="phone" value="${esc(c.phone || "")}" required /></div>
          <div class="field"><label>E-mail</label><input name="email" type="email" value="${esc(c.email || "")}" required /></div>
          <div class="field"><label>Город</label><input name="city" value="${esc(order.city || c.city || "")}" /></div>
          <div class="field"><label>Код города СДЭК</label><input name="cityCode" value="${esc(order.cityCode || "")}" /></div>
          <div class="field">
            <label>Способ получения</label>
            <select name="deliveryMethod">
              <option value="cdek" ${ (order.deliveryMethod || "cdek") === "cdek" ? "selected" : "" }>Доставка СДЭК</option>
              <option value="pickup" ${ order.deliveryMethod === "pickup" ? "selected" : "" }>Самовывоз</option>
              <option value="local" ${ order.deliveryMethod === "local" ? "selected" : "" }>Адресная по Петрозаводску</option>
            </select>
          </div>
          <div class="field"><label>Код ПВЗ</label><input name="pvzCode" value="${esc(order.pvzCode || "")}" /></div>
          <div class="field"><label>Адрес / ПВЗ</label><input name="pvzAddress" value="${esc(order.pvzAddress || "")}" /></div>
          <div class="field"><label>Тариф СДЭК</label><input name="tariffCode" value="${esc(order.tariffCode || "")}" /></div>
          <div class="field"><label>Трек СДЭК</label><input name="trackNumber" value="${esc(order.cdek?.trackNumber || "")}" /></div>
          <div class="field"><label>Сумма товаров, ₽</label><input name="goodsTotal" type="number" min="0" step="1" value="${esc(order.goodsTotal ?? "")}" /></div>
          <div class="field"><label>Доставка, ₽</label><input name="deliverySum" type="number" min="0" step="1" value="${esc(order.deliverySum ?? "")}" /></div>
          <div class="field"><label>Итого, ₽</label><input name="total" type="number" min="0" step="1" value="${esc(order.total ?? "")}" /></div>
          <div class="field">
            <label>Статус заказа</label>
            <select name="status">
              ${["pending_payment", "assembly", "shipped", "arrived", "cancelled"]
                .map(
                  (s) =>
                    `<option value="${s}" ${order.status === s ? "selected" : ""}>${esc(statusLabel(s))}</option>`
                )
                .join("")}
            </select>
          </div>
          <div class="field">
            <label>Статус оплаты</label>
            <select name="paymentStatus">
              ${["pending", "paid", "canceled", "waiting_for_capture"]
                .map(
                  (s) =>
                    `<option value="${s}" ${order.paymentStatus === s ? "selected" : ""}>${esc(paymentLabel(s))}</option>`
                )
                .join("")}
            </select>
          </div>
        </div>
        <div class="field"><label>Комментарий клиента</label><textarea name="comment" rows="2">${esc(order.comment || "")}</textarea></div>
        <div class="field"><label>Заметка админа</label><textarea name="adminNotes" rows="2">${esc(order.adminNotes || "")}</textarea></div>
        <div class="admin-actions">
          <button class="btn btn-primary" type="submit">Сохранить изменения</button>
          <button class="btn btn-ghost" type="button" data-cancel-edit="${esc(order.id)}">Отмена</button>
        </div>
      </form>`;
  };

  const renderOrderDetails = (order) => {
    const history = order.cdek?.history || [];
    const open = Boolean(state.expandedOrders[order.id]);
    const sync = order.lastSync;
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
              <div><strong>Адрес / ПВЗ:</strong> ${esc(
                order.deliveryMethod === "local"
                  ? order.localAddress || order.pvzAddress || order.comment || "—"
                  : order.pvzAddress || "—"
              )}</div>
              ${
                order.deliveryMethod === "pickup"
                  ? `<p class="form-note">Склад самовывоза: Университетская 7/3</p>`
                  : (order.deliveryMethod || "cdek") === "cdek"
                    ? `<p class="form-note">Отправка СДЭК со склада: Лесной пр. 47 (Петрозаводск)</p>`
                    : order.deliveryMethod === "local"
                      ? `<p class="form-note">Адрес доставки: ${esc(
                          order.localAddress || order.comment || order.pvzAddress || "—"
                        )}</p>`
                      : ""
              }
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
            <h4>${(order.deliveryMethod || "cdek") === "cdek" ? "СДЭК / ЮKassa" : "Статус выдачи"}</h4>
            <div class="admin-order-meta">
              ${
                (order.deliveryMethod || "cdek") === "cdek"
                  ? `<div><strong>UUID:</strong> ${esc(order.cdek?.uuid || "—")}</div>
              <div><strong>Трек:</strong> ${esc(order.cdek?.trackNumber || "нет")}</div>`
                  : ""
              }
              <div><strong>Этап:</strong> ${esc(order.cdek?.stage || "—")}</div>
              <div><strong>Обновлён:</strong> ${when(order.updatedAt)}</div>
              <div><strong>Синхронизация:</strong> ${when(sync?.at)}</div>
              ${
                sync?.payment?.status
                  ? `<div><strong>ЮKassa:</strong> ${esc(sync.payment.status)}</div>`
                  : sync?.payment?.error
                    ? `<div><strong>ЮKassa:</strong> ${esc(sync.payment.error)}</div>`
                    : ""
              }
              ${
                sync?.cdek?.name
                  ? `<div><strong>СДЭК сейчас:</strong> ${esc(sync.cdek.name)}${
                      sync.cdek.city ? ` · ${esc(sync.cdek.city)}` : ""
                    }</div>`
                  : sync?.cdek?.error
                    ? `<div><strong>СДЭК:</strong> ${esc(sync.cdek.error)}</div>`
                    : ""
              }
            </div>
          </div>
        </div>
        <div>
          <h4>История отгрузки</h4>
          ${
            history.length
              ? `<ul class="admin-history">${history
                  .slice()
                  .reverse()
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
    const pending = orders.filter((o) => o.paymentStatus !== "paid" && o.status !== "cancelled");
    const arrived = orders.filter((o) => o.status === "arrived");
    const visible = filterOrders(orders);

    const filters = [
      ["all", `Все (${orders.length})`],
      ["ship", `К отгрузке (${needShip.length})`],
      ["overdue", `Просрочено (${overdue.length})`],
      ["paid", `Оплаченные (${paid.length})`],
      ["pending", `Без оплаты (${pending.length})`],
      ["shipped", "В пути / ПВЗ"],
      ["cancelled", "Отменённые"]
    ];

    root.innerHTML = shell(`
      <div class="admin-orders-tools">
        <p class="form-note" style="margin:0">SLA отгрузки: ${payload.shipSlaHours || 48} ч. Кнопка «Синхронизировать статусы» подтягивает оплату из ЮKassa и трек/этап из СДЭК. Дополнительные ТК (Деловые Линии, Яндекс, Ozon, X5) заложены в архитектуре и пока не подключены.</p>
        <div class="admin-orders-stats">
          <span class="admin-stat">Всего: <strong>${orders.length}</strong></span>
          <span class="admin-stat">К отгрузке: <strong>${needShip.length}</strong></span>
          <span class="admin-stat ${overdue.length ? "is-warn" : ""}">Просрочено: <strong>${overdue.length}</strong></span>
          <span class="admin-stat">Оплачено: <strong>${paid.length}</strong></span>
          <span class="admin-stat">В ПВЗ / выдано: <strong>${arrived.length}</strong></span>
        </div>
        <div class="admin-actions" style="margin:0.35rem 0 0.15rem">
          <button class="btn btn-primary" type="button" id="syncAllOrders">Синхронизировать статусы</button>
        </div>
        <div class="admin-export-1c">
          <h4 style="margin:0.6rem 0 0.35rem">Выгрузка заказов</h4>
          <p class="form-note" style="margin:0 0 0.55rem">Excel (.xlsx) — для работы в таблице. CommerceML XML — обмен с 1С. CSV / JSON — дополнительные форматы.</p>
          <div class="admin-filter-row" style="margin-bottom:0.45rem">
            <label class="admin-filter ${state.exportScope === "paid" ? "active" : ""}">
              <input type="radio" name="exportScope" value="paid" ${state.exportScope === "paid" ? "checked" : ""} hidden />
              Оплаченные
            </label>
            <label class="admin-filter ${state.exportScope === "processing" ? "active" : ""}">
              <input type="radio" name="exportScope" value="processing" ${state.exportScope === "processing" ? "checked" : ""} hidden />
              В работе
            </label>
            <label class="admin-filter ${state.exportScope === "new" ? "active" : ""}">
              <input type="radio" name="exportScope" value="new" ${state.exportScope === "new" ? "checked" : ""} hidden />
              Ещё не выгруженные
            </label>
            <label class="admin-filter ${state.exportScope === "all" ? "active" : ""}">
              <input type="radio" name="exportScope" value="all" ${state.exportScope === "all" ? "checked" : ""} hidden />
              Все
            </label>
          </div>
          <div class="admin-actions">
            <button class="btn btn-primary" type="button" data-export-1c="xlsx">Скачать Excel</button>
            <button class="btn btn-ghost" type="button" data-export-1c="commerceml">Скачать XML (CommerceML)</button>
            <button class="btn btn-ghost" type="button" data-export-1c="csv">Скачать CSV</button>
            <button class="btn btn-ghost" type="button" data-export-1c="json">Скачать JSON</button>
            <label class="check-line" style="margin:0;align-items:center">
              <input type="checkbox" id="exportMark1c" ${state.exportMark ? "checked" : ""} />
              <span>Пометить как выгруженные в 1С</span>
            </label>
          </div>
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
        <div class="admin-select-row">
          <label class="admin-select">
            <input type="checkbox" data-select-all="orders" />
            <span>Выбрать все на экране</span>
          </label>
        </div>
        <div class="admin-bulk-bar" data-bulk-bar="orders" hidden>
          <strong>Выбрано: <span data-selected-count="orders">0</span></strong>
          <select id="bulkOrderStatus" aria-label="Статус для выбранных заказов">
            <option value="">Сменить статус…</option>
            <option value="assembly">Сборка / к отгрузке</option>
            <option value="shipped">Отправлен</option>
            <option value="arrived">В ПВЗ / выдан</option>
            <option value="cancelled">Отменён</option>
          </select>
          <button class="btn btn-primary" type="button" data-bulk-orders="status">Применить статус</button>
          <button class="btn btn-ghost" type="button" data-bulk-orders="markPaid">Отметить оплаченными</button>
          <button class="btn btn-ghost" type="button" data-bulk-orders="sync">Синхронизировать</button>
          <button class="btn btn-ghost" type="button" data-bulk-orders="notifyTelegram">Статус в Telegram</button>
          <button class="btn btn-ghost" type="button" data-bulk-orders="export">Выгрузить Excel</button>
          <button class="btn btn-ghost admin-danger" type="button" data-bulk-orders="delete">Удалить</button>
          <button class="btn btn-ghost" type="button" data-clear-selection="orders">Снять выбор</button>
        </div>
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
                  } ${order.status === "cancelled" ? "is-cancelled" : ""} ${
                    selectedSet("orders").has(order.id) ? "is-checked" : ""
                  }" data-order-card="${esc(order.id)}">
                <header>
                  <label class="admin-select admin-select-card">
                    <input type="checkbox" data-select-order="${esc(order.id)}" ${
                      selectedSet("orders").has(order.id) ? "checked" : ""
                    } />
                    <span class="visually-hidden">Выбрать заказ ${esc(order.id)}</span>
                  </label>
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
                        order.status === "arrived"
                          ? `<span class="admin-pill pay-paid">К вручению / выдан</span>`
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
                    )}${order.lastSync?.at ? ` · Синхр.: ${when(order.lastSync.at)}` : ""}</p>
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
                      <div><strong>Telegram:</strong> ${
                        order.telegramLinked
                          ? "✅ привязан"
                          : "не привязан — клиент жмёт «Статус в Telegram» в кабинете"
                      }</div>
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
                      }</strong> ${esc(
                        order.deliveryMethod === "local"
                          ? order.localAddress || order.pvzAddress || order.comment || "—"
                          : order.pvzAddress || "—"
                      )}</div>
                      ${
                        order.deliveryMethod === "pickup"
                          ? `<p class="form-note">Склад самовывоза: Университетская 7/3</p>`
                          : (order.deliveryMethod || "cdek") === "cdek"
                            ? `<p class="form-note">Отправка СДЭК со склада: Лесной пр. 47 (Петрозаводск)</p>`
                            : order.deliveryMethod === "local"
                              ? `<p class="form-note">Адрес: ${esc(
                                  order.localAddress || order.comment || order.pvzAddress || "—"
                                )}</p>`
                              : ""
                      }
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
                ${renderOrderEditForm(order)}
                <div class="field">
                  <label>Заметка админа</label>
                  <textarea data-notes="${esc(order.id)}" rows="2">${esc(order.adminNotes || "")}</textarea>
                </div>
                <div class="admin-actions">
                  <button class="btn btn-ghost" type="button" data-save-notes="${esc(order.id)}">Сохранить заметку</button>
                  <button class="btn btn-ghost" type="button" data-sync-order="${esc(order.id)}">Обновить из ЮKassa / СДЭК</button>
                  <button class="btn btn-ghost" type="button" data-notify-tg="${esc(order.id)}">Статус клиенту в Telegram</button>
                  <button class="btn btn-ghost" type="button" data-edit-order="${esc(order.id)}">${
                    state.editingOrderId === order.id ? "Скрыть редактирование" : "Редактировать"
                  }</button>
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
                  ${
                    order.status !== "cancelled"
                      ? `<button class="btn btn-ghost" type="button" data-cancel-order="${esc(
                          order.id
                        )}">Отменить заказ</button>`
                      : ""
                  }
                  <button class="btn btn-ghost admin-danger" type="button" data-delete-order="${esc(
                    order.id
                  )}">Удалить</button>
                </div>
              </article>`;
                })
                .join("")
            : `<p class="lead">${orders.length ? "Нет заказов по текущему фильтру." : "Заказов пока нет."}</p>`
        }
      </div>`);
    bindShell();
    bindSelection("orders", "data-select-order");

    root.querySelectorAll("[data-bulk-orders]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const action = btn.getAttribute("data-bulk-orders");
        const ids = selectedIds("orders");
        if (!ids.length) {
          window.NMP_toast("Сначала отметьте заказы галочками");
          return;
        }
        btn.disabled = true;
        try {
          if (action === "export") {
            const count = await downloadOrdersFor1c("xlsx", ids);
            window.NMP_toast(count ? `Выгружено заказов: ${count}` : "Нет заказов для выгрузки");
            return;
          }
          if (action === "delete" && !window.confirm(`Удалить выбранные заказы (${ids.length}) безвозвратно?`)) {
            return;
          }
          if (action === "status") {
            const status = document.getElementById("bulkOrderStatus")?.value || "";
            if (!status) {
              window.NMP_toast("Выберите статус");
              return;
            }
            if (status === "cancelled" && !window.confirm(`Отменить выбранные заказы (${ids.length})?`)) return;
            const data = await runOrdersBulk("status", { status });
            if (data) window.NMP_toast(summarizeBulk(data, "Статус обновлён"));
            return;
          }
          const labels = {
            markPaid: "Отмечены оплаченными",
            sync: "Синхронизация",
            notifyTelegram: "Telegram",
            delete: "Удалено"
          };
          const data = await runOrdersBulk(action);
          if (data) window.NMP_toast(summarizeBulk(data, labels[action] || "Готово"));
        } catch (err) {
          window.NMP_toast(err.message || "Ошибка массового действия");
        } finally {
          btn.disabled = false;
        }
      });
    });

    document.getElementById("syncAllOrders")?.addEventListener("click", async () => {
      const btn = document.getElementById("syncAllOrders");
      if (btn) btn.disabled = true;
      try {
        const data = await syncAllOrders();
        const changed = (data.results || []).filter((r) => r.ok && (r.changes || []).length).length;
        window.NMP_toast(`Синхронизировано: ${data.synced || 0} · с изменениями: ${changed}`);
      } catch (err) {
        window.NMP_toast(err.message || "Ошибка синхронизации");
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    root.querySelectorAll('input[name="exportScope"]').forEach((input) => {
      input.closest("label")?.addEventListener("click", () => {
        state.exportScope = input.value || "paid";
        renderOrders();
      });
    });
    document.getElementById("exportMark1c")?.addEventListener("change", (event) => {
      state.exportMark = Boolean(event.target.checked);
    });
    root.querySelectorAll("[data-export-1c]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const format = btn.getAttribute("data-export-1c") || "commerceml";
        btn.disabled = true;
        try {
          const count = await downloadOrdersFor1c(format);
          window.NMP_toast(
            count ? `Выгружено заказов: ${count}` : "Нет заказов для выбранного фильтра выгрузки"
          );
        } catch (err) {
          window.NMP_toast(err.message || "Ошибка выгрузки");
        } finally {
          btn.disabled = false;
        }
      });
    });

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
    root.querySelectorAll("[data-cancel-order]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!window.confirm("Отменить заказ?")) return;
        await patchOrder(btn.getAttribute("data-cancel-order"), { status: "cancelled" });
        window.NMP_toast("Заказ отменён");
      });
    });
    root.querySelectorAll("[data-delete-order]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-delete-order");
        if (!window.confirm(`Удалить заказ ${id} безвозвратно?`)) return;
        try {
          await deleteOrder(id);
          window.NMP_toast("Заказ удалён");
        } catch (err) {
          window.NMP_toast(err.message || "Не удалось удалить");
        }
      });
    });
    root.querySelectorAll("[data-sync-order]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-sync-order");
        btn.disabled = true;
        try {
          const data = await syncOrder(id);
          const changes = data.sync?.changes || [];
          window.NMP_toast(changes.length ? changes.join(" · ") : "Статусы обновлены");
        } catch (err) {
          window.NMP_toast(err.message || "Ошибка синхронизации");
        } finally {
          btn.disabled = false;
        }
      });
    });
    root.querySelectorAll("[data-notify-tg]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-notify-tg");
        btn.disabled = true;
        try {
          await api(`/api/admin/orders/${encodeURIComponent(id)}/notify-telegram`, {
            method: "POST",
            body: JSON.stringify({})
          });
          window.NMP_toast("Статус отправлен клиенту в Telegram");
          await load();
        } catch (err) {
          window.NMP_toast(err.message || "Не удалось отправить в Telegram");
        } finally {
          btn.disabled = false;
        }
      });
    });
    root.querySelectorAll("[data-edit-order]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-edit-order");
        state.editingOrderId = state.editingOrderId === id ? null : id;
        state.expandedOrders[id] = true;
        renderOrders();
      });
    });
    root.querySelectorAll("[data-cancel-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.editingOrderId = null;
        renderOrders();
      });
    });
    root.querySelectorAll("[data-edit-order-form]").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const id = form.getAttribute("data-edit-order-form");
        const fd = new FormData(form);
        const payload = {
          edit: true,
          customer: {
            lastName: fd.get("lastName"),
            firstName: fd.get("firstName"),
            middleName: fd.get("middleName"),
            phone: fd.get("phone"),
            email: fd.get("email"),
            city: fd.get("city")
          },
          city: fd.get("city"),
          cityCode: fd.get("cityCode"),
          deliveryMethod: fd.get("deliveryMethod"),
          pvzCode: fd.get("pvzCode"),
          pvzAddress: fd.get("pvzAddress"),
          tariffCode: fd.get("tariffCode"),
          trackNumber: fd.get("trackNumber"),
          goodsTotal: fd.get("goodsTotal"),
          deliverySum: fd.get("deliverySum"),
          total: fd.get("total"),
          status: fd.get("status"),
          paymentStatus: fd.get("paymentStatus"),
          comment: fd.get("comment"),
          adminNotes: fd.get("adminNotes")
        };
        try {
          await patchOrder(id, payload);
          state.editingOrderId = null;
          window.NMP_toast("Заказ сохранён");
        } catch (err) {
          window.NMP_toast(err.message || "Не удалось сохранить");
        }
      });
    });
  };

  const renderLeads = () => {
    const list = state.leads || [];
    const fresh = list.filter((l) => l.status === "new").length;
    root.innerHTML = shell(`
      <p class="form-note">Заявки «Сообщить о поступлении» и сообщения с формы. Новых: <strong>${fresh}</strong> · Всего: ${list.length}</p>
      <div class="admin-select-row">
        <label class="admin-select">
          <input type="checkbox" data-select-all="leads" />
          <span>Выбрать все</span>
        </label>
      </div>
      <div class="admin-bulk-bar" data-bulk-bar="leads" hidden>
        <strong>Выбрано: <span data-selected-count="leads">0</span></strong>
        <button class="btn btn-primary" type="button" data-bulk-leads="done">Отметить обработанными</button>
        <button class="btn btn-ghost" type="button" data-bulk-leads="new">Вернуть в новые</button>
        <button class="btn btn-ghost admin-danger" type="button" data-bulk-leads="delete">Удалить</button>
        <button class="btn btn-ghost" type="button" data-clear-selection="leads">Снять выбор</button>
      </div>
      <div class="admin-list">
        ${
          list.length
            ? list
                .map((lead) => {
                  return `
              <article class="admin-order ${lead.status === "new" ? "is-ship" : ""} ${
                    selectedSet("leads").has(lead.id) ? "is-checked" : ""
                  }" data-lead-card="${esc(lead.id)}">
                <header>
                  <label class="admin-select admin-select-card">
                    <input type="checkbox" data-select-lead="${esc(lead.id)}" ${
                      selectedSet("leads").has(lead.id) ? "checked" : ""
                    } />
                    <span class="visually-hidden">Выбрать заявку ${esc(lead.id)}</span>
                  </label>
                  <div>
                    <div class="admin-order-badges">
                      <span class="admin-pill status">${esc(
                        lead.status === "done" ? "Обработана" : lead.status === "new" ? "Новая" : lead.status || "—"
                      )}</span>
                    </div>
                    <h3 style="margin:0.15rem 0">${esc(lead.productName || lead.productId || "Сообщение с сайта")}</h3>
                    <p class="form-note">${when(lead.createdAt)} · ${esc(lead.productSku || lead.type || "")} · ${esc(lead.id)}</p>
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
                  <button class="btn btn-ghost admin-danger" type="button" data-lead-delete="${esc(
                    lead.id
                  )}">Удалить</button>
                </div>
              </article>`;
                })
                .join("")
            : `<p class="lead">Заявок пока нет.</p>`
        }
      </div>`);
    bindShell();
    bindSelection("leads", "data-select-lead");
    root.querySelectorAll("[data-bulk-leads]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const action = btn.getAttribute("data-bulk-leads");
        const ids = selectedIds("leads");
        if (!ids.length) {
          window.NMP_toast("Сначала отметьте заявки галочками");
          return;
        }
        btn.disabled = true;
        try {
          if (action === "delete" && !window.confirm(`Удалить выбранные заявки (${ids.length})?`)) return;
          const payload =
            action === "delete"
              ? await runLeadsBulk("delete")
              : await runLeadsBulk("status", { status: action === "done" ? "done" : "new" });
          if (payload) {
            window.NMP_toast(
              summarizeBulk(
                payload,
                action === "delete" ? "Удалено" : action === "done" ? "Обработано" : "Возвращено в новые"
              )
            );
          }
        } catch (err) {
          window.NMP_toast(err.message || "Ошибка массового действия");
        } finally {
          btn.disabled = false;
        }
      });
    });
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
    root.querySelectorAll("[data-lead-delete]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-lead-delete");
        if (!window.confirm("Удалить заявку?")) return;
        await api(`/api/admin/leads/${encodeURIComponent(id)}`, { method: "DELETE" });
        selectedSet("leads").delete(id);
        window.NMP_toast("Заявка удалена");
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

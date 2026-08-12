(() => {
  const Store = window.NMP_Store;

  const showToast = (message) => {
    let toast = document.getElementById("toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "toast";
      toast.className = "toast";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => toast.classList.remove("show"), 2400);
  };
  window.NMP_toast = showToast;

  const refreshCartBadge = () => {
    if (!Store?.cartCount) return;
    document.querySelectorAll("[data-cart-count]").forEach((el) => {
      el.textContent = String(Store.cartCount());
    });
  };

  const header = document.getElementById("header");
  const nav = document.getElementById("nav");
  const menuToggle = document.getElementById("menuToggle");

  const setMenuOpen = (open) => {
    if (!nav || !menuToggle) return;
    nav.classList.toggle("open", open);
    menuToggle.classList.toggle("open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
    document.body.style.overflow = open ? "hidden" : "";
    header?.classList.toggle("menu-open", open);
  };

  const onScroll = () => {
    if (!header) return;
    // Keep scrolled chrome while the mobile menu is open so the toggle
    // styling stays stable; never rely on backdrop-filter for the bar.
    if (nav?.classList.contains("open")) return;
    header.classList.toggle("scrolled", window.scrollY > 16);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  if (menuToggle && nav) {
    menuToggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setMenuOpen(!nav.classList.contains("open"));
    });
    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => setMenuOpen(false));
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    });
    window.addEventListener("resize", () => {
      if (window.matchMedia("(min-width: 901px)").matches) setMenuOpen(false);
    });
  }

  document.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-add-cart]");
    if (!btn) return;
    event.preventDefault();
    if (!Store?.addToCart) return;
    const id = btn.getAttribute("data-add-cart");
    const product = window.NMP_getProduct?.(id);
    if (product && product.availableForOrder === false) {
      window.NMP_openAvailabilityNotify?.(product);
      return;
    }
    Store.addToCart(id);
    showToast(`«${product?.name || "Товар"}» добавлен в корзину`);
  });

  const openAvailabilityNotify = (product) => {
    if (!product) return;
    let overlay = document.getElementById("availabilityNotifyOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "availabilityNotifyOverlay";
      overlay.className = "notify-overlay";
      overlay.innerHTML = `
        <div class="notify-dialog" role="dialog" aria-modal="true" aria-labelledby="notifyTitle">
          <button type="button" class="notify-close" aria-label="Закрыть">×</button>
          <h3 id="notifyTitle">Сообщить о поступлении</h3>
          <p class="form-note" id="notifyLead"></p>
          <form id="availabilityNotifyForm" class="notify-form">
            <input type="hidden" name="productId" id="notifyProductId" />
            <div class="field">
              <label for="notifyName">Имя</label>
              <input id="notifyName" name="name" type="text" autocomplete="name" />
            </div>
            <div class="field">
              <label for="notifyPhone">Телефон</label>
              <input id="notifyPhone" name="phone" type="tel" autocomplete="tel" placeholder="+7..." />
            </div>
            <div class="field">
              <label for="notifyEmail">E-mail</label>
              <input id="notifyEmail" name="email" type="email" autocomplete="email" />
            </div>
            <div class="field">
              <label for="notifyComment">Комментарий</label>
              <textarea id="notifyComment" name="comment" rows="2" placeholder="Необязательно"></textarea>
            </div>
            <p class="form-note">Укажите телефон или e-mail — напишем, когда модель появится в продаже.</p>
            <label class="check-line notify-consent">
              <input type="checkbox" id="notifyConsent" name="consent" required />
              <span>Согласен на обработку персональных данных и с <a href="privacy.html" target="_blank" rel="noopener">политикой конфиденциальности</a></span>
            </label>
            <button class="btn btn-primary" type="submit">Жду оповещение</button>
          </form>
        </div>`;
      document.body.appendChild(overlay);
      const close = () => {
        overlay.hidden = true;
        document.body.style.overflow = "";
      };
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay || e.target.classList.contains("notify-close")) close();
      });
      overlay.querySelector("#availabilityNotifyForm").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const consent = overlay.querySelector("#notifyConsent");
        if (consent && !consent.checked) {
          showToast("Нужно согласие на обработку персональных данных");
          return;
        }
        const fd = new FormData(ev.target);
        const payload = {
          productId: fd.get("productId"),
          name: fd.get("name"),
          phone: fd.get("phone"),
          email: fd.get("email"),
          comment: fd.get("comment"),
          consent: true
        };
        try {
          const res = await fetch((window.NMP_CONFIG?.apiBase || "") + "/api/availability-notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.message || "Не удалось отправить заявку");
          showToast("Готово! Сообщим, когда товар появится в продаже");
          close();
          ev.target.reset();
        } catch (err) {
          showToast(err.message || "Ошибка отправки");
        }
      });
    }
    overlay.querySelector("#notifyProductId").value = product.id;
    overlay.querySelector("#notifyTitle").textContent = "Сообщить о поступлении";
    overlay.querySelector("#notifyLead").textContent =
      `«${product.name}» · ${product.availabilityNote || "Модель ещё готовится к продаже."}`;
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
  };
  window.NMP_openAvailabilityNotify = openAvailabilityNotify;
  window.NMP_isOrderable = (productOrId) => {
    const product =
      typeof productOrId === "object" && productOrId
        ? productOrId
        : window.NMP_getProduct?.(productOrId);
    return Boolean(product && product.availableForOrder !== false);
  };

  document.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-notify-product]");
    if (!btn) return;
    event.preventDefault();
    const id = btn.getAttribute("data-notify-product");
    const product = window.NMP_getProduct?.(id) || {
      id,
      name: btn.getAttribute("data-notify-name") || "Товар",
      availabilityNote: btn.getAttribute("data-notify-note") || ""
    };
    openAvailabilityNotify(product);
  });

  document.querySelectorAll("[data-go-cart]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.href = "checkout.html";
    });
  });

  document.querySelectorAll(".faq-item button").forEach((btn) => {
    if (!btn.hasAttribute("aria-expanded")) btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", () => {
      const item = btn.parentElement;
      const open = item.classList.contains("open");
      document.querySelectorAll(".faq-item").forEach((el) => {
        el.classList.remove("open");
        el.querySelector("button")?.setAttribute("aria-expanded", "false");
      });
      if (!open) {
        item.classList.add("open");
        btn.setAttribute("aria-expanded", "true");
      } else {
        btn.setAttribute("aria-expanded", "false");
      }
    });
  });

  const contactForm = document.getElementById("contactForm");
  if (contactForm) {
    const contactPhone = contactForm.querySelector("#phone");
    if (contactPhone && typeof window.NMP_bindPhoneMask === "function") {
      window.NMP_bindPhoneMask(contactPhone);
    }
    contactForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const consent = contactForm.querySelector("#contactConsent");
      if (consent && !consent.checked) {
        showToast("Нужно согласие на обработку персональных данных");
        return;
      }
      const fd = new FormData(contactForm);
      const payload = {
        name: String(fd.get("name") || "").trim(),
        phone: String(fd.get("phone") || "").trim(),
        email: String(fd.get("email") || "").trim(),
        message: String(fd.get("message") || "").trim(),
        consent: true
      };
      try {
        const res = await fetch((window.NMP_CONFIG?.apiBase || "") + "/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "Не удалось отправить сообщение");
        showToast("Сообщение отправлено. Мы свяжемся с вами.");
        contactForm.reset();
      } catch (err) {
        showToast(err.message || "Ошибка отправки");
      }
    });
  }

  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("visible"));
  }

  window.addEventListener("nmp:cart", refreshCartBadge);
  refreshCartBadge();

  /* Reliable in-page / cross-page anchors (contact, catalog, …) */
  const scrollToHashTarget = () => {
    const raw = String(window.location.hash || "").replace(/^#/, "");
    if (!raw) return;
    const id = decodeURIComponent(raw);
    const el =
      document.getElementById(id) ||
      (id === "feedback" || id === "obratnaya-svyaz" ? document.getElementById("contact") : null);
    if (!el) return;
    window.requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  window.addEventListener("hashchange", scrollToHashTarget);
  window.addEventListener("load", () => {
    window.setTimeout(scrollToHashTarget, 60);
    window.setTimeout(scrollToHashTarget, 400);
  });
  if (document.readyState === "complete") {
    window.setTimeout(scrollToHashTarget, 60);
  }
})();

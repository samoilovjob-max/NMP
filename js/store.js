(() => {
  const KEYS = {
    cart: "nmp_cart",
    user: "nmp_user",
    orders: "nmp_orders"
  };

  const read = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };

  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  const uid = (prefix) =>
    prefix + "-" + Math.random().toString(36).slice(2, 8).toUpperCase() + Date.now().toString(36).slice(-4).toUpperCase();

  const Store = {
    getCart() {
      return read(KEYS.cart, []);
    },
    setCart(items) {
      write(KEYS.cart, items);
      window.dispatchEvent(new CustomEvent("nmp:cart"));
    },
    cartCount() {
      return this.getCart().reduce((sum, item) => sum + item.qty, 0);
    },
    addToCart(productId, qty = 1) {
      const product = window.NMP_getProduct?.(productId);
      if (product && product.availableForOrder === false) {
        window.NMP_openAvailabilityNotify?.(product);
        window.NMP_toast?.(`«${product.name}» пока нельзя добавить в корзину`);
        return this.getCart();
      }
      const cart = this.getCart();
      const existing = cart.find((item) => item.productId === String(productId));
      if (existing) existing.qty += qty;
      else cart.push({ productId: String(productId), qty });
      this.setCart(cart);
      return cart;
    },
    updateQty(productId, qty) {
      let cart = this.getCart();
      cart = cart
        .map((item) => (item.productId === String(productId) ? { ...item, qty } : item))
        .filter((item) => item.qty > 0);
      this.setCart(cart);
    },
    clearCart() {
      this.setCart([]);
    },
    getUser() {
      return read(KEYS.user, null);
    },
    setUser(user) {
      write(KEYS.user, user);
      window.dispatchEvent(new CustomEvent("nmp:user"));
    },
    ensureUser(profile) {
      const current = this.getUser() || { id: uid("USR"), createdAt: new Date().toISOString() };
      const next = { ...current, ...profile, updatedAt: new Date().toISOString() };
      this.setUser(next);
      return next;
    },
    getOrders() {
      return read(KEYS.orders, []);
    },
    saveOrders(orders) {
      write(KEYS.orders, orders);
      window.dispatchEvent(new CustomEvent("nmp:orders"));
    },
    createOrder(payload) {
      const orders = this.getOrders().filter((o) => o.id !== payload.id);
      const order = {
        id: payload.id || uid("NMP"),
        createdAt: payload.createdAt || new Date().toISOString(),
        status: payload.status || "pending_payment",
        paymentStatus: payload.paymentStatus || "pending",
        shipByAt: payload.shipByAt || null,
        cdek: payload.cdek || {
          trackNumber: "",
          city: payload.city,
          pvzCode: payload.pvzCode,
          pvzAddress: payload.pvzAddress,
          stage: "Ожидает оплату",
          history: [
            {
              at: new Date().toISOString(),
              title: "Заказ создан",
              detail: "Ожидает оплату"
            }
          ]
        },
        ...payload
      };
      orders.unshift(order);
      this.saveOrders(orders);
      return order;
    },
    updateOrder(id, patch) {
      const orders = this.getOrders().map((order) =>
        order.id === id ? { ...order, ...patch } : order
      );
      this.saveOrders(orders);
      return orders.find((order) => order.id === id);
    },
    getOrder(id) {
      return this.getOrders().find((order) => order.id === id);
    },
    /** Имитация/обновление статусов по срокам + место для живого API СДЭК */
    syncOrderTracking(order) {
      if (!order) return order;
      const created = new Date(order.createdAt).getTime();
      const hours = (Date.now() - created) / 36e5;
      let status = order.status;
      let stage = order.cdek?.stage || "";
      const history = [...(order.cdek?.history || [])];

      if (order.paymentStatus !== "paid") {
        status = "assembly";
        stage = "Ожидает оплату";
      } else if (hours < 24) {
        status = "assembly";
        stage = "Сборка заказа на производстве";
      } else if (hours < 72) {
        status = "shipped";
        stage = "Груз сдан в СДЭК · в пути";
        if (!order.cdek.trackNumber) {
          order = {
            ...order,
            cdek: {
              ...order.cdek,
              trackNumber: "CDEK" + String(created).slice(-10)
            }
          };
        }
      } else {
        status = "arrived";
        stage = "Прибыл в пункт выдачи · можно забирать";
      }

      if (!history.some((h) => h.title === stage)) {
        history.push({ at: new Date().toISOString(), title: stage, detail: "Обновление статуса" });
      }

      return this.updateOrder(order.id, {
        status,
        cdek: {
          ...order.cdek,
          stage,
          history
        }
      });
    },
    statusLabel(status) {
      return (
        {
          pending_payment: "Ожидает оплату",
          assembly: "Сборка",
          shipped: "Отправка товара",
          arrived: "Прибыл для получения",
          cancelled: "Отменён"
        }[status] || status
      );
    }
  };

  window.NMP_Store = Store;
})();

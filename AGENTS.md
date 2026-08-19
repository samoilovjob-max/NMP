# Northern Magical Place

Premium single-product e-commerce landing site / storefront (Russian) for Karelian Flat-Pack fire-pit systems.

## Cursor Cloud specific instructions

- This is a **fully static** site: plain HTML/CSS/vanilla JS. There is **no backend, no build step, no package manager, and no dependencies to install**. Python 3 (stdlib) is the only requirement and is preinstalled.
- Run it in development the same way the `README.md` documents: serve the repo root with `python3 -m http.server 8080`, then open `http://localhost:8080`. Any static file server works.
- Serve over HTTP; do **not** open pages via `file://` — relative asset paths and some behaviors rely on being served.
- There is **no lint or automated test suite** in this repo. "Testing" means serving the site and exercising the flow in a browser.
- All commerce state (cart, user, orders) lives in the browser's `localStorage` (keys `nmp_cart`, `nmp_user`, `nmp_orders`). To reset state, clear site data / localStorage in the browser.
- YooKassa (payments) and CDEK (delivery) are optional integrations configured in `js/config.js`. With empty keys the site runs in **demo mode**: checkout completes locally (order marked paid) and pickup points / tracking are simulated. No credentials or external services are needed to run or test end-to-end.
- End-to-end "hello world" flow: `index.html` → product `ПОДРОБНЕЕ` → `product.html` add `В КОРЗИНУ` → cart icon → `checkout.html` (fill buyer form, pick a СДЭК pickup point, accept privacy checkbox) → `ОПЛАТИТЬ ЧЕРЕЗ ЮKASSA` → redirects to `account.html` showing the created order.

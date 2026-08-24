/**
 * Serve concatenated storefront JS so pages load 1–2 files instead of 6–8.
 * Source files in /js stay as-is for editing; HTML points at these bundle URLs.
 */
const fs = require("fs");
const path = require("path");

const BUNDLES = {
  "/js/nmp-storefront.js": [
    "config.js",
    "nmp-utils.js",
    "products.js",
    "store.js",
    "cms-loader.js",
    "main.js",
    "analytics.js"
  ],
  "/js/nmp-lite.js": ["config.js", "store.js", "cms-loader.js", "main.js", "analytics.js"],
  "/js/nmp-checkout.js": ["delivery-providers.js", "checkout.js"],
  "/js/nmp-admin.js": [
    "config.js",
    "products.js",
    "store.js",
    "main.js",
    "admin-editor.js",
    "admin.js"
  ]
};

function stamp(root, files) {
  return files
    .map((name) => {
      const stat = fs.statSync(path.join(root, "js", name));
      return `${name}:${stat.mtimeMs}:${stat.size}`;
    })
    .join("|");
}

function build(root, files) {
  return files
    .map((name) => {
      const abs = path.join(root, "js", name);
      return `/* ${name} */\n${fs.readFileSync(abs, "utf8")}`;
    })
    .join("\n;\n");
}

function jsBundleMiddleware(root) {
  const cache = new Map();
  return (req, res, next) => {
    const files = BUNDLES[req.path];
    if (!files) return next();
    const key = stamp(root, files);
    let entry = cache.get(req.path);
    if (!entry || entry.key !== key) {
      entry = { key, body: build(root, files) };
      cache.set(req.path, entry);
    }
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(entry.body);
  };
}

module.exports = { BUNDLES, jsBundleMiddleware };

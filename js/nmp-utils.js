/** Shared product URL helper for storefront scripts */
window.NMP_productHref = (productOrId, productMaybe) => {
  const product =
    typeof productOrId === "object" && productOrId
      ? productOrId
      : productMaybe || window.NMP_getProduct?.(productOrId);
  if (product?.slug) return `product.html?slug=${encodeURIComponent(product.slug)}`;
  const id = product?.id || productOrId;
  return `product.html?id=${encodeURIComponent(id || "")}`;
};

window.NMP_normalizePhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  let next = digits;
  if (next.startsWith("8") && next.length === 11) next = `7${next.slice(1)}`;
  if (next.length === 10) next = `7${next}`;
  if (!next.startsWith("7") && next.length >= 11) next = `7${next.slice(-10)}`;
  return next.slice(0, 11);
};

window.NMP_formatPhoneMask = (value) => {
  const d = window.NMP_normalizePhone(value);
  if (!d) return "";
  const rest = d.startsWith("7") ? d.slice(1) : d;
  const p1 = rest.slice(0, 3);
  const p2 = rest.slice(3, 6);
  const p3 = rest.slice(6, 8);
  const p4 = rest.slice(8, 10);
  let out = "+7";
  if (p1) out += ` (${p1}`;
  if (p1.length === 3) out += ")";
  if (p2) out += ` ${p2}`;
  if (p3) out += `-${p3}`;
  if (p4) out += `-${p4}`;
  return out;
};

window.NMP_bindPhoneMask = (input) => {
  if (!input || input.dataset.phoneMaskBound) return;
  input.dataset.phoneMaskBound = "1";
  input.setAttribute("inputmode", "tel");
  input.addEventListener("input", () => {
    const start = input.selectionStart;
    const before = input.value;
    input.value = window.NMP_formatPhoneMask(input.value);
    if (document.activeElement === input && typeof start === "number") {
      const delta = input.value.length - before.length;
      const pos = Math.max(0, start + delta);
      try {
        input.setSelectionRange(pos, pos);
      } catch {
        /* ignore */
      }
    }
  });
  input.addEventListener("blur", () => {
    input.value = window.NMP_formatPhoneMask(input.value);
  });
};

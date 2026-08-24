/**
 * Lightweight HTML sanitizer for admin-authored product/news text.
 * Allows a small Word-like subset: paragraphs, breaks, bold/italic, lists.
 */
function sanitizeRichHtml(input) {
  let html = String(input || "");
  if (!html.trim()) return "";

  // If plain text (no tags), convert newlines to <br>
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    html = html
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
    return html;
  }

  html = html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*\/?\s*>/gi, "")
    .replace(/\son\w+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "")
    .replace(/\s(href|src)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, "");

  // Strip disallowed tags but keep their text
  html = html.replace(/<\/?([a-z0-9]+)(\s[^>]*)?>/gi, (match, tag) => {
    const allowed = [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "ul",
      "ol",
      "li",
      "span",
      "div"
    ];
    const name = String(tag || "").toLowerCase();
    if (!allowed.includes(name)) return "";
    if (name === "br") return "<br>";
    if (match.startsWith("</")) return `</${name}>`;
    // drop attributes except harmless class on span/div
    if (name === "span" || name === "div") return `<${name}>`;
    return `<${name}>`;
  });

  return html.trim();
}

function stripHtml(input) {
  return String(input || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = { sanitizeRichHtml, stripHtml };

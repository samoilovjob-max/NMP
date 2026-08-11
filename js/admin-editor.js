(() => {
  const EMOJIS = [
    "🔥",
    "✨",
    "🌲",
    "❄️",
    "✅",
    "⭐",
    "📦",
    "🚚",
    "🏠",
    "💪",
    "🎯",
    "❤️",
    "👍",
    "🛠️",
    "🪵",
    "🏕️",
    "☕",
    "🌙",
    "☀️",
    "🎉"
  ];

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const plainToHtml = (value) => {
    const raw = String(value || "");
    if (!raw.trim()) return "";
    if (/<[a-z][\s\S]*>/i.test(raw)) return raw;
    return escapeHtml(raw).replace(/\n/g, "<br>");
  };

  const syncSource = (wrap) => {
    const source = wrap.querySelector(".rich-source");
    const editor = wrap.querySelector(".rich-editor");
    const preview = wrap.querySelector(".rich-preview-body");
    if (!source || !editor) return;
    source.value = editor.innerHTML.trim();
    if (preview) preview.innerHTML = source.value || "<span class='form-note'>Превью текста появится здесь</span>";
  };

  const exec = (command, value = null) => {
    document.execCommand(command, false, value);
  };

  const mountOne = (textarea, options = {}) => {
    if (!textarea || textarea.dataset.richMounted === "1") return null;
    textarea.dataset.richMounted = "1";

    const wrap = document.createElement("div");
    wrap.className = "rich-field";
    wrap.dataset.preview = options.preview || "text";

    const labelText = options.label || textarea.closest(".field")?.querySelector("label")?.textContent || "Текст";

    wrap.innerHTML = `
      <div class="rich-toolbar" role="toolbar" aria-label="Форматирование">
        <button type="button" data-cmd="bold" title="Жирный"><b>B</b></button>
        <button type="button" data-cmd="italic" title="Курсив"><i>I</i></button>
        <button type="button" data-cmd="insertUnorderedList" title="Маркированный список">• Список</button>
        <button type="button" data-cmd="insertOrderedList" title="Нумерованный список">1. Список</button>
        <button type="button" data-cmd="removeFormat" title="Очистить формат">✕</button>
        <div class="rich-emoji">
          <button type="button" class="rich-emoji-toggle" type="button" title="Смайлики">☺</button>
          <div class="rich-emoji-panel" hidden>
            ${EMOJIS.map((e) => `<button type="button" data-emoji="${e}">${e}</button>`).join("")}
          </div>
        </div>
      </div>
      <div class="rich-editor" contenteditable="true" role="textbox" aria-multiline="true"></div>
      <div class="rich-preview">
        <div class="rich-preview-label">Как будет на сайте · ${escapeHtml(labelText)}</div>
        <div class="rich-preview-card">
          <div class="rich-preview-body rich-text"></div>
        </div>
      </div>
    `;

    textarea.classList.add("rich-source");
    textarea.hidden = true;
    textarea.parentNode.insertBefore(wrap, textarea);
    wrap.appendChild(textarea);

    const editor = wrap.querySelector(".rich-editor");
    editor.innerHTML = plainToHtml(textarea.value);
    syncSource(wrap);

    wrap.querySelectorAll("[data-cmd]").forEach((btn) => {
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () => {
        editor.focus();
        exec(btn.getAttribute("data-cmd"));
        syncSource(wrap);
      });
    });

    const panel = wrap.querySelector(".rich-emoji-panel");
    wrap.querySelector(".rich-emoji-toggle")?.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
    });
    panel?.querySelectorAll("[data-emoji]").forEach((btn) => {
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () => {
        editor.focus();
        exec("insertText", btn.getAttribute("data-emoji"));
        panel.hidden = true;
        syncSource(wrap);
      });
    });

    editor.addEventListener("input", () => syncSource(wrap));
    editor.addEventListener("blur", () => syncSource(wrap));

    return wrap;
  };

  const mountIn = (root = document, map = {}) => {
    const nodes = root.querySelectorAll("textarea[data-rich]");
    nodes.forEach((ta) => {
      const kind = ta.getAttribute("data-rich") || "text";
      mountOne(ta, {
        preview: kind,
        label: map[ta.name] || ta.getAttribute("data-rich-label") || ta.name
      });
    });
  };

  const refresh = (root = document) => {
    root.querySelectorAll(".rich-field").forEach((wrap) => {
      const source = wrap.querySelector(".rich-source");
      const editor = wrap.querySelector(".rich-editor");
      if (!source || !editor) return;
      if (editor.innerHTML.trim() !== String(source.value || "").trim()) {
        editor.innerHTML = plainToHtml(source.value);
      }
      syncSource(wrap);
    });
  };

  window.NMP_mountRichEditors = mountIn;
  window.NMP_refreshRichEditors = refresh;
})();

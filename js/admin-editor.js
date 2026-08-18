(() => {
  /** Telegram-like emoji set by categories (common Unicode emoji) */
  const EMOJI_CATEGORIES = [
    {
      id: "smileys",
      label: "😀",
      title: "Смайлы",
      emojis: [
        "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩",
        "😘", "😗", "☺️", "😚", "😙", "🥲", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔",
        "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "😮‍💨", "🤥", "😌", "😔", "😪", "🤤", "😴",
        "😷", "🤒", "🤕", "🤢", "🤮", "🥵", "🥶", "🥴", "😵", "🤯", "🤠", "🥳", "🥸", "😎", "🤓", "🧐",
        "😕", "😟", "🙁", "☹️", "😮", "😯", "😲", "😳", "🥺", "😦", "😧", "😨", "😰", "😥", "😢", "😭",
        "😱", "😖", "😣", "😞", "😓", "😩", "😫", "🥱", "😤", "😡", "😠", "🤬", "😈", "👿", "💀", "☠️",
        "💩", "🤡", "👹", "👺", "👻", "👽", "👾", "🤖", "😺", "😸", "😹", "😻", "😼", "😽", "🙀", "😿", "😾"
      ]
    },
    {
      id: "gestures",
      label: "👋",
      title: "Жесты",
      emojis: [
        "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆",
        "🖕", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✍️",
        "💅", "🤳", "💪", "🦾", "🦿", "🦵", "🦶", "👂", "🦻", "👃", "🧠", "🫀", "🫁", "🦷", "🦴", "👀",
        "👁️", "👅", "👄", "💋", "🩸"
      ]
    },
    {
      id: "hearts",
      label: "❤️",
      title: "Сердца",
      emojis: [
        "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖",
        "💘", "💝", "💟", "☮️", "✝️", "☪️", "🕉️", "☸️", "✡️", "🔯", "🕎", "☯️", "☦️", "🛐", "⛎", "♈",
        "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓", "🆔", "⚛️"
      ]
    },
    {
      id: "people",
      label: "👤",
      title: "Люди",
      emojis: [
        "👶", "👧", "🧒", "👦", "👩", "🧑", "👨", "👩‍🦱", "👨‍🦱", "👩‍🦰", "👨‍🦰", "👱‍♀️", "👱‍♂️", "👩‍🦳", "👨‍🦳", "👩‍🦲",
        "👨‍🦲", "🧔", "👵", "🧓", "👴", "👲", "👳‍♀️", "👳‍♂️", "🧕", "👮‍♀️", "👮‍♂️", "👷‍♀️", "👷‍♂️", "💂‍♀️", "💂‍♂️", "🕵️‍♀️",
        "🕵️‍♂️", "👩‍⚕️", "👨‍⚕️", "👩‍🌾", "👨‍🌾", "👩‍🍳", "👨‍🍳", "👩‍🎓", "👨‍🎓", "👩‍🎤", "👨‍🎤", "👩‍🏫", "👨‍🏫", "👩‍🏭", "👨‍🏭", "👩‍💻",
        "👨‍💻", "👩‍💼", "👨‍💼", "👩‍🔧", "👨‍🔧", "👩‍🔬", "👨‍🔬", "👩‍🎨", "👨‍🎨", "👩‍🚒", "👨‍🚒", "👩‍✈️", "👨‍✈️", "👩‍🚀", "👨‍🚀", "👩‍⚖️",
        "👨‍⚖️", "👰", "🤵", "👸", "🤴", "🦸‍♀️", "🦸‍♂️", "🦹‍♀️", "🦹‍♂️", "🤶", "🎅", "🧙‍♀️", "🧙‍♂️", "🧝‍♀️", "🧝‍♂️", "🧛‍♀️",
        "🧛‍♂️", "🧟‍♀️", "🧟‍♂️", "🧞‍♀️", "🧞‍♂️", "🧜‍♀️", "🧜‍♂️", "🧚‍♀️", "🧚‍♂️", "👼", "🤰", "🤱", "👩‍🍼", "👨‍🍼", "🙇‍♀️", "🙇‍♂️"
      ]
    },
    {
      id: "animals",
      label: "🐻",
      title: "Животные",
      emojis: [
        "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐻‍❄️", "🐨", "🐯", "🦁", "🐮", "🐷", "🐽", "🐸",
        "🐵", "🙈", "🙉", "🙊", "🐒", "🐔", "🐧", "🐦", "🐤", "🐣", "🐥", "🦆", "🦅", "🦉", "🦇", "🐺",
        "🐗", "🐴", "🦄", "🐝", "🪱", "🐛", "🦋", "🐌", "🐞", "🐜", "🪰", "🪲", "🪳", "🦟", "🦗", "🕷️",
        "🦂", "🐢", "🐍", "🦎", "🦖", "🦕", "🐙", "🦑", "🦐", "🦞", "🦀", "🐡", "🐠", "🐟", "🐬", "🐳",
        "🐋", "🦈", "🐊", "🐅", "🐆", "🦓", "🦍", "🦧", "🦣", "🐘", "🦛", "🦏", "🐪", "🐫", "🦒", "🦘",
        "🦬", "🐃", "🐂", "🐄", "🐎", "🐖", "🐏", "🐑", "🦙", "🐐", "🦌", "🐕", "🐩", "🦮", "🐕‍🦺", "🐈",
        "🐈‍⬛", "🪶", "🐓", "🦃", "🦤", "🦚", "🦜", "🦢", "🦩", "🕊️", "🐇", "🦝", "🦨", "🦡", "🦫", "🦦",
        "🦥", "🐁", "🐀", "🐿️", "🦔"
      ]
    },
    {
      id: "nature",
      label: "🌲",
      title: "Природа",
      emojis: [
        "🌵", "🎄", "🌲", "🌳", "🌴", "🪵", "🌱", "🌿", "☘️", "🍀", "🎍", "🪴", "🎋", "🍃", "🍂", "🍁",
        "🍄", "🐚", "🪨", "🌾", "💐", "🌷", "🌹", "🥀", "🌺", "🌸", "🌼", "🌻", "🌞", "🌝", "🌛", "🌜",
        "🌚", "🌕", "🌖", "🌗", "🌘", "🌑", "🌒", "🌓", "🌔", "🌙", "🌎", "🌍", "🌏", "🪐", "💫", "⭐",
        "🌟", "✨", "⚡", "☄️", "💥", "🔥", "🌪️", "🌈", "☀️", "🌤️", "⛅", "🌥️", "☁️", "🌦️", "🌧️", "⛈️",
        "🌩️", "🌨️", "❄️", "☃️", "⛄", "🌬️", "💨", "💧", "💦", "☔", "☂️", "🌊", "🌫️"
      ]
    },
    {
      id: "food",
      label: "🍕",
      title: "Еда",
      emojis: [
        "🍇", "🍈", "🍉", "🍊", "🍋", "🍌", "🍍", "🥭", "🍎", "🍏", "🍐", "🍑", "🍒", "🍓", "🫐", "🥝",
        "🍅", "🫒", "🥥", "🥑", "🍆", "🥔", "🥕", "🌽", "🌶️", "🫑", "🥒", "🥬", "🥦", "🧄", "🧅", "🍄",
        "🥜", "🌰", "🍞", "🥐", "🥖", "🫓", "🥨", "🥯", "🥞", "🧇", "🧀", "🍖", "🍗", "🥩", "🥓", "🍔",
        "🍟", "🍕", "🌭", "🥪", "🌮", "🌯", "🫔", "🥙", "🧆", "🥚", "🍳", "🥘", "🍲", "🫕", "🥣", "🥗",
        "🍿", "🧈", "🧂", "🥫", "🍱", "🍘", "🍙", "🍚", "🍛", "🍜", "🍝", "🍠", "🍢", "🍣", "🍤", "🍥",
        "🥮", "🍡", "🥟", "🥠", "🥡", "🦀", "🦞", "🦐", "🦑", "🦪", "🍦", "🍧", "🍨", "🍩", "🍪", "🎂",
        "🍰", "🧁", "🥧", "🍫", "🍬", "🍭", "🍮", "🍯", "🍼", "🥛", "☕", "🫖", "🍵", "🍶", "🍾", "🍷",
        "🍸", "🍹", "🍺", "🍻", "🥂", "🥃", "🥤", "🧋", "🧃", "🧉", "🧊"
      ]
    },
    {
      id: "travel",
      label: "🚗",
      title: "Транспорт",
      emojis: [
        "🚗", "🚕", "🚙", "🚌", "🚎", "🏎️", "🚓", "🚑", "🚒", "🚐", "🛻", "🚚", "🚛", "🚜", "🦯", "🦽",
        "🦼", "🛴", "🚲", "🛵", "🏍️", "🛺", "🚨", "🚔", "🚍", "🚘", "🚖", "🚡", "🚠", "🚟", "🚃", "🚋",
        "🚞", "🚝", "🚄", "🚅", "🚈", "🚂", "🚆", "🚇", "🚊", "🚉", "✈️", "🛫", "🛬", "🛩️", "💺", "🛰️",
        "🚀", "🛸", "🚁", "🛶", "⛵", "🚤", "🛥️", "🛳️", "⛴️", "🚢", "⚓", "🪝", "⛽", "🚧", "🚦", "🚥",
        "🗺️", "🗿", "🗽", "🗼", "🏰", "🏯", "🏟️", "🎡", "🎢", "🎠", "⛲", "⛱️", "🏖️", "🏝️", "🏜️", "🌋",
        "⛰️", "🏔️", "🗻", "🏕️", "⛺", "🏠", "🏡", "🏘️", "🏚️", "🏗️", "🏭", "🏢", "🏬", "🏣", "🏤", "🏥",
        "🏦", "🏨", "🏪", "🏫", "🏩", "💒", "🏛️", "⛪", "🕌", "🕍", "🛕", "🕋"
      ]
    },
    {
      id: "objects",
      label: "💡",
      title: "Предметы",
      emojis: [
        "⌚", "📱", "📲", "💻", "⌨️", "🖥️", "🖨️", "🖱️", "🖲️", "🕹️", "🗜️", "💽", "💾", "💿", "📀", "📼",
        "📷", "📸", "📹", "🎥", "📽️", "🎞️", "📞", "☎️", "📟", "📠", "📺", "📻", "🎙️", "🎚️", "🎛️", "🧭",
        "⏱️", "⏲️", "⏰", "🕰️", "⌛", "⏳", "📡", "🔋", "🔌", "💡", "🔦", "🕯️", "🪔", "🧯", "🛢️", "💸",
        "💵", "💴", "💶", "💷", "🪙", "💰", "💳", "💎", "⚖️", "🪜", "🧰", "🪛", "🔧", "🔨", "⚒️", "🛠️",
        "⛏️", "🪚", "🔩", "⚙️", "🪤", "🧱", "⛓️", "🧲", "🔫", "💣", "🧨", "🪓", "🔪", "🗡️", "⚔️", "🛡️",
        "🚬", "⚰️", "🪦", "⚱️", "🏺", "🔮", "📿", "🧿", "💈", "⚗️", "🔭", "🔬", "🕳️", "🩹", "🩺", "💊",
        "💉", "🩸", "🧬", "🦠", "🧫", "🧪", "🌡️", "🧹", "🪠", "🧺", "🧻", "🚽", "🚰", "🚿", "🛁", "🛀",
        "🧼", "🪥", "🪒", "🧽", "🪣", "🧴", "🛎️", "🔑", "🗝️", "🚪", "🪑", "🛋️", "🛏️", "🛌", "🧸", "🖼️",
        "🪞", "🪟", "🛍️", "🛒", "🎁", "🎈", "🎏", "🎀", "🪄", "🪅", "🎊", "🎉", "🎎", "🏮", "🎐", "🧧",
        "✉️", "📩", "📨", "📧", "💌", "📥", "📤", "📦", "🏷️", "🪧", "📪", "📫", "📬", "📭", "📮", "📯",
        "📜", "📃", "📄", "📑", "🧾", "📊", "📈", "📉", "🗒️", "🗓️", "📆", "📅", "🗑️", "📇", "🗃️", "🗳️",
        "🗄️", "📋", "📁", "📂", "🗂️", "🗞️", "📰", "📓", "📔", "📒", "📕", "📗", "📘", "📙", "📚", "📖",
        "🔖", "🧷", "🔗", "📎", "🖇️", "📐", "📏", "🧮", "📌", "📍", "✂️", "🖊️", "🖋️", "✒️", "🖌️", "🖍️",
        "📝", "✏️", "🔍", "🔎", "🔏", "🔐", "🔒", "🔓"
      ]
    },
    {
      id: "symbols",
      label: "✅",
      title: "Символы",
      emojis: [
        "✅", "✔️", "☑️", "❎", "❌", "⭕", "🛑", "⛔", "📛", "🚫", "💯", "💢", "♨️", "🚷", "🚯", "🚳",
        "🚱", "🔞", "📵", "🚭", "❗", "❕", "❓", "❔", "‼️", "⁉️", "🔅", "🔆", "〽️", "⚠️", "🚸", "🔱",
        "⚜️", "🔰", "♻️", "✅", "🈯", "💹", "❇️", "✳️", "❎", "🌐", "💠", "Ⓜ️", "🌀", "💤", "🏧", "🚾",
        "♿", "🅿️", "🛗", "🛂", "🛃", "🛄", "🛅", "🚹", "🚺", "🚼", "⚧️", "🚻", "🚮", "🎦", "📶", "🈁",
        "🔣", "ℹ️", "🔤", "🔡", "🔠", "🆖", "🆗", "🆙", "🆒", "🆕", "🆓", "0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣",
        "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟", "🔢", "#️⃣", "*️⃣", "⏏️", "▶️", "⏸️", "⏯️", "⏹️", "⏺️", "⏭️",
        "⏮️", "⏩", "⏪", "⏫", "⏬", "◀️", "🔼", "🔽", "➡️", "⬅️", "⬆️", "⬇️", "↗️", "↘️", "↙️", "↖️",
        "↕️", "↔️", "↪️", "↩️", "⤴️", "⤵️", "🔀", "🔁", "🔂", "🔄", "🔃", "🎵", "🎶", "➕", "➖", "➗",
        "✖️", "♾️", "💲", "💱", "™️", "©️", "®️", "👁️‍🗨️", "🔚", "🔙", "🔛", "🔝", "🔜", "〰️", "➰", "➿",
        "✔️", "🔃", "➕", "➖", "✔️", "☑️", "🔘", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "🟤",
        "🔺", "🔻", "🔸", "🔹", "🔶", "🔷", "🔳", "🔲", "▪️", "▫️", "◾", "◽", "◼️", "◻️", "🟥", "🟧",
        "🟨", "🟩", "🟦", "🟪", "⬛", "⬜", "🟫", "🔈", "🔇", "🔉", "🔊", "🔔", "🔕", "📣", "📢", "💬",
        "💭", "🗯️", "♠️", "♣️", "♥️", "♦️", "🃏", "🎴", "🀄", "🕐", "🕑", "🕒", "🕓", "🕔", "🕕", "🕖",
        "🕗", "🕘", "🕙", "🕚", "🕛", "🕜", "🕝", "🕞", "🕟", "🕠", "🕡", "🕢", "🕣", "🕤", "🕥", "🕦", "🕧"
      ]
    },
    {
      id: "flags",
      label: "🏳️",
      title: "Флаги",
      emojis: [
        "🏳️", "🏴", "🏁", "🚩", "🏳️‍🌈", "🏳️‍⚧️", "🏴‍☠️", "🇷🇺", "🇺🇸", "🇬🇧", "🇪🇺", "🇩🇪", "🇫🇷", "🇮🇹", "🇪🇸", "🇨🇳",
        "🇯🇵", "🇰🇷", "🇮🇳", "🇧🇷", "🇨🇦", "🇦🇺", "🇹🇷", "🇺🇦", "🇧🇾", "🇰🇿", "🇺🇿", "🇦🇲", "🇬🇪", "🇦🇿", "🇫🇮", "🇸🇪",
        "🇳🇴", "🇵🇱", "🇨🇿", "🇸🇰", "🇭🇺", "🇷🇴", "🇧🇬", "🇬🇷", "🇵🇹", "🇳🇱", "🇧🇪", "🇨🇭", "🇦🇹", "🇩🇰", "🇮🇪", "🇮🇱",
        "🇦🇪", "🇸🇦", "🇪🇬", "🇿🇦", "🇲🇽", "🇦🇷", "🇨🇱", "🇨🇴", "🇵🇪", "🇨🇺", "🇻🇳", "🇹🇭", "🇮🇩", "🇲🇾", "🇸🇬", "🇵🇭"
      ]
    }
  ];

  // Drop accidental non-emoji English leftovers if any slipped in
  const cleanList = (list) =>
    list.filter((e) => typeof e === "string" && /[^\u0000-\u00ff]/.test(e) && e.length <= 8);

  EMOJI_CATEGORIES.forEach((cat) => {
    cat.emojis = [...new Set(cleanList(cat.emojis))];
  });

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
    if (preview) {
      preview.innerHTML = source.value || "<span class='form-note'>Превью текста появится здесь</span>";
    }
    source.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const exec = (command, value = null) => {
    document.execCommand(command, false, value);
  };

  const closeAllEmojiPanels = (except = null) => {
    document.querySelectorAll(".rich-emoji-panel.is-open").forEach((panel) => {
      if (panel === except) return;
      panel.classList.remove("is-open");
      panel.hidden = true;
      const toggle = panel.closest(".rich-emoji")?.querySelector(".rich-emoji-toggle");
      if (toggle) toggle.setAttribute("aria-expanded", "false");
    });
  };

  const renderEmojiGrid = (panel, categoryId) => {
    const cat =
      EMOJI_CATEGORIES.find((c) => c.id === categoryId) || EMOJI_CATEGORIES[0];
    const grid = panel.querySelector(".rich-emoji-grid");
    const title = panel.querySelector(".rich-emoji-cat-title");
    if (title) title.textContent = cat.title;
    if (!grid) return;
    grid.innerHTML = cat.emojis
      .map((e) => `<button type="button" class="rich-emoji-item" data-emoji="${e}" title="${e}">${e}</button>`)
      .join("");
    panel.querySelectorAll(".rich-emoji-tab").forEach((tab) => {
      tab.classList.toggle("is-active", tab.getAttribute("data-cat") === cat.id);
    });
  };

  const mountOne = (textarea, options = {}) => {
    if (!textarea || textarea.dataset.richMounted === "1") return null;
    textarea.dataset.richMounted = "1";

    const wrap = document.createElement("div");
    wrap.className = "rich-field";
    wrap.dataset.preview = options.preview || "text";

    const labelText =
      options.label || textarea.closest(".field")?.querySelector("label")?.textContent || "Текст";

    wrap.innerHTML = `
      <div class="rich-toolbar" role="toolbar" aria-label="Форматирование">
        <button type="button" data-cmd="bold" title="Жирный"><b>B</b></button>
        <button type="button" data-cmd="italic" title="Курсив"><i>I</i></button>
        <button type="button" data-cmd="insertUnorderedList" title="Маркированный список">• Список</button>
        <button type="button" data-cmd="insertOrderedList" title="Нумерованный список">1. Список</button>
        <button type="button" data-cmd="removeFormat" title="Очистить формат">✕</button>
        <div class="rich-emoji">
          <button type="button" class="rich-emoji-toggle" title="Смайлики" aria-label="Смайлики" aria-expanded="false" aria-haspopup="true">😊</button>
          <div class="rich-emoji-panel" hidden role="dialog" aria-label="Выбор смайлика">
            <div class="rich-emoji-tabs">
              ${EMOJI_CATEGORIES.map(
                (c, i) =>
                  `<button type="button" class="rich-emoji-tab${i === 0 ? " is-active" : ""}" data-cat="${c.id}" title="${escapeHtml(c.title)}">${c.label}</button>`
              ).join("")}
            </div>
            <div class="rich-emoji-cat-title">${escapeHtml(EMOJI_CATEGORIES[0].title)}</div>
            <div class="rich-emoji-grid"></div>
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
        closeAllEmojiPanels();
        editor.focus();
        exec(btn.getAttribute("data-cmd"));
        syncSource(wrap);
      });
    });

    const panel = wrap.querySelector(".rich-emoji-panel");
    const toggle = wrap.querySelector(".rich-emoji-toggle");
    renderEmojiGrid(panel, EMOJI_CATEGORIES[0].id);

    const openPanel = () => {
      closeAllEmojiPanels(panel);
      panel.hidden = false;
      panel.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
    };

    const closePanel = () => {
      panel.hidden = true;
      panel.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    };

    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (panel.classList.contains("is-open")) closePanel();
      else openPanel();
    });

    panel.addEventListener("click", (e) => e.stopPropagation());

    panel.querySelectorAll(".rich-emoji-tab").forEach((tab) => {
      tab.addEventListener("click", (e) => {
        e.preventDefault();
        renderEmojiGrid(panel, tab.getAttribute("data-cat"));
      });
    });

    panel.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-emoji]");
      if (!btn) return;
      e.preventDefault();
      editor.focus();
      exec("insertText", btn.getAttribute("data-emoji"));
      closePanel();
      syncSource(wrap);
    });

    editor.addEventListener("input", () => syncSource(wrap));
    editor.addEventListener("blur", () => syncSource(wrap));

    return wrap;
  };

  // Global close: click outside or Escape
  if (!window.__NMP_emojiOutsideBound) {
    window.__NMP_emojiOutsideBound = true;
    document.addEventListener("click", () => closeAllEmojiPanels());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllEmojiPanels();
    });
  }

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

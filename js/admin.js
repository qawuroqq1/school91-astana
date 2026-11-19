/* Admin panel enhancements: language tabs, rich-text editor, confirmations, uploads. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const csrf = document.body.dataset.csrf || "";

  /* sidebar on mobile */
  $("[data-toggle-side]")?.addEventListener("click", () => $("#a-side")?.classList.toggle("is-open"));

  /* language tabs (without JS all languages are shown one under another) */
  $$("[data-tabs]").forEach((tabs) => {
    tabs.classList.add("js-tabs");
    const buttons = $$("[data-tab]", tabs);
    const select = (lang) => {
      buttons.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === lang)));
      $$("[data-panel]", tabs).forEach((p) => p.toggleAttribute("data-inactive", p.dataset.panel !== lang));
    };
    buttons.forEach((b) => {
      b.addEventListener("click", () => select(b.dataset.tab));
      b.addEventListener("keydown", (e) => {
        const i = buttons.indexOf(b);
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          const next = buttons[(i + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length];
          next.focus();
          select(next.dataset.tab);
        }
      });
    });
  });

  /* confirm destructive actions */
  document.addEventListener("submit", (e) => {
    const form = e.target;
    if (form.dataset.confirm && !window.confirm(form.dataset.confirm)) {
      e.preventDefault();
      return;
    }
    const btn = form.querySelector('button[type="submit"]');
    if (btn) setTimeout(() => btn.setAttribute("aria-busy", "true"), 0);
  });

  /* warn about unsaved changes */
  let dirty = false;
  $$("form.a-form").forEach((f) => {
    f.addEventListener("input", () => (dirty = true));
    f.addEventListener("submit", () => (dirty = false));
  });
  window.addEventListener("beforeunload", (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  /* drag & drop highlight for upload fields */
  $$(".a-drop").forEach((zone) => {
    ["dragenter", "dragover"].forEach((ev) => zone.addEventListener(ev, () => zone.classList.add("is-over")));
    ["dragleave", "drop"].forEach((ev) => zone.addEventListener(ev, () => zone.classList.remove("is-over")));
  });

  /* ------------------------------------------------- rich-text editor
     A deliberately small editor: headings, emphasis, lists, links, images,
     tables, and an HTML source mode. Output is sanitized on the server. */
  const TOOLS = [
    ["h2", "H2", "formatBlock", "<h2>"],
    ["h3", "H3", "formatBlock", "<h3>"],
    ["p", "¶", "formatBlock", "<p>"],
    "sep",
    ["b", "B", "bold"],
    ["i", "I", "italic"],
    ["u", "U", "underline"],
    "sep",
    ["ul", "• Список", "insertUnorderedList"],
    ["ol", "1. Список", "insertOrderedList"],
    ["quote", "❝", "formatBlock", "<blockquote>"],
    "sep",
    ["link", "Ссылка", "link"],
    ["image", "Фото", "image"],
    ["table", "Таблица", "table"],
    ["clear", "Очистить", "removeFormat"],
    "sep",
    ["source", "HTML", "source"],
  ];

  async function uploadImage() {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/jpeg,image/png,image/webp,image/gif";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        const fd = new FormData();
        fd.append("_csrf", csrf);
        fd.append("file", file);
        try {
          const res = await fetch("/admin/upload-image", { method: "POST", body: fd, headers: { "X-CSRF-Token": csrf } });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Ошибка загрузки");
          resolve(data.url);
        } catch (err) {
          alert(err.message);
          resolve(null);
        }
      };
      input.click();
    });
  }

  $$("textarea.rte").forEach((ta) => {
    const wrap = document.createElement("div");
    wrap.className = "rte-wrap";
    const bar = document.createElement("div");
    bar.className = "rte-bar";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Форматирование");
    const area = document.createElement("div");
    area.className = "rte-area";
    area.contentEditable = "true";
    area.setAttribute("role", "textbox");
    area.setAttribute("aria-multiline", "true");
    area.dataset.placeholder = "Начните вводить текст…";
    area.innerHTML = ta.value;
    let sourceMode = false;

    for (const t of TOOLS) {
      if (t === "sep") {
        const s = document.createElement("span");
        s.className = "sep";
        bar.appendChild(s);
        continue;
      }
      const [id, label, cmd, arg] = t;
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.title = label;
      b.dataset.tool = id;
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", async () => {
        if (cmd === "source") {
          sourceMode = !sourceMode;
          if (sourceMode) {
            ta.value = area.innerHTML;
            ta.className = "rte-source";
            ta.hidden = false;
            area.hidden = true;
          } else {
            area.innerHTML = ta.value;
            ta.hidden = true;
            area.hidden = false;
          }
          return;
        }
        if (sourceMode) return;
        area.focus();
        if (cmd === "link") {
          const url = prompt("Адрес ссылки (https://… или /ru/…)");
          if (url) document.execCommand("createLink", false, url);
        } else if (cmd === "image") {
          const url = await uploadImage();
          if (url) document.execCommand("insertHTML", false, `<img src="${url}" alt="" />`);
        } else if (cmd === "table") {
          const rows = Number(prompt("Сколько строк?", "3")) || 3;
          const cols = Number(prompt("Сколько столбцов?", "3")) || 3;
          let h = "<table><thead><tr>" + "<th>Заголовок</th>".repeat(cols) + "</tr></thead><tbody>";
          for (let r = 0; r < rows; r++) h += "<tr>" + "<td>&nbsp;</td>".repeat(cols) + "</tr>";
          document.execCommand("insertHTML", false, h + "</tbody></table><p></p>");
        } else {
          document.execCommand(cmd, false, arg);
        }
        sync();
      });
      bar.appendChild(b);
    }
    // Paste as clean text to avoid importing Word styles.
    area.addEventListener("paste", (e) => {
      const html = e.clipboardData?.getData("text/html");
      const text = e.clipboardData?.getData("text/plain");
      if (html && /class="?Mso|urn:schemas-microsoft/.test(html)) {
        e.preventDefault();
        document.execCommand("insertText", false, text || "");
      }
    });
    function sync() {
      if (!sourceMode) ta.value = area.innerHTML.replace(/<p><br><\/p>$/, "");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }
    area.addEventListener("input", sync);
    ta.hidden = true;
    ta.parentNode.insertBefore(wrap, ta);
    wrap.append(bar, area, ta);
    ta.closest("form")?.addEventListener("submit", () => {
      if (!sourceMode) ta.value = area.innerHTML;
    });
  });
})();

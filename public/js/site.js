/* School No. 91 — interactions & motion system (no dependencies).
   Everything here is progressive enhancement: the site works without JS. */
(() => {
  "use strict";
  const doc = document.documentElement;
  doc.classList.add("js");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const motionOK = () => !reduceMotion.matches && !doc.classList.contains("a11y");

  /* ---------------------------------------------- scroll reveal + counters */
  function animateCount(el) {
    const target = Number(el.dataset.count);
    if (!Number.isFinite(target) || !motionOK()) return;
    const duration = 1400;
    const start = performance.now();
    const fmt = new Intl.NumberFormat(doc.lang || "ru");
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 4);
      el.textContent = fmt.format(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  const revealEls = $$("[data-reveal]");
  if ("IntersectionObserver" in window && revealEls.length) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          $$("[data-count]", e.target).forEach(animateCount);
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-in"));
  }

  /* --------------------------------------- sticky header state + parallax */
  const header = $("[data-header]");
  const parallax = $$("[data-parallax]");
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      if (header) header.classList.toggle("is-scrolled", y > 8);
      if (motionOK()) {
        for (const el of parallax) {
          const r = el.getBoundingClientRect();
          if (r.bottom < 0 || r.top > innerHeight) continue;
          const offset = (r.top + r.height / 2 - innerHeight / 2) * -0.08;
          const img = el.querySelector("img");
          if (img) img.style.setProperty("--py", `${offset.toFixed(1)}px`);
        }
      }
      ticking = false;
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ------------------------------------------------------- mega menu */
  const items = $$("[data-menu]");
  let closeTimer = 0;
  const closeAll = (except) => {
    for (const it of items) {
      if (it === except) continue;
      it.classList.remove("is-open");
      const link = it.querySelector(".main-nav__link");
      if (link) link.setAttribute("aria-expanded", "false");
    }
  };
  const open = (it) => {
    clearTimeout(closeTimer);
    closeAll(it);
    it.classList.add("is-open");
    it.querySelector(".main-nav__link")?.setAttribute("aria-expanded", "true");
  };
  for (const it of items) {
    const link = it.querySelector(".main-nav__link");
    it.addEventListener("mouseenter", () => finePointer.matches && open(it));
    it.addEventListener("mouseleave", () => {
      if (!finePointer.matches) return;
      closeTimer = setTimeout(() => closeAll(), 160);
    });
    // Keyboard / touch: first activation opens the panel, second follows the link.
    link?.addEventListener("click", (e) => {
      if (!it.classList.contains("is-open")) {
        e.preventDefault();
        open(it);
      }
    });
    link?.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        open(it);
        it.querySelector(".mega a")?.focus();
      }
    });
    it.addEventListener("focusout", (e) => {
      if (!it.contains(e.relatedTarget)) it.classList.remove("is-open");
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const openItem = items.find((i) => i.classList.contains("is-open"));
    if (openItem) {
      closeAll();
      openItem.querySelector(".main-nav__link")?.focus();
    }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-menu]")) closeAll();
  });

  /* ------------------------------------------------------ focus trap util */
  function trapFocus(container, e) {
    if (e.key !== "Tab") return;
    const f = $$('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])', container).filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /* ------------------------------------------------------- mobile drawer */
  const drawer = $("#drawer");
  const burger = $("[data-drawer-open]");
  let lastFocus = null;
  function openDrawer() {
    if (!drawer) return;
    lastFocus = document.activeElement;
    drawer.hidden = false;
    document.body.style.overflow = "hidden";
    burger?.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => requestAnimationFrame(() => drawer.classList.add("is-open")));
    setTimeout(() => $(".drawer__panel button, .drawer__panel a", drawer)?.focus(), 50);
  }
  function closeDrawer() {
    if (!drawer || drawer.hidden) return;
    drawer.classList.remove("is-open");
    burger?.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
    setTimeout(() => (drawer.hidden = true), motionOK() ? 460 : 0);
    lastFocus?.focus?.();
  }
  burger?.addEventListener("click", openDrawer);
  $$("[data-drawer-close]").forEach((b) => b.addEventListener("click", closeDrawer));
  drawer?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
    trapFocus($(".drawer__panel", drawer), e);
  });

  /* ------------------------------------------------------- search overlay */
  const overlay = $("#search-overlay");
  function openSearch(e) {
    if (!overlay) return;
    e?.preventDefault();
    lastFocus = document.activeElement;
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => $("input", overlay)?.focus(), 30);
  }
  function closeSearch() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    document.body.style.overflow = "";
    lastFocus?.focus?.();
  }
  $$("[data-search-open]").forEach((a) => a.addEventListener("click", openSearch));
  $$("[data-search-close]").forEach((b) => b.addEventListener("click", closeSearch));
  overlay?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSearch();
    trapFocus(overlay, e);
  });
  document.addEventListener("keydown", (e) => {
    const typing = /input|textarea|select/i.test(document.activeElement?.tagName || "") || document.activeElement?.isContentEditable;
    if (e.key === "/" && !typing && overlay?.hidden) openSearch(e);
  });

  /* -------------------------------------------- low-vision version panel */
  const A11Y_COOKIE = "s91_a11y";
  const panel = $("#a11y-panel");
  function readPrefs() {
    const m = document.cookie.match(new RegExp(`(?:^|; )${A11Y_COOKIE}=([^;]*)`));
    const prefs = { on: false, f: 0, c: "normal", i: 1 };
    if (m) for (const part of decodeURIComponent(m[1]).split(",")) {
      const [k, v] = part.split(":");
      if (k === "on") prefs.on = v === "1";
      if (k === "f") prefs.f = Number(v) || 0;
      if (k === "c") prefs.c = v;
      if (k === "i") prefs.i = Number(v);
    }
    return prefs;
  }
  function applyPrefs(p) {
    doc.classList.toggle("a11y", p.on);
    doc.classList.remove("a11y-font-1", "a11y-font-2", "a11y-scheme-high", "a11y-scheme-inverse", "a11y-noimg");
    if (p.on) {
      if (p.f) doc.classList.add(`a11y-font-${p.f}`);
      if (p.c !== "normal") doc.classList.add(`a11y-scheme-${p.c}`);
      if (!p.i) doc.classList.add("a11y-noimg");
    }
    const value = `on:${p.on ? 1 : 0},f:${p.f},c:${p.c},i:${p.i}`;
    document.cookie = `${A11Y_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${p.on ? 31536000 : 0}; samesite=lax`;
    if (panel) {
      panel.hidden = !p.on;
      $$("[data-a11y]", panel).forEach((b) => {
        const [k, v] = b.dataset.a11y.split(":");
        if (k === "f") b.setAttribute("aria-pressed", String(Number(v) === p.f));
        if (k === "c") b.setAttribute("aria-pressed", String(v === p.c));
        if (k === "i") b.setAttribute("aria-pressed", String(Number(v) === p.i));
      });
    }
    $$("[data-a11y-toggle]").forEach((b) => b.setAttribute("aria-expanded", String(p.on)));
  }
  $$("[data-a11y-toggle]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const p = readPrefs();
      p.on = !p.on;
      applyPrefs(p);
      closeDrawer();
      if (p.on) panel?.querySelector("button")?.focus();
    }),
  );
  panel?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-a11y]");
    if (!b) return;
    const p = readPrefs();
    const [k, v] = b.dataset.a11y.split(":");
    if (k === "reset") {
      applyPrefs({ on: false, f: 0, c: "normal", i: 1 });
      return;
    }
    p.on = true;
    if (k === "f") p.f = Number(v);
    if (k === "c") p.c = v;
    if (k === "i") p.i = Number(v);
    applyPrefs(p);
  });

  // Static hosting (GitHub Pages) can't read the cookie on the server: apply saved prefs here.
  {
    const saved = readPrefs();
    if (saved.on && !doc.classList.contains("a11y")) applyPrefs(saved);
  }

  /* ------------------------------------------- static search (GitHub Pages) */
  const staticSearch = $("[data-static-search]");
  if (staticSearch) {
    const d = staticSearch.dataset;
    const base = document.body.dataset.staticBase || "";
    const q = (new URLSearchParams(location.search).get("q") || "").trim();
    const input = $(".search-big input");
    if (input) input.value = q;
    const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const mark = (text, query) => {
      const lower = text.toLocaleLowerCase();
      const ql = query.toLocaleLowerCase();
      let out = "";
      let i = 0;
      let idx;
      while ((idx = lower.indexOf(ql, i)) !== -1) {
        out += esc(text.slice(i, idx)) + "<mark>" + esc(text.slice(idx, idx + query.length)) + "</mark>";
        i = idx + query.length;
      }
      return out + esc(text.slice(i));
    };
    if (q.length === 1) staticSearch.innerHTML = `<p class="muted">${esc(d.tShort)}</p>`;
    if (q.length >= 2) {
      fetch(`${base}/search-index-${d.lang}.json`)
        .then((r) => r.json())
        .then((items) => {
          const ql = q.toLocaleLowerCase();
          const hits = items
            .map((it) => {
              const inTitle = it.title.toLocaleLowerCase().includes(ql);
              const pos = it.text.toLocaleLowerCase().indexOf(ql);
              return { ...it, score: (inTitle ? 10 : 0) + (pos >= 0 ? 1 : 0), pos };
            })
            .filter((h) => h.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 60);
          if (!hits.length) {
            staticSearch.innerHTML = `<div class="empty"><p>${esc(d.tNone.replace("{q}", q))}</p></div>`;
            return;
          }
          const typeLabel = { page: d.tPage, news: d.tNews, doc: d.tDoc };
          staticSearch.innerHTML =
            `<p class="search-count" role="status">${esc(d.tResults.replace("{n}", hits.length))}</p><ol class="hits">` +
            hits
              .map((h) => {
                const start = Math.max(0, h.pos - 70);
                const snippet = h.pos >= 0 ? (start ? "…" : "") + h.text.slice(start, start + 220) + "…" : "";
                const href = h.href.startsWith("/") ? base + h.href + (h.type === "doc" ? "" : "/") : h.href;
                return `<li class="hit"><span class="hit__type">${esc(typeLabel[h.type] || "")}${h.context ? " · " + esc(h.context) : ""}</span><a class="hit__title" href="${esc(href)}">${mark(h.title, q)}</a>${snippet ? `<p class="hit__snippet">${mark(snippet, q)}</p>` : ""}</li>`;
              })
              .join("") +
            "</ol>";
        })
        .catch(() => (staticSearch.innerHTML = ""));
    }
  }

  // Keep the current page visible in horizontally scrolling sub-navigation.
  $$(".pk-tabs [aria-current]").forEach((a) => {
    const list = a.closest("ul");
    if (list && list.scrollWidth > list.clientWidth) list.scrollLeft = a.offsetLeft - (list.clientWidth - a.offsetWidth) / 2;
  });

  /* ----------------------------------------- document catalog filters */
  $$("[data-catalog]").forEach((cat) => {
    const search = $("[data-catalog-search]", cat);
    const yearBtns = $$("[data-catalog-year]", cat);
    const count = $("[data-catalog-count]", cat);
    const none = $("[data-catalog-none]", cat);
    const rows = $$(".pk-act", cat);
    if (!search && !yearBtns.length) return;
    let year = "";
    const apply = () => {
      const q = (search?.value || "").trim().toLocaleLowerCase();
      let shown = 0;
      for (const r of rows) {
        const ok = (!year || r.dataset.year === year) && (!q || r.dataset.text.includes(q));
        r.hidden = !ok;
        if (ok) {
          shown++;
          r.classList.add("is-in");
        }
      }
      if (count) count.textContent = count.dataset.template.replace("{n}", shown);
      if (none) none.hidden = shown > 0;
    };
    search?.addEventListener("input", apply);
    yearBtns.forEach((b) =>
      b.addEventListener("click", () => {
        year = b.dataset.catalogYear;
        yearBtns.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        apply();
      }),
    );
  });

  /* --------------------------------------------------------- lightbox */
  const labels = document.body.dataset;
  function lightbox(links, index) {
    let i = index;
    const lastActive = document.activeElement;
    const box = document.createElement("div");
    box.className = "lightbox";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.innerHTML = `
      <span class="lightbox__count" aria-live="polite"></span>
      <figure class="lightbox__figure"><img class="lightbox__img" alt="" /><figcaption class="lightbox__caption"></figcaption></figure>
      <button class="lightbox__btn lightbox__close" type="button" aria-label="${labels.lbClose || "Close"}"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      <button class="lightbox__btn lightbox__prev" type="button" aria-label="${labels.lbPrev || "Previous"}"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="m15 6-6 6 6 6"/></svg></button>
      <button class="lightbox__btn lightbox__next" type="button" aria-label="${labels.lbNext || "Next"}"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg></button>`;
    const img = $(".lightbox__img", box);
    const cap = $(".lightbox__caption", box);
    const count = $(".lightbox__count", box);
    const single = links.length < 2;
    if (single) $$(".lightbox__prev, .lightbox__next", box).forEach((b) => (b.hidden = true));
    function show(n) {
      i = (n + links.length) % links.length;
      const a = links[i];
      img.classList.remove("is-loaded");
      img.onload = () => img.classList.add("is-loaded");
      img.src = a.getAttribute("href");
      img.alt = a.dataset.caption || "";
      cap.textContent = a.dataset.caption || "";
      count.textContent = single ? "" : `${i + 1} / ${links.length}`;
    }
    function close() {
      box.classList.remove("is-open");
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      setTimeout(() => box.remove(), motionOK() ? 300 : 0);
      lastActive?.focus?.();
    }
    function onKey(e) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight" && !single) show(i + 1);
      else if (e.key === "ArrowLeft" && !single) show(i - 1);
      else trapFocus(box, e);
    }
    $(".lightbox__close", box).addEventListener("click", close);
    $(".lightbox__prev", box).addEventListener("click", () => show(i - 1));
    $(".lightbox__next", box).addEventListener("click", () => show(i + 1));
    box.addEventListener("click", (e) => e.target === box && close());
    let touchX = null;
    box.addEventListener("touchstart", (e) => (touchX = e.touches[0].clientX), { passive: true });
    box.addEventListener("touchend", (e) => {
      if (touchX === null || single) return;
      const dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 50) show(i + (dx < 0 ? 1 : -1));
      touchX = null;
    });
    document.body.appendChild(box);
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    show(i);
    requestAnimationFrame(() => box.classList.add("is-open"));
    $(".lightbox__close", box).focus();
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-lightbox]");
    if (!a || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    const group = a.closest("[data-lightbox-group]");
    const links = group ? $$("a[data-lightbox]", group) : [a];
    lightbox(links, links.indexOf(a));
  });

  /* ------------------------------------------------------ magnetic buttons */
  if (finePointer.matches) {
    $$("[data-magnetic]").forEach((el) => {
      el.addEventListener("mousemove", (e) => {
        if (!motionOK()) return;
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * 0.18;
        const y = (e.clientY - r.top - r.height / 2) * 0.3;
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      });
      el.addEventListener("mouseleave", () => (el.style.transform = ""));
    });
  }

  /* ------------------------------------------------- forms: loading state */
  $$("form[data-form]").forEach((form) => {
    form.addEventListener("submit", (e) => {
      // Native validation messages are localized by the browser; focus the first invalid field.
      if (!form.checkValidity()) {
        e.preventDefault();
        const bad = form.querySelector(":invalid");
        bad?.focus();
        bad?.reportValidity?.();
        return;
      }
      const btn = form.querySelector('button[type="submit"]');
      if (btn) {
        btn.setAttribute("aria-busy", "true");
        if (btn.dataset.loadingText) btn.firstChild && (btn.childNodes[0].textContent = btn.dataset.loadingText + " ");
      }
    });
  });
  // Bring server-side form feedback into view and to screen readers.
  const focusMe = $("[data-focus]");
  if (focusMe) {
    focusMe.scrollIntoView({ block: "center", behavior: motionOK() ? "smooth" : "auto" });
    focusMe.focus({ preventScroll: true });
  }
})();

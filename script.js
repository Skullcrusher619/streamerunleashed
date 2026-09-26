// script.js
const omdbKey = "a8ec091b";
const tmdbKey = "2d1e85984a53ca91efbf0a4fd3650ef9";

const TMDB = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w342";
const OMDB = "https://www.omdbapi.com/";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Local fallback poster (via.placeholder.com is no longer reliable)
const PLACEHOLDER_POSTER = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><rect width="200" height="300" fill="#1c1a17"/><rect x="78" y="118" width="44" height="34" rx="4" fill="none" stroke="#6b655c" stroke-width="3"/><circle cx="92" cy="130" r="4" fill="#6b655c"/><path d="M80 150l14-12 10 8 8-6 10 10" fill="none" stroke="#6b655c" stroke-width="3"/><text x="100" y="186" font-family="sans-serif" font-size="13" fill="#6b655c" text-anchor="middle">No poster</text></svg>`
);

// DOM Elements
const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebarToggle");
const mainWrapper = document.getElementById("mainWrapper");
const searchInput = document.getElementById("titleInput");
const searchBtn = document.getElementById("searchBtn");
const searchClear = document.getElementById("searchClear");
const searchField = document.querySelector(".search-field");
const autocompleteDiv = document.getElementById("autocomplete");
const heroSection = document.getElementById("hero");
const heroShuffleBtn = document.getElementById("heroShuffleBtn");
const searchSection = document.getElementById("searchSection");
const searchCarousel = document.getElementById("searchCarousel");
const continueCarousel = document.getElementById("continueCarousel");
const recommendedCarousel = document.getElementById("recommendedCarousel");
const genreSelect = document.getElementById("genreSelect");
const favoritesCarousel = document.getElementById("favoritesCarousel");
const recentCarousel = document.getElementById("recentCarousel");
const detailsModal = document.getElementById("detailsModal");
const modalDetailsBody = document.getElementById("modalDetailsBody");
const playerModal = document.getElementById("playerModal");
const playerContainer = document.getElementById("playerContainer");
const toastContainer = document.getElementById("toastContainer");

let currentMedia = { imdbID: "", title: "", poster: "", type: "", season: 1, episode: 1, tmdbId: null };
let topUserGenre = "-";
let genreCounts = {};

// TMDB Genre Mapping (movies)
const tmdbGenreMap = {
  "Action": 28, "Adventure": 12, "Animation": 16, "Comedy": 35, "Crime": 80,
  "Documentary": 99, "Drama": 18, "Family": 10751, "Fantasy": 14, "History": 36,
  "Horror": 27, "Music": 10402, "Mystery": 9648, "Romance": 10749, "Sci-Fi": 878,
  "TV Movie": 10770, "Thriller": 53, "War": 10752, "Western": 37
};
// TMDB uses a different, coarser genre list for TV. Genres with no TV
// equivalent (Horror, Romance, Thriller...) fall back to movies only.
const tmdbTvGenreMap = {
  "Action": 10759, "Adventure": 10759, "Animation": 16, "Comedy": 35, "Crime": 80,
  "Documentary": 99, "Drama": 18, "Family": 10751, "Fantasy": 10765, "Mystery": 9648,
  "Sci-Fi": 10765, "War": 10768, "Western": 37
};
// News, Reality, Soap, Talk — not what people mean by "series" here
const TV_EXCLUDED_GENRES = "10763,10764,10766,10767";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const wait = ms => new Promise(r => setTimeout(r, ms));
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const unique = arr => [...new Set(arr)];
const isImdbId = v => typeof v === "string" && /^tt\d{5,10}$/.test(v);
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const yearOf = item => (item.release_date || item.first_air_date || "").substring(0, 4);

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function weightedPick(entries) { // entries: [{ value, weight }]
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const e of entries) { r -= e.weight; if (r <= 0) return e.value; }
  return entries.length ? entries[entries.length - 1].value : null;
}

function safeParse(str, fallback) {
  try { const v = JSON.parse(str); return v ?? fallback; } catch { return fallback; }
}

// Escaping helper - used whenever API/user text is inserted via innerHTML
function escapeHtml(str) {
  if (str === undefined || str === null) return "";
  return String(str).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

// Only allow http(s)/data-image URLs into src attributes
function safePoster(url) {
  if (typeof url === "string" && (/^https?:\/\//i.test(url) || url.startsWith("data:image/"))) return url;
  return PLACEHOLDER_POSTER;
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function timeAgo(ts) {
  if (!ts) return "";
  const s = Math.round((ts - Date.now()) / 1000);
  const a = Math.abs(s);
  if (a < 45) return "just now";
  const units = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unit, sec] of units) if (a >= sec) return rtf.format(Math.round(s / sec), unit);
  return rtf.format(s, "second");
}

// Line icons in the same style as the sidebar
const ICON_PATHS = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.8-4.8"/>',
  film: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M7.5 4.5v15M16.5 4.5v15M3.5 9.5h4M3.5 14.5h4M16.5 9.5h4M16.5 14.5h4"/>',
  heart: '<path d="M12 5.5c-1.3-2-3.4-2.7-5.2-1.9-1.9.8-3 2.9-2.6 5C4.7 12 8.4 15 12 18c3.6-3 7.3-6 7.8-9.4.4-2.1-.7-4.2-2.6-5-1.8-.8-3.9-.1-5.2 1.9Z"/>',
  clock: '<circle cx="12" cy="12.5" r="8"/><path d="M12 8v4.5l3 2"/>',
  alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5"/><circle cx="12" cy="16.4" r=".7" fill="currentColor" stroke="none"/>',
  offline: '<path d="M4 9.5a12 12 0 0 1 16 0M7 12.8a7.5 7.5 0 0 1 10 0M10 16a3 3 0 0 1 4 0"/><path d="M4 4l16 16"/>',
  sparkle: '<path d="M12 3.5c.6 2.7 1.6 4.4 3.3 5.8 1.7 1.4 3.4 1.9 5.2 2.2-1.8.3-3.5.8-5.2 2.2-1.7 1.4-2.7 3.1-3.3 5.8-.6-2.7-1.6-4.4-3.3-5.8C7 12.3 5.3 11.8 3.5 11.5c1.8-.3 3.5-.8 5.2-2.2C10.4 7.9 11.4 6.2 12 3.5Z"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="8.6" cy="8.6" r="1.1" fill="currentColor" stroke="none"/><circle cx="15.4" cy="8.6" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="8.6" cy="15.4" r="1.1" fill="currentColor" stroke="none"/><circle cx="15.4" cy="15.4" r="1.1" fill="currentColor" stroke="none"/>'
};
function svgIcon(name, cls = "") {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ""}</svg>`;
}

// ---------------------------------------------------------------------------
// Local Data Caching System
// ---------------------------------------------------------------------------
const cacheKey = "omdb_cache";
let cacheMem = null;

function getCache() {
  if (!cacheMem) {
    const parsed = safeParse(localStorage.getItem(cacheKey), {});
    cacheMem = (parsed && typeof parsed === "object" && !Array.isArray(parsed)) ? parsed : {};
  }
  return cacheMem;
}

function setCache(dataMap) {
  cacheMem = dataMap;
  try {
    localStorage.setItem(cacheKey, JSON.stringify(dataMap));
  } catch (e) {
    // Storage full: drop the oldest half of the cache and try once more
    const entries = Object.entries(dataMap).sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));
    cacheMem = Object.fromEntries(entries.slice(Math.floor(entries.length / 2)));
    try { localStorage.setItem(cacheKey, JSON.stringify(cacheMem)); } catch { /* give up quietly */ }
  }
}

function cacheGet(key, ttl = 0) {
  const entry = getCache()[key];
  if (!entry) return null;
  if (ttl && Date.now() - (entry.ts || 0) > ttl) return null;
  return entry.data;
}

/**
 * fetch + JSON + optional cache.
 * - ttl: max age in ms for cached entries (0 = never expires)
 * - timeout: aborts slow requests so nothing sits on "Loading..." forever
 * Network failures come back as { Response: "False", networkError: true, Error }.
 */
async function fetchWithCache(url, idKey = null, { ttl = 0, timeout = 12000 } = {}) {
  if (idKey) {
    const hit = cacheGet(idKey, ttl);
    if (hit) return hit;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const data = await res.json();
    const isOmdbError = data.Response === "False";
    const isTmdbError = data.success === false;
    if (!isOmdbError && !isTmdbError && idKey) {
      const cache = getCache();
      cache[idKey] = { data, ts: Date.now() };
      setCache(cache);
    }
    return data;
  } catch (e) {
    console.error("Fetch error:", e);
    return {
      Response: "False", success: false, networkError: true,
      Error: e.name === "AbortError" ? "The request timed out." : "Couldn't reach the server."
    };
  } finally {
    clearTimeout(timer);
  }
}

// One canonical way to load a title, so the cache never mixes short/full plots
const getTitle = imdbID => fetchWithCache(`${OMDB}?i=${encodeURIComponent(imdbID)}&plot=full&apikey=${omdbKey}`, imdbID);

// ---------------------------------------------------------------------------
// Storage Utils
// ---------------------------------------------------------------------------
const getList = key => {
  const v = safeParse(localStorage.getItem(key), []);
  return Array.isArray(v) ? v : [];
};
function storeList(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); }
  catch { showToast("Couldn't save — browser storage is full.", { tone: "error" }); }
}
const saveList = (key, val) => { storeList(key, val); renderAnalytics(); };

// ---------------------------------------------------------------------------
// Feedback: toasts + one shared "state" component for empty/error/loading
// ---------------------------------------------------------------------------
function showToast(message, { tone = "info" } = {}) {
  const toast = document.createElement("div");
  toast.className = `toast-msg${tone === "error" ? " toast--error" : ""}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3000);
}

/**
 * Same visual language everywhere: carousels, search, details modal, player.
 * tone: "empty" | "error" | "loading"
 * actions: [{ label, onClick, primary }]
 */
function buildState({ tone = "empty", icon = "film", title = "", message = "", actions = [] } = {}) {
  const el = document.createElement("div");
  el.className = `state state--${tone}`;
  el.setAttribute("role", tone === "error" ? "alert" : "status");

  const iconHtml = tone === "loading"
    ? '<span class="state-spinner" aria-hidden="true"></span>'
    : `<span class="state-icon">${svgIcon(icon)}</span>`;
  el.innerHTML = `${iconHtml}
    <div class="state-text">
      ${title ? `<p class="state-title">${escapeHtml(title)}</p>` : ""}
      ${message ? `<p class="state-message">${escapeHtml(message)}</p>` : ""}
    </div>`;

  if (actions.length) {
    const row = document.createElement("div");
    row.className = "state-actions";
    actions.forEach(a => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `btn btn-sm ${a.primary ? "primary-btn" : "secondary-btn"}`;
      b.textContent = a.label;
      b.addEventListener("click", a.onClick);
      row.appendChild(b);
    });
    el.appendChild(row);
  }
  return el;
}

function renderState(container, opts) {
  container.setAttribute("aria-busy", "false");
  container.replaceChildren(buildState(opts));
}

function showSkeletons(container, count = 8) {
  container.setAttribute("aria-busy", "true");
  container.innerHTML = Array(count).fill('<div class="skeleton-card" aria-hidden="true"></div>').join("");
}

// ---------------------------------------------------------------------------
// Modal manager: focus trap, Escape, click-outside, focus restore
// ---------------------------------------------------------------------------
const modalStack = []; // [{ el, returnFocus, returnImdb }]
const mobileMQ = window.matchMedia("(max-width: 768px)");

const isModalOpen = el => modalStack.some(m => m.el === el);
const topModal = () => modalStack[modalStack.length - 1];

function syncInert() {
  const modalOpen = modalStack.length > 0;
  mainWrapper.inert = modalOpen;
  sidebar.inert = modalOpen || (mobileMQ.matches && !sidebar.classList.contains("show"));
}

function openModal(el, { returnFocus = document.activeElement } = {}) {
  if (isModalOpen(el)) return;
  modalStack.push({ el, returnFocus, returnImdb: returnFocus?.dataset?.imdbid || null });
  el.style.display = "flex";
  document.body.style.overflow = "hidden";
  syncInert();
  const closeBtn = el.querySelector(".close-btn");
  if (closeBtn) closeBtn.focus({ preventScroll: true });
}

function closeModal(elOrId, { restoreFocus = true } = {}) {
  const el = typeof elOrId === "string" ? document.getElementById(elOrId) : elOrId;
  const idx = modalStack.findIndex(m => m.el === el);
  el.style.display = "none";
  if (idx === -1) return null;

  const [entry] = modalStack.splice(idx, 1);
  if (!modalStack.length) document.body.style.overflow = "";
  syncInert();

  if (restoreFocus) {
    let target = entry.returnFocus;
    // The opener may have been re-rendered (e.g. a carousel refreshed); find its replacement
    if ((!target || !document.contains(target)) && entry.returnImdb) {
      target = document.querySelector(`.result-card[data-imdbid="${CSS.escape(entry.returnImdb)}"]`);
    }
    if (target && document.contains(target)) target.focus({ preventScroll: true });
  }
  return entry;
}

function trapTab(e, container) {
  const focusables = [...container.querySelectorAll(
    'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea, iframe, [tabindex]:not([tabindex="-1"])'
  )].filter(el => el.offsetParent !== null);
  if (!focusables.length) { e.preventDefault(); return; }

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (!container.contains(document.activeElement)) { e.preventDefault(); first.focus(); return; }
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

// Click on the dimmed backdrop closes the details modal. Both press and release
// must land on the backdrop, so drag-selecting text inside can't close it.
(function setupBackdropClose() {
  let downOnBackdrop = false;
  detailsModal.addEventListener("pointerdown", e => { downOnBackdrop = e.target === detailsModal; });
  detailsModal.addEventListener("click", e => {
    if (downOnBackdrop && e.target === detailsModal) closeModal(detailsModal);
    downOnBackdrop = false;
  });
})();

document.getElementById("detailsCloseBtn").addEventListener("click", () => closeModal(detailsModal));
document.getElementById("playerCloseBtn").addEventListener("click", () => closePlayer());

// ---------------------------------------------------------------------------
// Sidebar & navigation
// ---------------------------------------------------------------------------
function setSidebar(open) {
  sidebar.classList.toggle("show", open);
  sidebarToggle.setAttribute("aria-expanded", String(open));
  sidebarToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  syncInert();
}

sidebarToggle.addEventListener("click", () => setSidebar(!sidebar.classList.contains("show")));
mobileMQ.addEventListener("change", syncInert);

sidebar.addEventListener("click", e => {
  const item = e.target.closest("[data-scroll], [data-action]");
  if (!item) return;
  e.preventDefault();
  if (item.dataset.scroll) scrollToSection(item.dataset.scroll);
  else if (item.dataset.action === "search") focusSearch();
  else if (item.dataset.action === "surprise") { setSidebar(false); surpriseMe(); }
});

document.getElementById("surpriseBtn").addEventListener("click", () => surpriseMe());

// Close the mobile sidebar when tapping outside it
document.addEventListener("click", e => {
  if (!sidebar.classList.contains("show")) return;
  if (!e.target.closest("#sidebar") && !e.target.closest("#sidebarToggle")) setSidebar(false);
});

function scrollToSection(id) {
  setSidebar(false);
  const section = document.getElementById(id);
  section.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  section.focus({ preventScroll: true }); // keyboard users land where they navigated
}

function focusSearch() {
  setSidebar(false);
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  setTimeout(() => searchInput.focus(), 300);
}

function scrollCarousel(id, direction) {
  const container = document.getElementById(id);
  const scrollAmount = container.clientWidth * 0.8;
  container.scrollBy({ left: scrollAmount * direction, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

document.addEventListener("click", e => {
  const btn = e.target.closest(".scroll-btn[data-carousel]");
  if (btn) scrollCarousel(btn.dataset.carousel, Number(btn.dataset.dir));
});

// ---------------------------------------------------------------------------
// Global keyboard handling
// ---------------------------------------------------------------------------
const isTypingTarget = el => !!(el && el.closest && el.closest('input, textarea, select, [contenteditable="true"]'));

document.addEventListener("keydown", e => {
  const top = topModal();
  if (top) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (top.el === playerModal) closePlayer(); else closeModal(top.el);
    } else if (e.key === "Tab") {
      trapTab(e, top.el);
    }
    return; // page shortcuts are off while a modal is open
  }

  if (e.key === "Escape" && sidebar.classList.contains("show")) {
    setSidebar(false);
    sidebarToggle.focus();
    return;
  }

  // "/" jumps to search from anywhere that isn't already a text field
  if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
    return;
  }

  handleCarouselKeys(e);
});

// ---------------------------------------------------------------------------
// Cards, favorites heart, roving-tabindex carousels
// ---------------------------------------------------------------------------
const favoriteIds = () => new Set(getList("favorites").map(f => f.imdbID));

function setHeart(btn, on) {
  const title = btn.dataset.title || "this title";
  btn.setAttribute("aria-pressed", String(on));
  btn.setAttribute("aria-label", on ? `Remove ${title} from favorites` : `Add ${title} to favorites`);
}

let captionSeq = 0;

/**
 * One card builder for every row.
 *  - imdbID known (OMDb rows) → heart toggles immediately
 *  - tmdb only (recommendations) → heart resolves the IMDb ID first
 */
function createCard({ imdbID = null, tmdb = null, title, subtitle = "", poster, badge = null, caption = null, onOpen, favSet }) {
  const shell = document.createElement("div");
  shell.className = "card-shell";

  const card = document.createElement("div");
  card.className = "result-card";
  card.tabIndex = -1;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", [title, subtitle, badge].filter(Boolean).join(", "));
  if (imdbID) card.dataset.imdbid = imdbID;
  card.innerHTML = `
    <img src="${escapeHtml(safePoster(poster))}" loading="lazy" alt="">
    ${badge ? `<span class="type-badge" aria-hidden="true">${escapeHtml(badge)}</span>` : ""}
    <div class="card-overlay" aria-hidden="true">
      <div class="play-icon">▶</div>
      <h4>${escapeHtml(title)}</h4>
      <p>${escapeHtml(subtitle)}</p>
    </div>`;
  const img = card.querySelector("img");
  img.addEventListener("error", () => { img.src = PLACEHOLDER_POSTER; }, { once: true });
  card.addEventListener("click", onOpen);

  const fav = document.createElement("button");
  fav.type = "button";
  fav.className = "card-fav";
  fav.tabIndex = -1;
  fav.dataset.title = title;
  if (imdbID) fav.dataset.imdbid = imdbID;
  fav.innerHTML = svgIcon("heart");
  setHeart(fav, !!(imdbID && (favSet || favoriteIds()).has(imdbID)));

  fav.addEventListener("click", async e => {
    e.stopPropagation();
    if (fav.getAttribute("aria-busy") === "true") return;
    let id = fav.dataset.imdbid;
    if (!id && tmdb) {
      fav.setAttribute("aria-busy", "true");
      id = await resolveImdbId({ id: tmdb.id, mediaType: tmdb.mediaType, title, year: tmdb.year });
      fav.removeAttribute("aria-busy");
      if (!id) { showToast(`Couldn't save ${title} — no matching record found.`, { tone: "error" }); return; }
      fav.dataset.imdbid = id;
      card.dataset.imdbid = id;
    }
    const added = toggleFavorite({ imdbID: id, title, poster: safePoster(poster) });
    if (added) { fav.classList.remove("pop"); void fav.offsetWidth; fav.classList.add("pop"); }
  });

  shell.append(card, fav);

  if (caption) {
    const cap = document.createElement("div");
    cap.className = "card-caption";
    cap.id = `cap-${++captionSeq}`;
    cap.innerHTML = `<span class="cap-primary">${escapeHtml(caption.primary)}</span>` +
      (caption.ts ? `<span class="cap-time" data-ts="${Number(caption.ts)}">${escapeHtml(timeAgo(caption.ts))}</span>` : "");
    card.setAttribute("aria-describedby", cap.id);
    shell.appendChild(cap);
  }
  return shell;
}

// Replaces a carousel's cards but keeps keyboard focus in place if it was inside.
function mountCards(container, shells) {
  const active = document.activeElement;
  let focusIdx = -1, focusFav = false;
  if (active && container.contains(active)) {
    const current = [...container.querySelectorAll(".card-shell")];
    focusIdx = current.indexOf(active.closest(".card-shell"));
    focusFav = active.classList.contains("card-fav");
  }

  container.replaceChildren(...shells);
  container.setAttribute("aria-busy", "false");
  if (!shells.length) return;

  const prev = Number(container.dataset.activeIndex || 0);
  setActiveCard(container, focusIdx > -1 ? focusIdx : prev, { focus: focusIdx > -1, fav: focusFav });
}

// Roving tabindex: one Tab stop per carousel, arrow keys move within it.
function setActiveCard(container, idx, { focus = false, fav = false } = {}) {
  const shells = [...container.querySelectorAll(".card-shell")];
  if (!shells.length) return;
  idx = clamp(idx, 0, shells.length - 1);
  shells.forEach((s, i) => {
    const on = i === idx;
    s.querySelector(".result-card").tabIndex = on ? 0 : -1;
    s.querySelector(".card-fav").tabIndex = on ? 0 : -1;
  });
  container.dataset.activeIndex = idx;
  if (focus) {
    shells[idx].querySelector(fav ? ".card-fav" : ".result-card").focus({ preventScroll: true });
    shells[idx].scrollIntoView({ block: "nearest", inline: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }
}

function handleCarouselKeys(e) {
  const shell = e.target.closest && e.target.closest(".carousel .card-shell");
  if (!shell) return;
  const carousel = shell.parentElement;
  const shells = [...carousel.querySelectorAll(".card-shell")];
  const idx = shells.indexOf(shell);
  const onFav = e.target.classList.contains("card-fav");

  let next;
  switch (e.key) {
    case "ArrowRight": next = idx + 1; break;
    case "ArrowLeft": next = idx - 1; break;
    case "Home": next = 0; break;
    case "End": next = shells.length - 1; break;
    case "Enter":
    case " ":
      if (e.target.classList.contains("result-card")) { e.preventDefault(); e.target.click(); }
      return;
    default: return;
  }
  e.preventDefault();
  if (next < 0 || next >= shells.length) return;
  setActiveCard(carousel, next, { focus: true, fav: onFav });
}

// Hover-style treatment for keyboard focus + keep roving index in sync with clicks/Tab
document.addEventListener("focusin", e => {
  const shell = e.target.closest && e.target.closest(".card-shell");
  if (!shell) return;
  shell.classList.add("keyboard-focus");
  const carousel = shell.closest(".carousel");
  if (carousel) {
    const idx = [...carousel.querySelectorAll(".card-shell")].indexOf(shell);
    if (String(idx) !== carousel.dataset.activeIndex) setActiveCard(carousel, idx);
  }
});
document.addEventListener("focusout", e => {
  const shell = e.target.closest && e.target.closest(".card-shell");
  if (shell && !shell.contains(e.relatedTarget)) shell.classList.remove("keyboard-focus");
});

function toggleFavorite({ imdbID, title, poster }) {
  const favs = getList("favorites");
  const index = favs.findIndex(f => f.imdbID === imdbID);
  const added = index === -1;
  if (added) favs.unshift({ title, poster, imdbID });
  else favs.splice(index, 1);
  saveList("favorites", favs);
  showToast(added ? `Added ${title} to Favorites` : `Removed ${title} from Favorites`);
  syncFavoriteUI(imdbID, added);
  renderFavorites();
  return added;
}

function syncFavoriteUI(imdbID, on) {
  document.querySelectorAll(`.card-fav[data-imdbid="${CSS.escape(imdbID)}"]`).forEach(b => setHeart(b, on));
  const modalBtn = document.getElementById("favBtnModal");
  if (modalBtn && modalBtn.dataset.imdbid === imdbID) setModalFavBtn(modalBtn, on);
}

function setModalFavBtn(btn, on) {
  btn.setAttribute("aria-pressed", String(on));
  btn.textContent = on ? "♥ Remove Favorite" : "♡ Add to Favorites";
}

// Keep "2 hours ago" labels honest while the page stays open
setInterval(() => {
  document.querySelectorAll(".cap-time[data-ts]").forEach(el => { el.textContent = timeAgo(Number(el.dataset.ts)); });
}, 60 * 1000);

// ---------------------------------------------------------------------------
// Search: clear button, recent searches, autocomplete
// ---------------------------------------------------------------------------
const RECENT_SEARCH_KEY = "recent_searches";
const MAX_RECENT_SEARCHES = 8;

const getRecentSearches = () => getList(RECENT_SEARCH_KEY).filter(s => typeof s === "string" && s.trim());
function rememberSearch(q) {
  const list = getRecentSearches().filter(s => s.toLowerCase() !== q.toLowerCase());
  list.unshift(q);
  storeList(RECENT_SEARCH_KEY, list.slice(0, MAX_RECENT_SEARCHES));
}
function removeRecentSearch(q) {
  storeList(RECENT_SEARCH_KEY, getRecentSearches().filter(s => s !== q));
}

let acTimer;
let acItems = [];
let acIndex = -1;
let acRequestId = 0;

function openAc() {
  autocompleteDiv.style.display = "block";
  searchInput.setAttribute("aria-expanded", "true");
}
function closeAc() {
  acRequestId++; // drop any in-flight suggestions
  autocompleteDiv.style.display = "none";
  searchInput.setAttribute("aria-expanded", "false");
  searchInput.removeAttribute("aria-activedescendant");
  acItems = [];
  acIndex = -1;
}
const isAcVisible = () => autocompleteDiv.style.display === "block";

function updateClearBtn() {
  const has = searchInput.value.length > 0;
  searchClear.hidden = !has;
  searchField.classList.toggle("has-value", has);
}

function setAcFocus() {
  acItems.forEach((el, i) => {
    el.classList.toggle("focused", i === acIndex);
    el.setAttribute("aria-selected", String(i === acIndex));
  });
  if (acIndex > -1) {
    acItems[acIndex].scrollIntoView({ block: "nearest" });
    searchInput.setAttribute("aria-activedescendant", acItems[acIndex].id);
  } else {
    searchInput.removeAttribute("aria-activedescendant");
  }
}

function showRecentSearches(keepIndex = -1) {
  const recents = getRecentSearches();
  if (!recents.length) { closeAc(); return; }
  acRequestId++;

  autocompleteDiv.innerHTML = "";
  const header = document.createElement("div");
  header.className = "ac-section-label";
  header.innerHTML = `<span>Recent searches</span><button type="button" class="ac-clear-all" tabindex="-1">Clear all</button>`;
  header.querySelector("button").addEventListener("click", () => {
    storeList(RECENT_SEARCH_KEY, []);
    closeAc();
    searchInput.focus();
  });
  autocompleteDiv.appendChild(header);

  recents.forEach((q, i) => {
    const row = document.createElement("div");
    row.className = "ac-item ac-recent";
    row.id = `ac-opt-${i}`;
    row.setAttribute("role", "option");
    row.dataset.query = q;
    row.innerHTML = `${svgIcon("clock", "ac-recent-icon")}
      <span class="ac-recent-text">${escapeHtml(q)}</span>
      <button type="button" class="ac-remove" tabindex="-1" aria-label="Remove ${escapeHtml(q)} from recent searches">×</button>`;
    row.addEventListener("click", e => {
      if (e.target.closest(".ac-remove")) {
        e.stopPropagation();
        deleteRecentRow(i);
        return;
      }
      searchInput.value = q;
      updateClearBtn();
      executeSearch();
    });
    autocompleteDiv.appendChild(row);
  });

  acItems = [...autocompleteDiv.querySelectorAll(".ac-item")];
  acIndex = keepIndex > -1 ? Math.min(keepIndex, acItems.length - 1) : -1;
  setAcFocus();
  openAc();
}

function deleteRecentRow(i) {
  const row = acItems[i];
  if (!row) return;
  const keep = acIndex > -1 ? i : -1;
  removeRecentSearch(row.dataset.query);
  showRecentSearches(keep);
  searchInput.focus();
}

async function showAutocomplete() {
  const query = searchInput.value.trim();
  if (query.length < 2) { showRecentSearches(); return; }

  const reqId = ++acRequestId;
  acItems = [];
  acIndex = -1;
  autocompleteDiv.innerHTML = '<div class="ac-status">Searching…</div>';
  openAc();

  const data = await fetchWithCache(`${OMDB}?s=${encodeURIComponent(query)}&apikey=${omdbKey}`);
  if (reqId !== acRequestId || searchInput.value.trim() !== query) return; // a newer keystroke won

  if (data.Response === "False") {
    autocompleteDiv.innerHTML = `<div class="ac-status">${data.networkError ? "Couldn't reach search — press Enter to try again." : "No matches found"}</div>`;
    return;
  }

  autocompleteDiv.innerHTML = "";
  data.Search.slice(0, 5).forEach((item, i) => {
    const div = document.createElement("div");
    div.className = "ac-item";
    div.id = `ac-opt-${i}`;
    div.setAttribute("role", "option");
    div.innerHTML = `<img src="${escapeHtml(safePoster(item.Poster))}" alt=""> <div><strong>${escapeHtml(item.Title)}</strong><br><small>${escapeHtml(item.Year)}</small></div>`;
    div.addEventListener("click", () => {
      searchInput.value = item.Title;
      updateClearBtn();
      executeSearch();
    });
    autocompleteDiv.appendChild(div);
  });
  acItems = [...autocompleteDiv.querySelectorAll(".ac-item")];
}

function clearSearch({ hideResults = false } = {}) {
  searchInput.value = "";
  updateClearBtn();
  if (hideResults) searchSection.style.display = "none";
  searchInput.focus();
  showRecentSearches();
}

searchBtn.addEventListener("click", executeSearch);
searchClear.addEventListener("click", () => clearSearch());
// Keep focus in the input when clicking inside the dropdown
autocompleteDiv.addEventListener("mousedown", e => e.preventDefault());

searchInput.addEventListener("input", () => {
  updateClearBtn();
  clearTimeout(acTimer);
  acIndex = -1;
  if (searchInput.value.trim().length < 2) showRecentSearches();
  else acTimer = setTimeout(showAutocomplete, 300);
});

searchInput.addEventListener("focus", () => {
  if (searchInput.value.trim().length < 2) showRecentSearches();
});

searchInput.addEventListener("keydown", e => {
  const hasItems = isAcVisible() && acItems.length > 0;

  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!hasItems) {
      if (searchInput.value.trim().length < 2) showRecentSearches();
      return;
    }
    const step = e.key === "ArrowDown" ? 1 : -1;
    acIndex = (acIndex + step + acItems.length) % acItems.length;
    setAcFocus();
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (hasItems && acIndex > -1) acItems[acIndex].click();
    else executeSearch();
  } else if (e.key === "Escape") {
    // First Escape closes the dropdown, second clears the field
    if (isAcVisible()) closeAc();
    else if (searchInput.value) { searchInput.value = ""; updateClearBtn(); }
  } else if (e.key === "Delete" && hasItems && acIndex > -1 &&
             acItems[acIndex].classList.contains("ac-recent") && (e.shiftKey || !searchInput.value)) {
    e.preventDefault();
    deleteRecentRow(acIndex);
  }
});

document.addEventListener("click", e => {
  if (!e.target.closest(".search-container")) closeAc();
});

document.getElementById("filterType").addEventListener("change", executeSearch);

async function executeSearch() {
  const query = searchInput.value.trim();
  if (!query) return;
  rememberSearch(query);
  closeAc();
  searchSection.style.display = "block";
  document.getElementById("searchHeading").textContent = `Results for “${query}”`;
  scrollToSection("searchSection");
  showSkeletons(searchCarousel, 10);

  const data = await fetchWithCache(`${OMDB}?s=${encodeURIComponent(query)}&apikey=${omdbKey}`);

  if (data.networkError) {
    renderState(searchCarousel, {
      tone: "error", icon: "offline",
      title: "Search is unavailable right now",
      message: `${data.Error} Check your connection and try again.`,
      actions: [{ label: "Try again", primary: true, onClick: executeSearch }]
    });
    return;
  }
  if (data.Response === "False") {
    const tooMany = /too many/i.test(data.Error || "");
    renderState(searchCarousel, {
      tone: "empty", icon: "search",
      title: tooMany ? `“${query}” matches too many titles` : `No results for “${query}”`,
      message: tooMany ? "Add a word or two to narrow it down." : "Check the spelling, or try the original title.",
      actions: [{ label: "Clear search", onClick: () => clearSearch({ hideResults: true }) }]
    });
    return;
  }

  let items = data.Search;
  const filterEl = document.getElementById("filterType");
  const typeFilter = filterEl.value;
  if (typeFilter !== "all") items = items.filter(i => i.Type === typeFilter);

  if (!items.length) {
    renderState(searchCarousel, {
      tone: "empty", icon: "search",
      title: `No ${typeFilter === "series" ? "series" : "movies"} match “${query}”`,
      message: "There are results of other types.",
      actions: [{ label: "Show all types", onClick: () => { filterEl.value = "all"; executeSearch(); } }]
    });
    return;
  }

  const favSet = favoriteIds();
  mountCards(searchCarousel, items.map(item => createCard({
    imdbID: item.imdbID, title: item.Title, subtitle: item.Year, poster: item.Poster,
    badge: item.Type === "series" ? "Series" : null, favSet,
    onOpen: () => loadDetails(item.imdbID)
  })));
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  syncInert();
  updateClearBtn();
  setupGenreDropdown();
  renderAnalytics();
  loadHero();
  renderContinue();
  renderFavorites();
  renderRecent();
  loadRecommendations();
});

function setupGenreDropdown() {
  let options = `<option value="trending">Trending Now</option>`;
  Object.keys(tmdbGenreMap).sort().forEach(genre => {
    options += `<option value="${genre}">${genre}</option>`;
  });
  genreSelect.innerHTML = options;
  genreSelect.addEventListener("change", e => loadRecommendations(e.target.value));
}

// ---------------------------------------------------------------------------
// TMDB helpers
// ---------------------------------------------------------------------------
const tagMedia = (results, mediaType) => (results || []).map(r => ({ ...r, mediaType }));

function interleave(a, b) {
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

function cachedImdbFor(mediaType, id) {
  const ext = cacheGet(`tmdb_ext_${mediaType}_${id}`);
  return (ext && ext.imdb_id) || null;
}

// TMDB → IMDb. external_ids is exact; the OMDb title match is only a fallback.
async function resolveImdbId({ id, mediaType, title, year }) {
  const ext = await fetchWithCache(`${TMDB}/${mediaType}/${id}/external_ids?api_key=${tmdbKey}`, `tmdb_ext_${mediaType}_${id}`);
  if (ext && isImdbId(ext.imdb_id)) return ext.imdb_id;

  const type = mediaType === "tv" ? "series" : "movie";
  if (year) {
    const exact = await fetchWithCache(`${OMDB}?t=${encodeURIComponent(title)}&y=${year}&type=${type}&apikey=${omdbKey}`, `bridge_${mediaType}_${id}_${year}`);
    if (exact.Response !== "False" && exact.imdbID) return exact.imdbID;
  }
  const loose = await fetchWithCache(`${OMDB}?t=${encodeURIComponent(title)}&type=${type}&apikey=${omdbKey}`, `bridge_${mediaType}_${id}`);
  return (loose.Response !== "False" && loose.imdbID) ? loose.imdbID : null;
}

async function openTmdbTitle(t, opts = {}) {
  showDetailsState({ tone: "loading", title: "Finding this title…" });
  const imdbID = await resolveImdbId(t);
  if (!isModalOpen(detailsModal)) return;
  if (!imdbID) {
    showDetailsState({
      tone: "error", icon: "alert",
      title: `Couldn't find a playable match for “${t.title}”`,
      message: "It may not be in the catalogue yet, or the connection dropped.",
      actions: [
        { label: "Try again", primary: true, onClick: () => openTmdbTitle(t, opts) },
        { label: "Close", onClick: () => closeModal(detailsModal) }
      ]
    });
    return;
  }
  loadDetails(imdbID, t.id, opts);
}

// ---------------------------------------------------------------------------
// "Because you like" — movies AND series
// ---------------------------------------------------------------------------
let recRequestId = 0;

async function loadRecommendations(forcedGenre = null) {
  let target = forcedGenre || topUserGenre;
  if (target !== "trending" && !tmdbGenreMap[target]) target = "trending";

  genreSelect.value = target;
  showSkeletons(recommendedCarousel, 10);
  const reqId = ++recRequestId;
  let items = [];
  let failed = false;

  if (target === "trending") {
    const res = await fetchWithCache(`${TMDB}/trending/all/week?api_key=${tmdbKey}`, "tmdb_trending", { ttl: 6 * HOUR });
    failed = !res.results;
    items = (res.results || [])
      .filter(i => i.media_type === "movie" || i.media_type === "tv")
      .map(i => ({ ...i, mediaType: i.media_type }));
  } else {
    const movieGenre = tmdbGenreMap[target];
    const tvGenre = tmdbTvGenreMap[target];
    const [movies, shows] = await Promise.all([
      fetchWithCache(`${TMDB}/discover/movie?api_key=${tmdbKey}&with_genres=${movieGenre}&sort_by=popularity.desc&vote_count.gte=50`,
        `tmdb_disc_movie_${movieGenre}`, { ttl: 6 * HOUR }),
      tvGenre
        ? fetchWithCache(`${TMDB}/discover/tv?api_key=${tmdbKey}&with_genres=${tvGenre}&without_genres=${TV_EXCLUDED_GENRES}&sort_by=popularity.desc&vote_count.gte=50`,
            `tmdb_disc_tv_${tvGenre}`, { ttl: 6 * HOUR })
        : Promise.resolve({ results: [] })
    ]);
    failed = !movies.results && !shows.results;
    items = interleave(tagMedia(movies.results, "movie"), tagMedia(shows.results, "tv"));
  }

  if (reqId !== recRequestId) return; // user switched genre mid-flight

  items = items.filter(i => i.poster_path).slice(0, 20);
  if (!items.length) {
    renderState(recommendedCarousel, failed ? {
      tone: "error", icon: "offline",
      title: "Couldn't load recommendations",
      message: "TMDB didn't respond. Check your connection and try again.",
      actions: [{ label: "Try again", primary: true, onClick: () => loadRecommendations(target) }]
    } : {
      tone: "empty", icon: "sparkle",
      title: `Nothing to show for ${target} yet`,
      actions: [{ label: "Show trending", onClick: () => loadRecommendations("trending") }]
    });
    return;
  }
  renderTMDBDeck(items);
}

function renderTMDBDeck(items) {
  const favSet = favoriteIds();
  mountCards(recommendedCarousel, items.map(item => {
    const title = item.title || item.name;
    const year = yearOf(item);
    const tmdb = { id: item.id, mediaType: item.mediaType, year };
    return createCard({
      imdbID: cachedImdbFor(item.mediaType, item.id),
      tmdb, title, subtitle: year,
      poster: `${TMDB_IMG}${item.poster_path}`,
      badge: item.mediaType === "tv" ? "Series" : null,
      favSet,
      onOpen: () => openTmdbTitle({ ...tmdb, title })
    });
  }));
}

// ---------------------------------------------------------------------------
// Randomizer — "Surprise me"
// ---------------------------------------------------------------------------
const SURPRISE_SEEN_KEY = "surprise_recent"; // sessionStorage: avoid repeats within a visit
let surpriseBusy = false;

function getSurpriseSeen() {
  try { return safeParse(sessionStorage.getItem(SURPRISE_SEEN_KEY), []); } catch { return []; }
}
function rememberSurprise(key) {
  const list = [key, ...getSurpriseSeen().filter(k => k !== key)].slice(0, 40);
  try { sessionStorage.setItem(SURPRISE_SEEN_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

function setSurpriseBusy(busy) {
  document.querySelectorAll('[data-action="surprise"]').forEach(b => b.setAttribute("aria-busy", String(busy)));
}

// Titles the viewer has touched, weighted: favorites > in-progress > history
function buildSeeds() {
  const seeds = new Map();
  const add = (imdbID, title, weight) => {
    if (!isImdbId(imdbID)) return;
    const prev = seeds.get(imdbID);
    if (!prev || prev.weight < weight) seeds.set(imdbID, { imdbID, title: title || prev?.title, weight });
  };
  getList("favorites").forEach(f => add(f.imdbID, f.title, 3));
  getList("continue_watching").forEach(c => add(c.imdbID, c.title, 2));
  getList("recent").slice(0, 12).forEach(id => add(id, cacheGet(id)?.Title, 1));
  return [...seeds.values()].map(s => ({ ...s, title: s.title || cacheGet(s.imdbID)?.Title || "something you watched" }));
}

// Share of series in history, used to decide movie vs. series for genre picks
function seriesShare() {
  const types = getList("recent").map(id => cacheGet(id)?.Type).filter(Boolean);
  if (!types.length) return 0.5;
  return clamp(types.filter(t => t === "series").length / types.length, 0.2, 0.8);
}

async function fromSimilar() {
  const seeds = buildSeeds();
  if (!seeds.length) return null;
  const seed = weightedPick(seeds.map(s => ({ value: s, weight: s.weight })));

  const found = await fetchWithCache(`${TMDB}/find/${seed.imdbID}?api_key=${tmdbKey}&external_source=imdb_id`, `tmdb_find_${seed.imdbID}`);
  const mediaType = found.tv_results?.length ? "tv" : found.movie_results?.length ? "movie" : null;
  if (!mediaType) return null;
  const tmdbId = (mediaType === "tv" ? found.tv_results : found.movie_results)[0].id;

  let res = await fetchWithCache(`${TMDB}/${mediaType}/${tmdbId}/recommendations?api_key=${tmdbKey}`, `tmdb_recs_${mediaType}_${tmdbId}`, { ttl: DAY });
  if (!res.results?.length) {
    res = await fetchWithCache(`${TMDB}/${mediaType}/${tmdbId}/similar?api_key=${tmdbKey}`, `tmdb_similar_${mediaType}_${tmdbId}`, { ttl: DAY });
  }
  return { candidates: tagMedia(res.results, mediaType), reason: `Because you watched ${seed.title}` };
}

async function fromGenre() {
  const entries = Object.entries(genreCounts).filter(([g]) => tmdbGenreMap[g]);
  if (!entries.length) return null;
  const genre = weightedPick(entries.map(([g, c]) => ({ value: g, weight: c })));
  const mediaType = tmdbTvGenreMap[genre] && Math.random() < seriesShare() ? "tv" : "movie";
  const genreId = mediaType === "tv" ? tmdbTvGenreMap[genre] : tmdbGenreMap[genre];
  const page = 1 + Math.floor(Math.random() * 5);
  const extra = mediaType === "tv" ? `&without_genres=${TV_EXCLUDED_GENRES}&vote_count.gte=100` : "&vote_count.gte=200";

  const res = await fetchWithCache(
    `${TMDB}/discover/${mediaType}?api_key=${tmdbKey}&with_genres=${genreId}&sort_by=popularity.desc&page=${page}${extra}`,
    `tmdb_disc_${mediaType}_${genreId}_p${page}`, { ttl: DAY }
  );
  return { candidates: tagMedia(res.results, mediaType), reason: `Because you like ${genre} ${mediaType === "tv" ? "series" : "movies"}` };
}

async function fromTrending() {
  const res = await fetchWithCache(`${TMDB}/trending/all/week?api_key=${tmdbKey}`, "tmdb_trending", { ttl: 6 * HOUR });
  const hasHistory = getList("recent").length > 0;
  return {
    candidates: (res.results || []).filter(i => i.media_type === "movie" || i.media_type === "tv").map(i => ({ ...i, mediaType: i.media_type })),
    reason: hasHistory ? "Trending this week" : "Trending this week — watch a few titles and picks get more personal"
  };
}

async function pickSurprise() {
  const alreadySeen = new Set([
    ...getList("recent"),
    ...getList("favorites").map(f => f.imdbID),
    ...getList("continue_watching").map(c => c.imdbID)
  ]);
  const skipped = new Set(getSurpriseSeen());

  const personal = [];
  if (buildSeeds().length) personal.push(fromSimilar);
  if (Object.keys(genreCounts).some(g => tmdbGenreMap[g])) personal.push(fromGenre);
  if (personal.length === 2 && Math.random() < 0.35) personal.reverse(); // ~65% "similar to", ~35% "genre"
  const strategies = [...personal, fromTrending];

  for (const strategy of strategies) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await strategy();
      if (!result || !result.candidates.length) break;

      const pool = shuffleArray(result.candidates.filter(c => c.poster_path && !skipped.has(`${c.mediaType}_${c.id}`)));
      for (const c of pool.slice(0, 4)) {
        const key = `${c.mediaType}_${c.id}`;
        skipped.add(key);
        const imdbID = await resolveImdbId({ id: c.id, mediaType: c.mediaType, title: c.title || c.name, year: yearOf(c) });
        if (imdbID && !alreadySeen.has(imdbID)) return { key, id: c.id, imdbID, reason: result.reason };
      }
    }
  }
  return null;
}

async function surpriseMe({ fromModal = false } = {}) {
  if (surpriseBusy) return;
  surpriseBusy = true;
  setSurpriseBusy(true);
  showDetailsState({ tone: "loading", title: "Rolling the dice…", message: "Looking at what you've watched and liked." });

  try {
    const pick = await pickSurprise();
    if (!isModalOpen(detailsModal)) return; // closed while we were picking

    if (!pick) {
      showDetailsState({
        tone: "error", icon: "dice",
        title: "Couldn't find a pick right now",
        message: "The recommendation service didn't respond. Give it another roll in a moment.",
        actions: [
          { label: "Roll again", primary: true, onClick: () => surpriseMe({ fromModal: true }) },
          { label: "Close", onClick: () => closeModal(detailsModal) }
        ]
      });
      return;
    }

    rememberSurprise(pick.key);
    await loadDetails(pick.imdbID, pick.id, {
      reason: pick.reason,
      skipHistory: true, // only counts as history once actually played
      onReroll: () => surpriseMe({ fromModal: true }),
      focusAfter: fromModal ? "rerollBtn" : null
    });
  } finally {
    surpriseBusy = false;
    setSurpriseBusy(false);
  }
}

// ---------------------------------------------------------------------------
// Hero billboard + Shuffle
// ---------------------------------------------------------------------------
const HERO_DEFAULTS = ["tt0133093", "tt1375666", "tt0816692", "tt0903747", "tt0468569", "tt0110912", "tt0944947", "tt2861424"];
let heroCurrentId = null;
let heroLoading = false;

function buildHeroPool() {
  const personal = unique([
    ...getList("favorites").map(f => f.imdbID),
    ...getList("continue_watching").map(c => c.imdbID),
    ...getList("recent")
  ]).filter(isImdbId);
  // Top up thin histories with a few classics so Shuffle always has somewhere to go
  return personal.length >= 4 ? personal : unique([...personal, ...HERO_DEFAULTS]);
}

function preloadImage(src, timeout = 2500) {
  return new Promise(resolve => {
    const img = new Image();
    const done = () => resolve();
    img.onload = done; img.onerror = done;
    setTimeout(done, timeout);
    img.src = src;
  });
}

function getProgress(imdbID) {
  return getList("continue_watching").find(c => c.imdbID === imdbID) || null;
}

async function loadHero({ shuffle = false } = {}) {
  if (heroLoading) return;
  heroLoading = true;
  heroShuffleBtn.setAttribute("aria-busy", "true");

  let last = heroCurrentId;
  try { last = last || sessionStorage.getItem("hero_last"); } catch { /* ignore */ }
  const pool = buildHeroPool();
  const candidates = shuffleArray(pool.filter(id => id !== last));
  if (!candidates.length) candidates.push(...pool);

  let data = null;
  for (const id of candidates.slice(0, 3)) {
    const d = await getTitle(id);
    if (d.Response !== "False") { data = d; break; }
  }

  const heroPlayBtn = document.getElementById("heroPlayBtn");
  const heroMoreBtn = document.getElementById("heroMoreBtn");

  if (!data) {
    document.getElementById("heroTitle").textContent = "Couldn't load a featured title";
    document.getElementById("heroPlot").textContent = "Check your connection, then press Shuffle to try again.";
    document.getElementById("heroMeta").innerHTML = "";
    heroPlayBtn.hidden = true;
    heroMoreBtn.hidden = true;
    heroLoading = false;
    heroShuffleBtn.removeAttribute("aria-busy");
    return;
  }

  const posterUrl = safePoster(data.Poster);
  await preloadImage(posterUrl);

  if (shuffle && !prefersReducedMotion()) {
    heroSection.classList.add("is-swapping");
    await wait(200);
  }

  document.getElementById("heroTitle").textContent = data.Title;
  document.getElementById("heroPlot").textContent = data.Plot;
  document.getElementById("heroMeta").innerHTML = `<span>${escapeHtml(data.Rated)}</span> <span>${escapeHtml(data.Year)}</span> <span>⭐ ${escapeHtml(data.imdbRating)}</span>`;
  document.getElementById("heroBg").style.backgroundImage = `url("${posterUrl.replace(/"/g, "%22")}")`;
  const heroPoster = document.getElementById("heroPoster");
  heroPoster.src = posterUrl;
  heroPoster.alt = `${data.Title} poster`;
  heroPlayBtn.hidden = false;
  heroMoreBtn.hidden = false;

  heroCurrentId = data.imdbID;
  try { sessionStorage.setItem("hero_last", data.imdbID); } catch { /* ignore */ }

  if (shuffle) {
    heroSection.classList.remove("is-swapping");
    const content = document.getElementById("heroContent");
    content.style.animation = "none";
    void content.offsetWidth; // restart the reveal animation
    content.style.animation = "";
    document.getElementById("heroAnnounce").textContent = `Now featuring ${data.Title}`;
  }

  heroPlayBtn.onclick = () => {
    const saved = data.Type === "series" ? getProgress(data.imdbID) : null;
    currentMedia = {
      imdbID: data.imdbID, title: data.Title, poster: posterUrl, type: data.Type,
      season: saved ? saved.season : 1, episode: saved ? saved.episode : 1, tmdbId: null
    };
    openPlayer();
  };
  heroMoreBtn.onclick = () => loadDetails(data.imdbID);

  heroLoading = false;
  heroShuffleBtn.removeAttribute("aria-busy");
}

heroShuffleBtn.addEventListener("click", () => loadHero({ shuffle: true }));

// ---------------------------------------------------------------------------
// Rows: Continue Watching, Favorites, Watch History
// ---------------------------------------------------------------------------
function renderContinue() {
  const list = getList("continue_watching");
  if (!list.length) {
    renderState(continueCarousel, {
      tone: "empty", icon: "film",
      title: "Nothing in progress",
      message: "Start something and it'll wait for you here.",
      actions: [
        { label: "Surprise me", primary: true, onClick: () => surpriseMe() },
        { label: "Search", onClick: focusSearch }
      ]
    });
    return;
  }
  const favSet = favoriteIds();
  mountCards(continueCarousel, list.map(c => {
    const progress = c.type === "series" ? `S${c.season} E${c.episode}` : "Movie";
    return createCard({
      imdbID: c.imdbID, title: c.title, subtitle: progress, poster: c.poster, favSet,
      caption: { primary: progress, ts: c.timestamp },
      onOpen: () => loadDetails(c.imdbID)
    });
  }));
}

function renderFavorites() {
  const favs = getList("favorites");
  if (!favs.length) {
    renderState(favoritesCarousel, {
      tone: "empty", icon: "heart",
      title: "No favorites yet",
      message: "Hover any poster and tap the heart to save it here.",
      actions: [{ label: "Find something", onClick: focusSearch }]
    });
    return;
  }
  const favSet = favoriteIds();
  mountCards(favoritesCarousel, favs.map(f => createCard({
    imdbID: f.imdbID, title: f.title, poster: f.poster, favSet,
    onOpen: () => loadDetails(f.imdbID)
  })));
}

async function renderRecent() {
  const recents = getList("recent").filter(isImdbId);
  if (!recents.length) {
    renderState(recentCarousel, {
      tone: "empty", icon: "clock",
      title: "Your watch history is empty",
      message: "Titles you open will show up here.",
      actions: [{ label: "Start watching", onClick: focusSearch }]
    });
    return;
  }

  if (!recentCarousel.querySelector(".card-shell")) showSkeletons(recentCarousel, recents.length);
  const results = await Promise.all(recents.map(getTitle));
  const ok = results.filter(d => d.Response !== "False");
  renderAnalytics(); // genre stats are accurate once history is cached

  if (!ok.length) {
    renderState(recentCarousel, {
      tone: "error", icon: "offline",
      title: "Couldn't load your watch history",
      message: "Your history is safe — the title service just didn't respond.",
      actions: [{ label: "Try again", primary: true, onClick: renderRecent }]
    });
    return;
  }
  const favSet = favoriteIds();
  mountCards(recentCarousel, ok.map(d => createCard({
    imdbID: d.imdbID, title: d.Title, subtitle: d.Year, poster: d.Poster, favSet,
    badge: d.Type === "series" ? "Series" : null,
    onOpen: () => loadDetails(d.imdbID)
  })));
}

// ---------------------------------------------------------------------------
// Details modal
// ---------------------------------------------------------------------------
let detailsRequestId = 0;

function showDetailsState(opts) {
  if (!isModalOpen(detailsModal)) openModal(detailsModal);
  // Don't strand focus on an element that's about to be removed
  if (modalDetailsBody.contains(document.activeElement)) document.getElementById("detailsCloseBtn").focus();
  modalDetailsBody.replaceChildren(buildState(opts));
}

async function loadDetails(imdbID, tmdbId = null, opts = {}) {
  const reqId = ++detailsRequestId;
  showDetailsState({ tone: "loading", title: "Loading details…" });

  const data = await getTitle(imdbID);
  if (reqId !== detailsRequestId || !isModalOpen(detailsModal)) return;

  if (data.Response === "False") {
    showDetailsState({
      tone: "error", icon: data.networkError ? "offline" : "alert",
      title: "Couldn't load details",
      message: data.networkError ? `${data.Error} Check your connection and try again.` : "This title may no longer be available.",
      actions: [
        { label: "Try again", primary: true, onClick: () => loadDetails(imdbID, tmdbId, opts) },
        { label: "Close", onClick: () => closeModal(detailsModal) }
      ]
    });
    return;
  }

  const posterUrl = safePoster(data.Poster);
  const savedProgress = getProgress(imdbID);

  currentMedia = {
    imdbID, title: data.Title, poster: posterUrl, type: data.Type,
    season: savedProgress ? savedProgress.season : 1,
    episode: savedProgress ? savedProgress.episode : 1,
    tmdbId
  };

  const isFav = favoriteIds().has(imdbID);

  let tvControls = "";
  if (data.Type === "series") {
    const totalSeasons = parseInt(data.totalSeasons, 10) || 1;
    const seasonOpts = Array.from({ length: totalSeasons }, (_, i) =>
      `<option value="${i + 1}" ${i + 1 === Number(currentMedia.season) ? "selected" : ""}>Season ${i + 1}</option>`).join("");

    tvControls = `
      <div id="tvSelector">
        <div style="flex:1;">
          <label for="seasonSelect" style="font-size:0.8rem;color:var(--accent);display:block;margin-bottom:0.3rem;">Season</label>
          <select id="seasonSelect" class="custom-select" style="width:100%;">${seasonOpts}</select>
        </div>
        <div style="flex:2;">
          <label for="episodeSelect" style="font-size:0.8rem;color:var(--accent);display:block;margin-bottom:0.3rem;">Episode</label>
          <select id="episodeSelect" class="custom-select" style="width:100%;"><option value="1">Loading...</option></select>
        </div>
      </div>`;
  }

  const resumeNote = savedProgress?.timestamp
    ? `<p class="modal-resume">${data.Type === "series" ? `Last watched S${savedProgress.season} E${savedProgress.episode}, ` : "Last watched "}${escapeHtml(timeAgo(savedProgress.timestamp))}</p>`
    : "";

  modalDetailsBody.innerHTML = `
    <div class="modal-details-layout">
      <div class="modal-poster"><img src="${escapeHtml(posterUrl)}" alt="${escapeHtml(data.Title)} poster"></div>
      <div class="modal-info">
        ${opts.reason ? `<p class="modal-reason">${svgIcon("sparkle")}<span>${escapeHtml(opts.reason)}</span></p>` : ""}
        <h2 id="modalTitle">${escapeHtml(data.Title)}</h2>
        <div class="modal-meta">
          <span>${escapeHtml(data.Year)}</span><span>${escapeHtml(data.Rated)}</span><span>${escapeHtml(data.Runtime)}</span><span>⭐ ${escapeHtml(data.imdbRating)}</span>
        </div>
        ${resumeNote}
        <p><strong>Genre:</strong> ${escapeHtml(data.Genre)}</p>
        <p><strong>Cast:</strong> ${escapeHtml(data.Actors)}</p>
        <p style="margin-top:1rem; line-height:1.6;">${escapeHtml(data.Plot)}</p>
        ${tvControls}
        <div class="modal-actions">
          <button type="button" class="btn primary-btn" id="modalPlayBtn">▶ ${savedProgress ? "Resume" : "Play"}</button>
          <button type="button" class="btn secondary-btn" id="favBtnModal" data-imdbid="${escapeHtml(imdbID)}"></button>
          ${opts.onReroll ? `<button type="button" class="btn ghost-btn" id="rerollBtn">${svgIcon("dice")}<span>Roll again</span></button>` : ""}
        </div>
      </div>
    </div>`;

  const posterImg = modalDetailsBody.querySelector(".modal-poster img");
  posterImg.addEventListener("error", () => { posterImg.src = PLACEHOLDER_POSTER; }, { once: true });

  document.getElementById("modalPlayBtn").addEventListener("click", openPlayer);
  const favBtn = document.getElementById("favBtnModal");
  setModalFavBtn(favBtn, isFav);
  favBtn.addEventListener("click", () => toggleFavorite({ imdbID, title: data.Title, poster: posterUrl }));
  if (opts.onReroll) document.getElementById("rerollBtn").addEventListener("click", opts.onReroll);

  if (data.Type === "series") {
    document.getElementById("seasonSelect").addEventListener("change", e => fetchEpisodes(e.target.value));
    document.getElementById("episodeSelect").addEventListener("change", e => { currentMedia.episode = parseInt(e.target.value, 10); });
    fetchEpisodes(currentMedia.season, currentMedia.episode);
  }

  if (!opts.skipHistory) addHistory(imdbID);
  if (opts.focusAfter) document.getElementById(opts.focusAfter)?.focus();
}

async function fetchEpisodes(season, targetEpisode = 1) {
  currentMedia.season = parseInt(season, 10);
  const epSelect = document.getElementById("episodeSelect");
  if (!epSelect) return;
  epSelect.innerHTML = "<option>Loading...</option>";

  const data = await fetchWithCache(`${OMDB}?i=${currentMedia.imdbID}&Season=${season}&apikey=${omdbKey}`);
  if (!document.body.contains(epSelect)) return;
  if (data.Response === "False" || !data.Episodes) {
    epSelect.innerHTML = `<option value="1">Episode 1</option>`;
    currentMedia.episode = 1;
    return;
  }

  epSelect.innerHTML = data.Episodes.map((ep, i) =>
    `<option value="${i + 1}" ${i + 1 === Number(targetEpisode) ? "selected" : ""}>Ep ${i + 1}: ${escapeHtml(ep.Title)}</option>`).join("");
  currentMedia.episode = parseInt(epSelect.value, 10);
}

// ---------------------------------------------------------------------------
// Player with explicit error + retry
// ---------------------------------------------------------------------------
const PLAYER_TIMEOUT = 20000;
let playerToken = 0;
let playerLoadTimer = null;

function setPlayerStatus(opts) {
  clearPlayerStatus();
  const wrap = document.createElement("div");
  wrap.className = "player-status";
  wrap.appendChild(buildState(opts));
  playerContainer.appendChild(wrap);
  if (opts.tone === "error" && playerModal.contains(document.activeElement)) {
    wrap.querySelector(".state-actions .btn")?.focus();
  }
}
function clearPlayerStatus() {
  playerContainer.querySelector(".player-status")?.remove();
}

function showPlayerError(title, message, { canWait = false, icon = "alert" } = {}) {
  const actions = [{ label: "Try again", primary: true, onClick: startPlayback }];
  if (canWait) actions.push({ label: "Keep waiting", onClick: clearPlayerStatus });
  actions.push({ label: "Back to details", onClick: () => closePlayer({ toDetails: true }) });
  setPlayerStatus({ tone: "error", icon, title, message, actions });
}

function openPlayer() {
  let returnFocus = document.activeElement;
  if (isModalOpen(detailsModal)) {
    const entry = closeModal(detailsModal, { restoreFocus: false });
    returnFocus = entry?.returnFocus || returnFocus;
  }
  if (!isModalOpen(playerModal)) openModal(playerModal, { returnFocus });
  startPlayback();
}

async function startPlayback() {
  const token = ++playerToken;
  clearTimeout(playerLoadTimer);
  playerContainer.replaceChildren();

  const episodeInfo = currentMedia.type === "series" ? `Season ${currentMedia.season}, Episode ${currentMedia.episode}` : "";
  setPlayerStatus({ tone: "loading", title: `Loading ${currentMedia.title || "player"}…`, message: episodeInfo });

  if (!navigator.onLine) {
    showPlayerError("You're offline", "Reconnect to the internet, then try again.", { icon: "offline" });
    return;
  }

  let tmdbId = currentMedia.tmdbId;
  if (!tmdbId && currentMedia.imdbID) {
    const findRes = await fetchWithCache(
      `${TMDB}/find/${currentMedia.imdbID}?api_key=${tmdbKey}&external_source=imdb_id`,
      `tmdb_find_${currentMedia.imdbID}`, { timeout: 8000 }
    );
    if (token !== playerToken) return;
    const results = currentMedia.type === "series" ? findRes.tv_results : findRes.movie_results;
    if (results && results.length > 0) { tmdbId = results[0].id; currentMedia.tmdbId = tmdbId; }
  }

  const identifier = tmdbId || currentMedia.imdbID;
  if (!identifier) {
    showPlayerError("Nothing to play", "This title is missing the information needed to find a video source.");
    return;
  }

  const src = currentMedia.type === "series"
    ? `https://vidsrcme.ru/embed/tv/${identifier}/${currentMedia.season}/${currentMedia.episode}`
    : `https://vidsrcme.ru/embed/movie/${identifier}`;

  const iframe = document.createElement("iframe");
  iframe.src = src;
  iframe.title = `Player: ${currentMedia.title}`;
  iframe.width = "100%";
  iframe.height = "100%";
  iframe.setAttribute("frameborder", "0");
  iframe.setAttribute("allowfullscreen", "");
  iframe.setAttribute("allow", "autoplay; encrypted-media; fullscreen");
  iframe.setAttribute("referrerpolicy", "origin");
  iframe.addEventListener("load", () => {
    if (token !== playerToken) return;
    clearTimeout(playerLoadTimer);
    clearPlayerStatus();
  }, { once: true });

  playerContainer.prepend(iframe); // status overlay stays on top until it loads
  playerLoadTimer = setTimeout(() => {
    if (token !== playerToken) return;
    showPlayerError(
      "The player is taking too long",
      "The video source didn't respond. It may be down, or this title may not be available there.",
      { canWait: true }
    );
  }, PLAYER_TIMEOUT);

  saveProgress(currentMedia);
  addHistory(currentMedia.imdbID);
}

function closePlayer({ toDetails = false } = {}) {
  playerToken++;
  clearTimeout(playerLoadTimer);
  playerContainer.replaceChildren();
  const entry = closeModal(playerModal, { restoreFocus: !toDetails });
  renderContinue();
  renderRecent();
  if (toDetails) {
    openModal(detailsModal, { returnFocus: entry?.returnFocus });
    loadDetails(currentMedia.imdbID, currentMedia.tmdbId);
  }
}

function saveProgress(media) {
  const continueList = getList("continue_watching").filter(item => item.imdbID !== media.imdbID);
  continueList.unshift({
    imdbID: media.imdbID, title: media.title, poster: media.poster, type: media.type,
    season: media.season, episode: media.episode, timestamp: Date.now()
  });
  saveList("continue_watching", continueList.slice(0, 20));
}

function addHistory(imdbID) {
  if (!isImdbId(imdbID)) return;
  const hist = getList("recent").filter(id => id !== imdbID);
  hist.unshift(imdbID); // most recent first
  saveList("recent", hist.slice(0, 20));
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------
function renderAnalytics() {
  const recents = getList("recent");
  const favs = getList("favorites");

  document.getElementById("statTotalItems").textContent = recents.length;

  genreCounts = {};
  recents.forEach(id => {
    const genre = cacheGet(id)?.Genre;
    if (genre && genre !== "N/A") genre.split(", ").forEach(g => { genreCounts[g] = (genreCounts[g] || 0) + 1; });
  });

  topUserGenre = "-";
  let maxCount = 0;
  for (const [genre, count] of Object.entries(genreCounts)) {
    if (count > maxCount) { maxCount = count; topUserGenre = genre; }
  }
  document.getElementById("statTopGenre").textContent = topUserGenre;

  let totalRating = 0;
  let ratingCount = 0;
  favs.forEach(f => {
    const rating = parseFloat(cacheGet(f.imdbID)?.imdbRating);
    if (!Number.isNaN(rating)) { totalRating += rating; ratingCount++; }
  });
  document.getElementById("statAvgRating").textContent = ratingCount > 0 ? (totalRating / ratingCount).toFixed(1) : "0.0";
}

// ---------------------------------------------------------------------------
// Export / Import (JSON backup)
// ---------------------------------------------------------------------------
const BACKUP_APP = "PersonalStreamer";

function exportData() {
  const payload = {
    app: BACKUP_APP,
    version: 1,
    exportedAt: new Date().toISOString(),
    favorites: getList("favorites"),
    recent: getList("recent"),
    continue_watching: getList("continue_watching"),
    recent_searches: getRecentSearches()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `personal-streamer-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`Exported ${payload.favorites.length} favorites and ${payload.recent.length} history items`);
}

// Treat the file as untrusted: keep only well-formed fields
function sanitizeBackup(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("That file isn't a Personal Streamer backup.");
  const str = (v, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");
  const url = v => (typeof v === "string" && /^https:\/\//i.test(v) ? v.slice(0, 500) : "");
  const posInt = v => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 && n < 1000 ? n : 1; };
  const arr = v => (Array.isArray(v) ? v : []);

  const favorites = arr(raw.favorites).filter(f => f && isImdbId(f.imdbID))
    .map(f => ({ imdbID: f.imdbID, title: str(f.title) || f.imdbID, poster: url(f.poster) }));
  const recent = arr(raw.recent).filter(isImdbId);
  const continueWatching = arr(raw.continue_watching).filter(c => c && isImdbId(c.imdbID))
    .map(c => ({
      imdbID: c.imdbID, title: str(c.title) || c.imdbID, poster: url(c.poster),
      type: c.type === "series" ? "series" : "movie",
      season: posInt(c.season), episode: posInt(c.episode),
      timestamp: Number.isFinite(c.timestamp) ? Math.min(c.timestamp, Date.now()) : Date.now()
    }));
  const searches = arr(raw.recent_searches).filter(s => typeof s === "string" && s.trim()).map(s => s.slice(0, 100));

  if (!favorites.length && !recent.length && !continueWatching.length && !searches.length) {
    throw new Error("No favorites, history or progress found in that file.");
  }
  return { favorites, recent, continueWatching, searches };
}

async function importData(file) {
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showToast("That file is too large to be a backup.", { tone: "error" }); return; }

  let backup;
  try {
    const parsed = safeParse(await file.text(), null);
    if (!parsed) throw new Error("That file isn't valid JSON.");
    backup = sanitizeBackup(parsed);
  } catch (err) {
    showToast(err.message, { tone: "error" });
    return;
  }

  // Merge (never overwrite): existing data stays, new items are added
  const favs = getList("favorites");
  const favIdSet = new Set(favs.map(f => f.imdbID));
  const newFavs = backup.favorites.filter(f => !favIdSet.has(f.imdbID));
  storeList("favorites", [...favs, ...newFavs]);

  const recent = getList("recent");
  const merged = unique([...recent, ...backup.recent]).slice(0, 20);
  const newRecentCount = merged.filter(id => !recent.includes(id)).length;
  storeList("recent", merged);

  const progress = new Map(getList("continue_watching").map(c => [c.imdbID, c]));
  backup.continueWatching.forEach(c => {
    const prev = progress.get(c.imdbID);
    if (!prev || (prev.timestamp || 0) < c.timestamp) progress.set(c.imdbID, c);
  });
  storeList("continue_watching", [...progress.values()].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 20));

  storeList(RECENT_SEARCH_KEY, unique([...getRecentSearches(), ...backup.searches]).slice(0, MAX_RECENT_SEARCHES));

  renderAnalytics();
  renderContinue();
  renderFavorites();
  renderRecent();
  showToast(`Imported ${newFavs.length} new favorites and ${newRecentCount} history items`);
}

const importInput = document.getElementById("importDataInput");
document.getElementById("exportDataBtn").addEventListener("click", exportData);
document.getElementById("importDataBtn").addEventListener("click", () => importInput.click());
importInput.addEventListener("change", async () => {
  await importData(importInput.files[0]);
  importInput.value = ""; // allow re-importing the same file
});

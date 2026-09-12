import { apiInitializer } from "discourse/lib/api";
import { ajax } from "discourse/lib/ajax";
import {
  FORMATIONS,
  DEFAULT_FORMATION,
  buildSlots,
  slotRows,
} from "discourse/plugins/discourse-lineup-builder/discourse/lib/formations";
import {
  lineupMarkdown,
  groupByRole,
} from "discourse/plugins/discourse-lineup-builder/discourse/lib/lineup-markdown";
import {
  shortLabel,
  initials,
} from "discourse/plugins/discourse-lineup-builder/discourse/lib/player-names";
import {
  renderLineupImage,
  canvasToBlob,
} from "discourse/plugins/discourse-lineup-builder/discourse/lib/pitch-image";

const ROUTE = /^\/lineup\/?$/i;
const CONTAINER_ID = "lineup-builder";

const state = {
  formation: DEFAULT_FORMATION,
  players: [],
  picks: {},
  title: "",
  activeSlot: null,
  search: "",
  loading: false,
  error: null,
  notice: null,
  rendering: false,
};

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function settings(api) {
  const site = api.container.lookup("service:site-settings");
  return {
    url: site?.lineup_builder_players_url || "/players/data.json?scope=first_team",
    formation: site?.lineup_builder_default_formation || DEFAULT_FORMATION,
    title: site?.lineup_builder_title || "Lineup builder",
  };
}

function slots() {
  return buildSlots(state.formation);
}

function usedUids() {
  return new Set(Object.values(state.picks).map((p) => p.uid));
}

// --- pitch -----------------------------------------------------------------

function pitchMarkings() {
  // Drawn rather than imported so the plugin ships no binary assets and
  // the lines take their colour from the theme.
  return `
    <svg class="lb-markings" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true">
      <rect x="1" y="1" width="98" height="148" />
      <line x1="1" y1="75" x2="99" y2="75" />
      <circle cx="50" cy="75" r="14" />
      <rect x="26" y="1" width="48" height="20" />
      <rect x="38" y="1" width="24" height="8" />
      <rect x="26" y="129" width="48" height="20" />
      <rect x="38" y="141" width="24" height="8" />
    </svg>`;
}

function avatar(player, fallback) {
  if (player?.photo_url) {
    // If the photo 404s or the host blocks hotlinking, swap in initials
    // rather than leaving a broken image on the pitch.
    return `<img class="lb-photo" src="${escapeHtml(player.photo_url)}" alt="" loading="lazy"
      onerror="this.parentNode.classList.add('lb-no-photo'); this.remove();" />
      <span class="lb-fallback">${escapeHtml(initials(player.label))}</span>`;
  }
  return `<span class="lb-fallback">${escapeHtml(
    player ? initials(player.label) : fallback
  )}</span>`;
}

function slotNode(slot) {
  const pick = state.picks[slot.id];
  const active = state.activeSlot === slot.id;

  const inner = pick
    ? `<span class="lb-shirt lb-filled">${avatar(pick, "")}</span>
       <span class="lb-name">${escapeHtml(pick.label)}</span>`
    : `<span class="lb-shirt"><span class="lb-fallback">+</span></span>
       <span class="lb-name lb-empty">${escapeHtml(slot.label)}</span>`;

  return `
    <button class="lb-slot${active ? " lb-active" : ""}${pick ? " lb-has" : ""}"
      style="left:${slot.x}%; bottom:${slot.y}%"
      data-slot="${slot.id}"
      aria-label="${escapeHtml(slot.label)}${pick ? `, ${escapeHtml(pick.name)}` : ", empty"}">
      ${inner}
    </button>`;
}

// --- picker ----------------------------------------------------------------

function pickerNode() {
  const slot = slots().find((s) => s.id === state.activeSlot);
  if (!slot) {
    return "";
  }

  const used = usedUids();
  const current = state.picks[slot.id];
  const term = state.search.trim().toLowerCase();

  const available = state.players.filter(
    (p) => !used.has(p.uid) || (current && p.uid === current.uid)
  );

  const matching = available.filter(
    (p) => !term || String(p.name || "").toLowerCase().includes(term)
  );

  // Players whose listed position matches the slot come first, but
  // nothing is hidden: arguing about whether a player "is" a right back
  // is the sort of thing the thread is for.
  const suited = matching.filter((p) => p.position === slot.role);
  const others = matching.filter((p) => p.position !== slot.role);

  const row = (p) => `
    <button class="lb-option" data-uid="${escapeHtml(p.uid)}">
      <span class="lb-option-avatar">${avatar(p, "")}</span>
      <span class="lb-option-name">${escapeHtml(p.name)}</span>
      <span class="lb-option-pos">${escapeHtml(p.position || "")}</span>
    </button>`;

  const section = (label, list) =>
    list.length
      ? `<div class="lb-group"><h4>${escapeHtml(label)}</h4>${list.map(row).join("")}</div>`
      : "";

  return `
    <div class="lb-picker">
      <div class="lb-picker-head">
        <strong>${escapeHtml(slot.label)}</strong>
        <button class="lb-close" aria-label="Close">×</button>
      </div>
      <input class="lb-search" type="search" placeholder="Search the squad…"
        value="${escapeHtml(state.search)}" />
      ${
        matching.length
          ? section(`${slot.role} options`, suited) + section("Everyone else", others)
          : `<p class="lb-muted">No players match.</p>`
      }
      ${current ? `<button class="btn lb-clear-slot">Remove ${escapeHtml(current.name)}</button>` : ""}
    </div>`;
}

// --- output ----------------------------------------------------------------

function currentMarkdown() {
  const list = slots();
  return lineupMarkdown({
    formation: state.formation,
    title: state.title.trim() || null,
    rows: slotRows(list),
    picks: state.picks,
    byRole: groupByRole(list, state.picks),
  });
}

function render(container, api) {
  const cfg = settings(api);

  if (state.loading) {
    container.innerHTML = `<div class="lb-wrap"><p class="lb-muted">Loading the squad…</p></div>`;
    return;
  }

  const options = Object.keys(FORMATIONS)
    .map(
      (name) =>
        `<option value="${name}"${name === state.formation ? " selected" : ""}>${name}</option>`
    )
    .join("");

  const filled = Object.keys(state.picks).length;

  const problem = state.error
    ? `<div class="lb-error">${escapeHtml(state.error)}</div>`
    : "";

  const notice = state.notice
    ? `<div class="lb-notice">${escapeHtml(state.notice)}</div>`
    : "";

  container.innerHTML = `
    <div class="lb-wrap">
      <h2>${escapeHtml(cfg.title)}</h2>
      ${problem}
      ${notice}

      <div class="lb-controls">
        <label class="lb-field">
          <span>Formation</span>
          <select class="lb-formation">${options}</select>
        </label>
        <label class="lb-field lb-grow">
          <span>Name this XI (optional)</span>
          <input class="lb-title" type="text" value="${escapeHtml(state.title)}"
            placeholder="e.g. Best XI of the decade" maxlength="80" />
        </label>
      </div>

      <div class="lb-stage">
        <div class="lb-pitch">
          ${pitchMarkings()}
          ${slots().map(slotNode).join("")}
        </div>
        ${pickerNode()}
      </div>

      <p class="lb-count">${filled} of 11 picked</p>

      <div class="lb-actions">
        <button class="btn btn-primary lb-copy-image"${
          filled === 0 || state.rendering ? " disabled" : ""
        }>${state.rendering ? "Drawing…" : "Copy as image"}</button>
        <button class="btn lb-save-image"${
          filled === 0 || state.rendering ? " disabled" : ""
        }>Download image</button>
        <button class="btn lb-copy"${filled === 0 ? " disabled" : ""}>Copy as text</button>
        <button class="btn lb-reset"${filled === 0 ? " disabled" : ""}>Clear</button>
      </div>

      <details class="lb-preview">
        <summary>Preview the text</summary>
        <pre>${escapeHtml(currentMarkdown())}</pre>
      </details>
    </div>`;

  wire(container, api);
}

function wire(container, api) {
  const q = (sel) => container.querySelector(sel);
  const rerender = () => render(container, api);

  q(".lb-formation")?.addEventListener("change", (e) => {
    // Slot ids differ between formations, so anything already placed
    // would land on the wrong position. Keep the players, drop the
    // placement, and say so rather than silently losing the XI.
    const hadPicks = Object.keys(state.picks).length > 0;
    state.formation = e.target.value;
    state.picks = {};
    state.activeSlot = null;
    state.notice = hadPicks ? "Formation changed — the pitch has been cleared." : null;
    rerender();
  });

  const title = q(".lb-title");
  title?.addEventListener("input", () => {
    state.title = title.value;
  });

  container.querySelectorAll(".lb-slot").forEach((el) => {
    el.addEventListener("click", () => {
      state.activeSlot = state.activeSlot === el.dataset.slot ? null : el.dataset.slot;
      state.search = "";
      state.notice = null;
      rerender();
    });
  });

  q(".lb-close")?.addEventListener("click", () => {
    state.activeSlot = null;
    rerender();
  });

  const search = q(".lb-search");
  search?.addEventListener("input", () => {
    state.search = search.value;
    const at = search.selectionStart;
    rerender();
    const again = container.querySelector(".lb-search");
    if (again) {
      again.focus();
      again.setSelectionRange(at, at);
    }
  });

  container.querySelectorAll(".lb-option").forEach((el) => {
    el.addEventListener("click", () => {
      const player = state.players.find((p) => p.uid === el.dataset.uid);
      if (player) {
        state.picks[state.activeSlot] = player;
        state.activeSlot = null;
      }
      rerender();
    });
  });

  q(".lb-clear-slot")?.addEventListener("click", () => {
    delete state.picks[state.activeSlot];
    state.activeSlot = null;
    rerender();
  });

  q(".lb-reset")?.addEventListener("click", () => {
    state.picks = {};
    state.activeSlot = null;
    state.notice = null;
    rerender();
  });

  q(".lb-copy")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(currentMarkdown());
      state.notice = "Copied. Paste it into any reply.";
    } catch (e) {
      state.notice = "Could not copy automatically — select the text in the preview instead.";
    }
    rerender();
  });

  q(".lb-copy-image")?.addEventListener("click", async () => {
    await withImage(container, api, async (canvas) => {
      const blob = await canvasToBlob(canvas);

      if (!navigator.clipboard || !window.ClipboardItem) {
        throw new Error("unsupported");
      }

      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      state.notice = "Image copied. Paste it straight into a reply.";
    });
  });

  q(".lb-save-image")?.addEventListener("click", async () => {
    await withImage(container, api, async (canvas) => {
      const blob = await canvasToBlob(canvas);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(state.title.trim() || state.formation).replace(/[^\w-]+/g, "-")}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoked on the next tick so the download has started.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      state.notice = "Image saved.";
    });
  });

// Drawing waits on eleven photo loads, so the button has to show that
// something is happening and has to recover cleanly if it does not.
async function withImage(container, api, handler) {
  state.rendering = true;
  state.notice = null;
  render(container, api);

  try {
    const canvas = await renderLineupImage({
      slots: slots(),
      picks: state.picks,
      formation: state.formation,
      title: state.title.trim() || null,
      footer: window.location.hostname,
    });

    await handler(canvas);
  } catch (e) {
    // Firefox has only partial support for writing images to the
    // clipboard, so say what to do instead of just failing.
    state.notice =
      e && e.message === "unsupported"
        ? "This browser cannot copy images to the clipboard — use Download image instead."
        : "Could not build the image. Download image may still work.";
  } finally {
    state.rendering = false;
    render(container, api);
  }
}

// --- mounting --------------------------------------------------------------

function unmount() {
  document.getElementById(CONTAINER_ID)?.remove();
  document.querySelectorAll("[data-lb-hidden]").forEach((el) => {
    el.style.display = el.dataset.lbHidden;
    delete el.dataset.lbHidden;
  });
}

async function mount(api) {
  const outlet = document.querySelector("#main-outlet");
  if (!outlet) {
    return;
  }

  unmount();

  [...outlet.children].forEach((child) => {
    child.dataset.lbHidden = child.style.display || "";
    child.style.display = "none";
  });

  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  outlet.appendChild(container);

  const cfg = settings(api);
  state.formation = FORMATIONS[cfg.formation] ? cfg.formation : DEFAULT_FORMATION;
  state.picks = {};
  state.activeSlot = null;
  state.notice = null;
  state.error = null;
  state.loading = true;
  render(container, api);

  try {
    const payload = await ajax(cfg.url);
    state.players = (payload.players || []).map((p) => ({
      uid: p.uid,
      name: p.name,
      full_name: p.full_name,
      position: p.position,
      shirt_number: p.shirt_number,
      photo_url: p.photo_url,
      // Worked out once here rather than on every render.
      label: shortLabel(p),
    }));

    if (!state.players.length) {
      state.error =
        "The squad list is empty. Add players in Admin → Plugins → Players first.";
    }
  } catch (e) {
    state.players = [];
    state.error =
      "Could not load the squad. This builder reads from the players plugin — check it is installed and enabled.";
  } finally {
    state.loading = false;
    if (document.getElementById(CONTAINER_ID)) {
      render(container, api);
    }
  }
}

export default apiInitializer("1.8.0", (api) => {
  const check = () => {
    if (ROUTE.test(window.location.pathname)) {
      if (!document.getElementById(CONTAINER_ID)) {
        mount(api);
      }
    } else {
      unmount();
    }
  };

  api.onPageChange(check);
  check();
});

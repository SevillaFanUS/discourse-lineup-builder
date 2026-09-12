// Draws the XI to a canvas so it can be copied or saved as a picture.
//
// Player photos are loaded with crossOrigin="anonymous" on purpose. An
// image drawn from an origin that sends no CORS headers taints the
// canvas, and toBlob() then throws — after the picture looks fine on
// screen. Requesting CORS up front means such an image simply fails to
// load, we fall back to initials, and the canvas always stays exportable.

import { initials } from "discourse/plugins/discourse-lineup-builder/discourse/lib/player-names";

const W = 760;
const H = 1140;

const PAD_TOP = 96;
const PAD_BOTTOM = 56;

const TURF = "#35874a";
const TURF_DARK = "#2c7340";
const LINE = "rgba(255,255,255,0.45)";

const IMAGE_TIMEOUT = 6000;

function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }

    const img = new Image();
    let settled = false;

    const done = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    // A photo host that never responds should cost a placeholder, not a
    // hung button.
    setTimeout(() => done(null), IMAGE_TIMEOUT);

    img.crossOrigin = "anonymous";
    img.onload = () => done(img);
    img.onerror = () => done(null);
    img.src = url;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPitch(ctx, top, height) {
  const gradient = ctx.createLinearGradient(0, top, 0, top + height);
  gradient.addColorStop(0, TURF_DARK);
  gradient.addColorStop(0.5, TURF);
  gradient.addColorStop(1, TURF_DARK);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, top, W, height);

  // Mown stripes, subtle enough not to fight the players.
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  const stripe = height / 12;
  for (let i = 0; i < 12; i += 2) {
    ctx.fillRect(0, top + i * stripe, W, stripe);
  }

  ctx.strokeStyle = LINE;
  ctx.lineWidth = 3;

  const inset = 18;
  ctx.strokeRect(inset, top + inset, W - inset * 2, height - inset * 2);

  ctx.beginPath();
  ctx.moveTo(inset, top + height / 2);
  ctx.lineTo(W - inset, top + height / 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(W / 2, top + height / 2, 78, 0, Math.PI * 2);
  ctx.stroke();

  const boxW = 300;
  const boxH = 130;
  ctx.strokeRect((W - boxW) / 2, top + inset, boxW, boxH);
  ctx.strokeRect((W - boxW) / 2, top + height - inset - boxH, boxW, boxH);

  const sixW = 150;
  const sixH = 52;
  ctx.strokeRect((W - sixW) / 2, top + inset, sixW, sixH);
  ctx.strokeRect((W - sixW) / 2, top + height - inset - sixH, sixW, sixH);
}

function drawAvatar(ctx, img, label, cx, cy, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  if (img) {
    // Cover, not stretch: headshots have wildly different aspect ratios
    // and a squashed face is worse than a tight crop.
    const scale = Math.max((radius * 2) / img.width, (radius * 2) / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  } else {
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.fillStyle = "#fff";
    ctx.font = `700 ${Math.round(radius * 0.82)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials(label), cx, cy + 1);
  }

  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawLabel(ctx, text, cx, y) {
  ctx.font = "600 19px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const width = ctx.measureText(text).width + 16;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  roundRect(ctx, cx - width / 2, y, width, 26, 6);
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.fillText(text, cx, y + 4);
}

export async function renderLineupImage({ slots, picks, formation, title, footer }) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#14181c";
  ctx.fillRect(0, 0, W, H);

  const pitchTop = PAD_TOP;
  const pitchHeight = H - PAD_TOP - PAD_BOTTOM;
  drawPitch(ctx, pitchTop, pitchHeight);

  // Header
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  if (title) {
    ctx.fillStyle = "#fff";
    ctx.font = "700 34px system-ui, sans-serif";
    ctx.fillText(title, W / 2, 46);
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.font = "600 22px system-ui, sans-serif";
    ctx.fillText(formation, W / 2, 76);
  } else {
    ctx.fillStyle = "#fff";
    ctx.font = "700 34px system-ui, sans-serif";
    ctx.fillText(formation, W / 2, 60);
  }

  // Photos are fetched together rather than one at a time so eleven slow
  // hosts cost one timeout, not eleven.
  const images = await Promise.all(
    slots.map((slot) => loadImage(picks[slot.id]?.photo_url))
  );

  slots.forEach((slot, index) => {
    const pick = picks[slot.id];
    const cx = (slot.x / 100) * W;
    // Slot y is measured from the team's own goal line, which is the
    // bottom of the drawing.
    const cy = pitchTop + pitchHeight - (slot.y / 100) * pitchHeight;
    const radius = 38;

    if (pick) {
      drawAvatar(ctx, images[index], pick.label, cx, cy, radius);
      drawLabel(ctx, pick.label, cx, cy + radius + 6);
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fill();
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "600 18px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(slot.label, cx, cy + 1);
    }
  });

  if (footer) {
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "500 18px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(footer, W / 2, H - 20);
  }

  return canvas;
}

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("empty"))), "image/png");
    } catch (e) {
      // Thrown when the canvas is tainted. Shouldn't happen given the
      // CORS handling above, but worth failing with a clear reason.
      reject(e);
    }
  });
}

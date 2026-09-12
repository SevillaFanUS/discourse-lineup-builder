// Team sheets read by surname, not by full name. Nobody writes
// "Yassine Bounou En-Nesyri" on a pitch graphic.

// Particles that belong to the surname that follows them, so "van Dijk"
// and "de Jong" survive rather than collapsing to "Dijk" and "Jong".
const PARTICLES = new Set([
  "de", "del", "della", "der", "di", "do", "dos", "da", "das",
  "van", "von", "el", "al", "la", "le", "den", "ten", "ter", "bin", "ibn",
]);

export function surname(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return "";
  }
  if (parts.length === 1) {
    return parts[0];
  }

  let start = parts.length - 1;

  // Walk backwards while the preceding word is a particle.
  while (start > 0 && PARTICLES.has(parts[start - 1].toLowerCase())) {
    start -= 1;
  }

  return parts.slice(start).join(" ");
}

// The squad endpoint sends `name` already resolved to display_name when
// one is set, falling back to full_name. So if they differ, an admin has
// deliberately chosen a short name and it should be used as-is; if they
// match, nobody has, and the surname is the better label.
export function shortLabel(player) {
  if (!player) {
    return "";
  }

  const name = String(player.name || "").trim();
  const full = String(player.full_name || "").trim();

  if (name && full && name !== full) {
    return name;
  }

  return surname(full || name) || name;
}

export function initials(label) {
  return String(label || "?")
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

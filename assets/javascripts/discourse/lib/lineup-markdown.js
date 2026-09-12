// Turns a filled formation into the post body.
//
// Two representations on purpose: a monospace block that looks like the
// pitch, and a plain list underneath. The block is what people want to
// look at; the list is what search indexes and what a screen reader can
// actually read out.

const PITCH_WIDTH = 58;
const MAX_NAME = 14;

// Labels are already surnames by the time they get here; this only
// guards against an unusually long one wrecking the column alignment.
function short(name) {
  const text = String(name || "").trim();
  if (!text) {
    return "—";
  }
  return text.length > MAX_NAME ? `${text.slice(0, MAX_NAME - 1)}…` : text;
}

function centreRow(names) {
  const cells = names.map(short);
  const line = cells.join("  ");
  const pad = Math.max(0, Math.floor((PITCH_WIDTH - line.length) / 2));
  return " ".repeat(pad) + line;
}

export function lineupMarkdown({ formation, title, rows, picks, byRole }) {
  const pitch = rows
    .map((row) => centreRow(row.map((slot) => picks[slot.id]?.label)))
    .join("\n");

  const heading = title ? `**${title}** — ${formation}` : `**${formation}**`;

  const listed = ["GK", "DF", "MF", "FW"]
    .map((role) => {
      const names = byRole[role];
      if (!names || !names.length) {
        return null;
      }
      return `**${role}** ${names.join(", ")}`;
    })
    .filter(Boolean)
    .join("\n");

  return [heading, "", "```text", pitch, "```", "", listed].join("\n");
}

// Groups the chosen players by role, in pitch order, for the list.
export function groupByRole(slots, picks) {
  const byRole = { GK: [], DF: [], MF: [], FW: [] };

  slots.forEach((slot) => {
    const pick = picks[slot.id];
    if (pick) {
      byRole[slot.role].push(pick.label);
    }
  });

  return byRole;
}

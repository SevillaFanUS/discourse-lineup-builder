// Formation geometry, kept apart from the UI so it can be tested with
// plain node. Positions are percentages of the pitch: x across, y from
// the team's own goal line towards the opponent's.

export const FORMATIONS = {
  "4-4-2": [4, 4, 2],
  "4-3-3": [4, 3, 3],
  "4-2-3-1": [4, 2, 3, 1],
  "4-1-4-1": [4, 1, 4, 1],
  "4-4-1-1": [4, 4, 1, 1],
  "4-3-2-1": [4, 3, 2, 1],
  "3-5-2": [3, 5, 2],
  "3-4-3": [3, 4, 3],
  "5-3-2": [5, 3, 2],
  "5-4-1": [5, 4, 1],
};

export const DEFAULT_FORMATION = "4-4-2";

// The keeper sits deep; outfield lines spread across the rest.
const GK_Y = 7;
const FIRST_LINE_Y = 26;
const LAST_LINE_Y = 90;

// Keeps wide players off the touchline.
const MARGIN = 10;

function spread(count) {
  const usable = 100 - MARGIN * 2;
  const step = usable / count;
  // Half a step in from each end, so the line is symmetrical about the
  // centre for any count, odd or even.
  return Array.from({ length: count }, (_, i) => MARGIN + step * (i + 0.5));
}

function lineY(index, total) {
  if (total <= 1) {
    return LAST_LINE_Y;
  }
  return FIRST_LINE_Y + ((LAST_LINE_Y - FIRST_LINE_Y) * index) / (total - 1);
}

// Role drives which players are suggested first in the picker. It is a
// default, never a restriction — a user can put anyone anywhere, which
// avoids arguing about whether a 4-4-1-1's second striker is a forward
// or a midfielder.
function roleFor(lineIndex, lineCount) {
  if (lineIndex === 0) {
    return "DF";
  }
  if (lineIndex === lineCount - 1) {
    return "FW";
  }
  return "MF";
}

function labelsFor(role, count, lineIndex, lineCount) {
  if (role === "DF") {
    if (count === 3) {
      return ["CB", "CB", "CB"];
    }
    if (count === 4) {
      return ["LB", "CB", "CB", "RB"];
    }
    if (count === 5) {
      return ["LWB", "CB", "CB", "CB", "RWB"];
    }
  }

  if (role === "FW") {
    if (count === 1) {
      return ["ST"];
    }
    if (count === 2) {
      return ["ST", "ST"];
    }
    if (count === 3) {
      return ["LW", "ST", "RW"];
    }
  }

  if (role === "MF") {
    if (count === 1) {
      // A lone midfield band sitting just in front of the defence is a
      // holder; one just behind the strikers is a playmaker.
      return lineIndex === 1 ? ["CDM"] : ["CAM"];
    }
    if (count === 2) {
      return ["CM", "CM"];
    }
    if (count === 3) {
      return ["CM", "CM", "CM"];
    }
    if (count === 4) {
      return ["LM", "CM", "CM", "RM"];
    }
    if (count === 5) {
      return ["LM", "CM", "CM", "CM", "RM"];
    }
  }

  return Array.from({ length: count }, () => role);
}

export function buildSlots(formation) {
  const lines = FORMATIONS[formation];
  if (!lines) {
    return [];
  }

  const slots = [
    { id: "gk", role: "GK", label: "GK", x: 50, y: GK_Y, line: -1 },
  ];

  lines.forEach((count, lineIndex) => {
    const role = roleFor(lineIndex, lines.length);
    const labels = labelsFor(role, count, lineIndex, lines.length);
    const xs = spread(count);
    const y = lineY(lineIndex, lines.length);

    xs.forEach((x, i) => {
      slots.push({
        id: `l${lineIndex}p${i}`,
        role,
        label: labels[i] || role,
        x,
        y,
        line: lineIndex,
      });
    });
  });

  return slots;
}

// Rows for the text pitch, forwards first so it reads the way the pitch
// looks on screen.
export function slotRows(slots) {
  const byLine = new Map();
  slots.forEach((slot) => {
    if (!byLine.has(slot.line)) {
      byLine.set(slot.line, []);
    }
    byLine.get(slot.line).push(slot);
  });

  return [...byLine.keys()]
    .sort((a, b) => b - a)
    .map((line) => byLine.get(line).sort((a, b) => a.x - b.x));
}

// Geometry checks for the formation layout. No browser, no Discourse:
//   node script/formations_check.mjs

import { FORMATIONS, buildSlots, slotRows } from "../assets/javascripts/discourse/lib/formations.js";
import { lineupMarkdown, groupByRole } from "../assets/javascripts/discourse/lib/lineup-markdown.js";
import { surname, shortLabel, initials } from "../assets/javascripts/discourse/lib/player-names.js";

const failures = [];

function check(name, fn) {
  let result;
  try {
    result = fn();
  } catch (e) {
    result = `${e.name}: ${e.message}`;
  }
  if (result === true) {
    console.log(`  ok    ${name}`);
  } else {
    console.log(`  FAIL  ${name}${typeof result === "string" ? ` — ${result}` : ""}`);
    failures.push(name);
  }
}

const names = Object.keys(FORMATIONS);

check("there are formations to pick from", () => names.length >= 8 || `only ${names.length}`);

check("every formation fields ten outfield players", () => {
  const bad = names.filter((n) => FORMATIONS[n].reduce((a, b) => a + b, 0) !== 10);
  return bad.length === 0 || `these do not add to 10: ${bad.join(", ")}`;
});

check("every formation name matches its line counts", () => {
  const bad = names.filter((n) => n !== FORMATIONS[n].join("-"));
  return bad.length === 0 || `name/shape mismatch: ${bad.join(", ")}`;
});

check("every formation produces exactly eleven slots", () => {
  const bad = names.filter((n) => buildSlots(n).length !== 11);
  return bad.length === 0 || `wrong slot count: ${bad.join(", ")}`;
});

check("exactly one keeper per formation", () => {
  const bad = names.filter((n) => buildSlots(n).filter((s) => s.role === "GK").length !== 1);
  return bad.length === 0 || bad.join(", ");
});

check("slot ids are unique within a formation", () => {
  const bad = names.filter((n) => {
    const ids = buildSlots(n).map((s) => s.id);
    return new Set(ids).size !== ids.length;
  });
  return bad.length === 0 || bad.join(", ");
});

// A line that is not symmetrical about the centre looks wrong even when
// every player is in the right band, and it is the kind of thing that is
// hard to spot by eye at a glance.
check("every line is symmetrical about the centre", () => {
  const problems = [];
  names.forEach((n) => {
    slotRows(buildSlots(n)).forEach((row) => {
      if (row.length < 2) {
        return;
      }
      const centre = row.reduce((sum, s) => sum + s.x, 0) / row.length;
      if (Math.abs(centre - 50) > 0.001) {
        problems.push(`${n} line centre ${centre.toFixed(2)}`);
      }
    });
  });
  return problems.length === 0 || problems.join("; ");
});

check("an odd-numbered line puts someone on the centre line", () => {
  const slots = buildSlots("4-3-3");
  const mid = slots.filter((s) => s.role === "MF");
  return mid.some((s) => Math.abs(s.x - 50) < 0.001) || `midfield xs: ${mid.map((s) => s.x)}`;
});

check("nobody is off the pitch", () => {
  const problems = [];
  names.forEach((n) =>
    buildSlots(n).forEach((s) => {
      if (s.x < 0 || s.x > 100 || s.y < 0 || s.y > 100) {
        problems.push(`${n} ${s.id} at ${s.x},${s.y}`);
      }
    })
  );
  return problems.length === 0 || problems.join("; ");
});

check("nobody overlaps anybody else", () => {
  const problems = [];
  names.forEach((n) => {
    const slots = buildSlots(n);
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const dx = slots[i].x - slots[j].x;
        const dy = slots[i].y - slots[j].y;
        if (Math.sqrt(dx * dx + dy * dy) < 8) {
          problems.push(`${n}: ${slots[i].id} and ${slots[j].id} too close`);
        }
      }
    }
  });
  return problems.length === 0 || problems.join("; ");
});

check("the keeper is behind every outfield player", () => {
  const bad = names.filter((n) => {
    const slots = buildSlots(n);
    const gk = slots.find((s) => s.role === "GK");
    return slots.some((s) => s.role !== "GK" && s.y <= gk.y);
  });
  return bad.length === 0 || bad.join(", ");
});

check("defenders are behind forwards in every formation", () => {
  const bad = names.filter((n) => {
    const slots = buildSlots(n);
    const df = Math.max(...slots.filter((s) => s.role === "DF").map((s) => s.y));
    const fw = Math.min(...slots.filter((s) => s.role === "FW").map((s) => s.y));
    return df >= fw;
  });
  return bad.length === 0 || bad.join(", ");
});

check("a back four is labelled LB, CB, CB, RB", () => {
  const df = buildSlots("4-4-2").filter((s) => s.role === "DF").sort((a, b) => a.x - b.x);
  return (
    df.map((s) => s.label).join(",") === "LB,CB,CB,RB" || df.map((s) => s.label).join(",")
  );
});

check("a back five gets wing backs", () => {
  const df = buildSlots("5-3-2").filter((s) => s.role === "DF").sort((a, b) => a.x - b.x);
  return df[0].label === "LWB" && df[4].label === "RWB" || df.map((s) => s.label).join(",");
});

check("a front three is LW, ST, RW", () => {
  const fw = buildSlots("4-3-3").filter((s) => s.role === "FW").sort((a, b) => a.x - b.x);
  return fw.map((s) => s.label).join(",") === "LW,ST,RW" || fw.map((s) => s.label).join(",");
});

// The lone band in 4-1-4-1 sits in front of the defence; the lone band in
// 4-4-1-1 sits behind the striker. Same count, different job.
check("a lone holding band is CDM, a lone attacking band is CAM", () => {
  const holder = buildSlots("4-1-4-1").find((s) => s.label === "CDM");
  const playmaker = buildSlots("4-4-1-1").find((s) => s.label === "CAM");
  return (!!holder && !!playmaker) || `CDM: ${!!holder}, CAM: ${!!playmaker}`;
});

// Forwards at the top, keeper alone at the bottom: 4-4-2 reads 2,4,4,1.
check("rows read forwards down to the keeper", () => {
  const rows = slotRows(buildSlots("4-4-2"));
  const sizes = rows.map((r) => r.length).join(",");
  return sizes === "2,4,4,1" || sizes;
});

check("the keeper is alone on the bottom row of every formation", () => {
  const bad = Object.keys(FORMATIONS).filter((n) => {
    const rows = slotRows(buildSlots(n));
    const last = rows[rows.length - 1];
    return last.length !== 1 || last[0].role !== "GK";
  });
  return bad.length === 0 || bad.join(", ");
});

check("each row reads left to right", () => {
  const problems = [];
  names.forEach((n) =>
    slotRows(buildSlots(n)).forEach((row) => {
      const xs = row.map((s) => s.x);
      if (xs.join() !== [...xs].sort((a, b) => a - b).join()) {
        problems.push(n);
      }
    })
  );
  return problems.length === 0 || problems.join(", ");
});

check("an unknown formation returns nothing rather than throwing", () => {
  return buildSlots("9-9-9").length === 0;
});

// --- post body --------------------------------------------------------------

const slots442 = buildSlots("4-4-2");
const full = {};
slots442.forEach((s, i) => (full[s.id] = { label: `Player${i + 1}`, name: `Player ${i + 1}`, uid: `u${i}` }));

const body = lineupMarkdown({
  formation: "4-4-2",
  title: "My XI",
  rows: slotRows(slots442),
  picks: full,
  byRole: groupByRole(slots442, full),
});

check("the post names the formation", () => body.includes("4-4-2") || body);

check("the post contains a fenced block", () => {
  const fences = body.match(/```/g) || [];
  return fences.length === 2 || `found ${fences.length} fence markers`;
});

check("every chosen player appears in the post", () => {
  const missing = Object.values(full).filter((p) => !body.includes(p.label));
  return missing.length === 0 || `missing ${missing.length}`;
});

check("the pitch block has one row per line plus the keeper", () => {
  const block = body.split("```text\n")[1].split("\n```")[0];
  const lines = block.split("\n");
  return lines.length === 4 || `got ${lines.length} rows`;
});

check("forwards are printed above the keeper", () => {
  const block = body.split("```text\n")[1].split("\n```")[0].split("\n");
  const keeper = full["gk"].label;
  return block[block.length - 1].includes(keeper) || `last row: ${block[block.length - 1]}`;
});

check("rows are centred, not left aligned", () => {
  const block = body.split("```text\n")[1].split("\n```")[0].split("\n");
  return block.every((l) => l.startsWith(" ")) || `a row starts at column 0: ${block.find((l) => !l.startsWith(" "))}`;
});

check("an empty slot renders as a dash rather than 'undefined'", () => {
  const partial = { gk: { label: "Keeper", name: "Keeper" } };
  const text = lineupMarkdown({
    formation: "4-4-2",
    title: null,
    rows: slotRows(slots442),
    picks: partial,
    byRole: groupByRole(slots442, partial),
  });
  return (!text.includes("undefined") && text.includes("—")) || text;
});

check("a long name is truncated so the pitch keeps its shape", () => {
  const long = { gk: { label: "Szczesny-Villalibre", name: "Szczesny-Villalibre" } };
  const text = lineupMarkdown({
    formation: "4-4-2",
    title: null,
    rows: slotRows(slots442),
    picks: long,
    byRole: groupByRole(slots442, long),
  });
  return text.includes("…") || "long name was not truncated";
});

check("the role list groups players correctly", () => {
  const grouped = groupByRole(slots442, full);
  return (
    grouped.GK.length === 1 &&
    grouped.DF.length === 4 &&
    grouped.MF.length === 4 &&
    grouped.FW.length === 2
  ) || JSON.stringify(Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.length])));
});

check("a title is included when given and omitted when not", () => {
  const withTitle = body.includes("My XI");
  const without = lineupMarkdown({
    formation: "4-3-3",
    title: null,
    rows: slotRows(buildSlots("4-3-3")),
    picks: {},
    byRole: groupByRole(buildSlots("4-3-3"), {}),
  });
  return (withTitle && !without.includes("undefined")) || "title handling wrong";
});

// --- names ------------------------------------------------------------------

check("a simple name reduces to the surname", () => surname("Loic Bade") === "Bade" || surname("Loic Bade"));

check("a single-word name is left alone", () => surname("Isina") === "Isina" || surname("Isina"));

check("a two-surname name takes the last one", () => {
  return surname("Kike Salas Esteban") === "Esteban" || surname("Kike Salas Esteban");
});

// "van Dijk" and "de Jong" are the surname; "Dijk" and "Jong" are not.
check("a particle stays attached to its surname", () => {
  const cases = {
    "Virgil van Dijk": "van Dijk",
    "Frenkie de Jong": "de Jong",
    "Nayef Aguerd El Amrani": "El Amrani",
  };
  const wrong = Object.entries(cases).filter(([input, want]) => surname(input) !== want);
  return wrong.length === 0 || wrong.map(([i]) => `${i} -> ${surname(i)}`).join("; ");
});

check("stacked particles are all kept", () => {
  return surname("Jan van der Berg") === "van der Berg" || surname("Jan van der Berg");
});

check("empty input does not throw", () => surname("") === "" && surname(null) === "");

// The endpoint resolves display_name for us, so a name that differs from
// full_name means an admin chose it deliberately.
check("an explicit display name wins over the surname", () => {
  const label = shortLabel({ name: "Peque", full_name: "Francisco Jose Perez Rodriguez" });
  return label === "Peque" || label;
});

check("without a display name the surname is used", () => {
  const label = shortLabel({ name: "Loic Bade", full_name: "Loic Bade" });
  return label === "Bade" || label;
});

check("a player with only a name still gets a label", () => {
  return shortLabel({ name: "Nyland" }) === "Nyland" || shortLabel({ name: "Nyland" });
});

check("initials take the first letters, capped at two", () => {
  return (
    initials("van Dijk") === "VD" && initials("Isina") === "I" && initials("") === "?"
  ) || `${initials("van Dijk")} ${initials("Isina")} ${initials("")}`;
});

check("the post uses labels, not full names", () => {
  const slots = buildSlots("4-4-2");
  const picks = {
    gk: { label: "Nyland", name: "Orjan Nyland", full_name: "Orjan Nyland" },
  };
  const text = lineupMarkdown({
    formation: "4-4-2",
    title: null,
    rows: slotRows(slots),
    picks,
    byRole: groupByRole(slots, picks),
  });
  return (text.includes("Nyland") && !text.includes("Orjan")) || text;
});

console.log("");
if (failures.length) {
  console.log(`${failures.length} failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("All geometry checks passed.");

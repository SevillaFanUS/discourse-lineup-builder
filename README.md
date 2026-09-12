# discourse-lineup-builder

Pick a formation, tap the positions to fill them from the squad, and post
the XI into a topic.

Licensed GPLv2, matching Discourse.

---

## Requires discourse-sevilla-players

The squad comes from that plugin's public endpoint
(`/players/data.json?scope=first_team`), so there is no second player
list to maintain. Install and populate it first — without it the builder
loads and says so plainly rather than showing an empty pitch.

The endpoint is a site setting, so any JSON source returning
`{ players: [{ uid, name, position, shirt_number }] }` will work.

---

## Using it

`/lineup`. Link it from your header.

- **Ten formations**, from 4-4-2 to 4-2-3-1 to 5-4-1.
- **Tap a position**, pick from a searchable list. Players already on the
  pitch disappear from the list, so nobody gets picked twice.
- **Position is a suggestion, not a rule.** Players whose listed position
  matches the slot come first, then everyone else. Arguing about whether
  a player *is* a right back is what the thread is for.
- **Copy as image** puts a rendered pitch on the clipboard, ready to
  paste straight into a reply. **Download image** saves the same PNG.
- **Copy as text** copies the monospace version.
- **Changing formation clears the pitch**, and says so. Slot positions
  differ between shapes, so keeping the picks would put players in the
  wrong places.

### Names

Players are labelled by **surname**, because that is how a team sheet
reads. Particles stay attached — `van Dijk` and `de Jong`, not `Dijk` and
`Jong`.

Setting a player's **display name** in the players plugin overrides this
entirely, which is the escape hatch for anyone the rule gets wrong:
Spanish double surnames, one-word nicknames, and so on.

### Photos

Player photos from the players plugin are drawn as circular avatars on
the pitch, in the picker, and in the exported image. A player without one
gets their initials.

For the **exported image**, photos are loaded with
`crossOrigin="anonymous"`. An image from a host that sends no CORS
headers taints the canvas and makes the export throw *after* the picture
already looks right on screen. Requesting CORS up front means such a
photo simply falls back to initials and the export always works.

The practical consequence: **photos hosted on your own Discourse always
export**; photos hotlinked from elsewhere may show on screen but appear
as initials in the image, depending on that host.

### What the text copy looks like

A monospace block that looks like the pitch, then the same XI as a list:

```
**Sunday XI** — 4-2-3-1

        En-Nesyri
  Lukebakio  Sow  Peque
      Gudelj  Agoumé
Carmona  Badé  Salas  Pedrosa
          Nyland

**GK** Nyland
**DF** Carmona, Badé, Salas, Pedrosa
**MF** Gudelj, Agoumé, Lukebakio, Sow, Peque
**FW** En-Nesyri
```

Both representations on purpose. The block is what people want to look
at; the list is what search indexes and what a screen reader can read
out.

Image copying uses `ClipboardItem`, which Firefox supports only partially
— there the button says so and points at **Download image** instead.

---

## Settings

| Setting | Notes |
| --- | --- |
| `lineup_builder_enabled` | Off by default. |
| `lineup_builder_players_url` | Squad endpoint. Defaults to the players plugin. |
| `lineup_builder_default_formation` | Formation on load. Default `4-4-2`. |
| `lineup_builder_title` | Heading on the page. |

---

## Install

```yaml
- exec:
    cd: $home/plugins
    cmd:
      - git clone https://github.com/SevillaFanUS/discourse-lineup-builder.git
```

No migrations — nothing is stored server-side. `./launcher rebuild app`
to compile the assets, then enable `lineup_builder_enabled`.

---

## Checks

```bash
ruby script/check.rb          # everything, including the geometry suite
node script/formations_check.mjs   # geometry only
```

The geometry is where a silent bug hides: an off-by-one in the spacing
maths produces a pitch that is subtly lopsided rather than obviously
broken. 41 checks cover it — every formation fields exactly eleven, every
line is symmetrical about the centre line to within a rounding error,
nobody overlaps anybody, defenders are behind forwards, the keeper is
behind everyone, and a lone midfield band is labelled `CDM` in front of
the defence but `CAM` behind the strikers.

The surname rules are checked too, including the particle cases that are
easy to get wrong.

The remaining checks are the classes of mistake that have cost rebuilds
on this install before: asset paths resolving under `assets/`, imports
naming a plugin that matches `plugin.rb`, and front-end settings actually
being `client: true` — a setting that isn't is simply absent in the
browser, and fails silently.

---

## Not built

- **Saving lineups.** Nothing is persisted; the copied image or text is
  the artefact. Adding a table and `/lineup/:uid` would be additive.
- **Posting directly to a topic.** Removed deliberately — copy and paste
  gives you control over which topic and what you say alongside it.
- **Substitutes and formations beyond eleven.**

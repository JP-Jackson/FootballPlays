# Coach's Playbook

A football play designer for youth coaches. One HTML file, no install, no accounts,
no internet needed after the first load. Open it on a laptop, a phone or a sideline tablet.

Built for Josh Bujnoch's peewee team.

![Coach's Playbook](screenshot.png)

## Open it

**On the web:** https://jp-jackson.github.io/FootballPlays/
(enable it once under *Settings → Pages → Deploy from branch → main / root*)

**On your own machine:** download `index.html` and double-click it. That's the whole program.

## What it does

- **34 plays built in** — 23 on offense, 11 on defense, with the coaching point for each one.
- **Any team size, 5 v 5 through 11 v 11.** Move the slider and every formation rebuilds itself.
  Plays that need more bodies than you have are hidden automatically.
- **Draw your own plays.** Name it, pick a formation, drag players where you want them,
  then give each one a job — run, route, block, pull, fake, motion, blitz, man, zone.
- **Watch it develop.** *Animate* walks every player down their assignment so the kids can see it.
- **Put real names on it.** Enter your roster once, then assign kids to spots. Their number
  goes in the circle, their name underneath.
- **Get it off the screen.** Export a PNG to text the parents, or print/save a PDF —
  one play, your whole custom playbook, or everything on screen, one play per page.
- **Four field styles**, from a bare whiteboard that barely uses ink up to full turf.
- **Back it up.** Download the playbook as a file, restore it on another device or hand it
  to an assistant coach.

## What's in the library

**Offense** — Wedge · 34 Dive · 26 Power · 28 Toss Sweep · Counter · QB Sneak · Buck Sweep ·
Trap · Waggle · Jet Sweep · Inside Zone · Zone Read · Single Wing Power · Goal Line Blast ·
All Slants · Four Verticals · Curl/Flat · Smash · Stick · Bubble Screen · RB Screen ·
Sprint Out · Play Action Post

**Defense** — 5-3 Cover 3 · 5-3 Run Fits · 6-2 Gap Control · 4-4 Cover 3 · 4-4 Double A Blitz ·
4-3 Cover 2 · 4-3 Cover 1 Man · 3-4 Cover 3 · 5-2 Monster · Corner Blitz Cover 0 · Goal Line 6-5

**Formations** — I-Formation, Wing-T, Spread, Trips, Pistol, Single Wing, Full House on offense;
5-3, 6-2, 4-4 Split, 4-3, 3-4, 5-2 Monster, Goal Line 6-5 on defense.

## Reading a diagram

| Symbol | Means |
| --- | --- |
| Circle | Offensive player |
| Square | Defensive player |
| Line ending in an arrow | That player moves there |
| Line ending in a cross bar | A block |
| Blue line | A pulling or trapping lineman |
| Dashed line | A fake, pre-snap motion, or the ball in the air |
| Dashed line ending in a circle | A zone drop — the defender settles in that area |

Downfield is up. The thick line across the middle is the line of scrimmage.

## How team size works

Eight players and up gives you five linemen. Six and seven give you a center and two guards.
Five is a center only, the way most flag leagues play it. Everyone left over fills the skill
spots, in the order that formation cares about most — so a 9 v 9 I-Formation keeps the two
backs and the tight end and drops the wide receivers.

## Where your plays live

In your browser's local storage, on that device. Nothing is uploaded anywhere. Clearing your
browser data clears your plays, so use **Backup** now and then — it downloads a single JSON
file you can keep or move to another device with **Restore**.

## Under the hood

`index.html` is the entire application: no build step, no dependencies, no network calls.
Plays are authored in yards relative to the ball and compiled to SVG at load time, which is
why the same play can be drawn for any number of players. Diagrams are exported by
serializing the live SVG, so a PNG or a printed page is pixel-identical to what's on screen.

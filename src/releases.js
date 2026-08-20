// What version is running, and what changed in each one.
// Bump VERSION and add an entry here in the same commit as the change —
// the app reads this, so a release note is never out of date with the code.

export const VERSION = "1.5.0";

export const RELEASES = [
  {
    version: "1.5.0",
    date: "2026-08-20",
    title: "Built for the sideline",
    notes: [
      "The animation is a proper transport now: play, pause, and a bar you can drag to any moment in the play. Stop on the mesh point, talk about it, then carry on.",
      "Speed control — quarter, half, normal or double. Quarter speed stretches a play to nearly twelve seconds, which is about right for a seven-year-old following a pulling guard.",
      "A full-screen button gives the whole screen to the field. It works on iPhone, where the browser's own full-screen mode does not.",
      "The speed you pick is remembered on your device.",
      "Space bar plays and pauses. Escape leaves full screen.",
      "On a phone, the plays open in a slide-out menu instead of living a screen and a half down the page.",
      "Copy, rename and delete on a play only appeared when you hovered a mouse over it, so on a phone they could not be reached at all. They are always visible on touch now.",
      "Buttons, sliders and dropdowns are finger-sized on touch, and the toolbars scroll sideways rather than stacking up and pushing the field off the screen. The field now sits 411 pixels up the page instead of 588.",
    ],
  },
  {
    version: "1.4.0",
    date: "2026-08-20",
    title: "The opponent plays back",
    notes: [
      "Pick what the other side runs, not just where they stand. The opponent list is now real calls — 5-3 Cover 3, Double A Blitz, Cover 1 Man — and they arrive with their rushes, drops and coverage already attached.",
      "Hit Animate and the defence plays: linemen rush their gaps, linebackers drop to their hooks, corners bail to their deep thirds.",
      "Against a man call, defenders chase their receiver the whole way. On Four Verticals a corner that used to stand still now closes from 7.7 yards to under 2.",
      "If you draw a defence and call an offence that throws, the ball comes with it.",
      "Changing the call replaces what the opponent was doing, so you always get the look you picked.",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-08-20",
    title: "Labels that teach the position",
    notes: [
      "The position abbreviation now stays in the circle, where a coach reads it fastest.",
      "The position is spelled out above the marker — LG reads as Left Guard — so a sheet teaches the position instead of assuming it.",
      "A kid's jersey number sits above his name below the marker.",
      "Labels are placed rather than just drawn: each one claims its space, and anything that would collide moves to a second row or beside the player. A tight offensive line staggers instead of running together, and a stacked backfield labels to the side.",
      "Numbers and names outrank position words for space — finding your own name on the sheet matters more than the job title.",
    ],
  },
  {
    version: "1.2.1",
    date: "2026-08-20",
    title: "The drawn arrow points where the ball goes",
    notes: [
      "The pass arrow on the diagram now ends where the receiver finishes his route, matching the animation. It had been stopping where he lined up — on Bubble Screen that was more than 13 yards short of the catch.",
      "Man coverage lines are drawn to the receiver being covered, in the same place the animation takes the defender.",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-08-20",
    title: "The animation follows people, not spots",
    notes: [
      "A pass now lands on the receiver wherever he has run to, instead of flying to the patch of grass he was standing on when you drew it.",
      "The throw leaves from wherever the quarterback has dropped back to.",
      "Defenders in man coverage chase their man through the whole play and trail just off his shoulder.",
      "Each defender in man coverage gets his own receiver — two of them can no longer cover the same man while a back runs free.",
      "Linemen and the quarterback are never treated as somebody's man, so a linebacker no longer ends up covering the center.",
      "Zone drops deliberately stay put: a zone defender is responsible for an area, not a person.",
      "Version and release notes are in the app, under the version number in the header.",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-08-20",
    title: "Easier to read, easier to manage",
    notes: [
      "Ball carrier lines are now red, and every line the football travels along — handoff, pitch, pass — is red too, so you can trace the ball through a play without reading a single label.",
      "Blocks are black. Pulling and trapping linemen are blue so you can pick them out of the line.",
      "Pass routes, quarterback drops, fakes and motion each got their own colour instead of all being the same navy.",
      "The opponent is a real side now — drag defenders around and animate them against your offense.",
      "Coaching points can be written and edited on your own plays.",
      "Copy any play, including the 34 built-in ones, to make a version you can change.",
      "Rename and delete your own plays straight from the play list.",
      "Done and Undo moved next to the drawing controls instead of sitting above the field.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-08-20",
    title: "Accounts, shared playbooks and feedback",
    notes: [
      "Everything is behind a login. An admin creates every account — there is no self-signup.",
      "Your playbook and roster live on the server, so they follow you between phone, tablet and laptop.",
      "Everyone on the same team shares one playbook.",
      "Feedback button on every page, with a status pipeline and notes for triage.",
      "34 plays built in, for any team size from 5 v 5 to 11 v 11.",
    ],
  },
];

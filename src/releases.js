// What version is running, and what changed in each one.
// Bump VERSION and add an entry here in the same commit as the change —
// the app reads this, so a release note is never out of date with the code.

export const VERSION = "1.2.0";

export const RELEASES = [
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

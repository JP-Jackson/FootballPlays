# Charging for access — a plan for later

Written 2026-08-20, while the app is free and running one team. Nothing here is
built. It exists so the decisions are already thought through when the question
becomes real, and so nobody has to reconstruct the reasoning from scratch.

**The recommendation up front: don't build any of this yet.** Run a season with a
real team first. What people will pay for is not knowable from here, and none of
the work below gets harder for waiting — because the part that *would* have been
expensive to retrofit is already correct.

---

## 1. What's already right

The tenancy model. A **team** is the unit that owns a playbook, and scoping is
enforced in the SQL `WHERE` clause rather than filtered after the fact:

```sql
SELECT * FROM plays WHERE team = ?
UPDATE plays SET ... WHERE id = ? AND team = ?
```

Verified: a coach on another team asking for a play by a guessed id gets a 404,
not somebody else's play. That means **team is already a billing unit** — a
subscription attaches to a team and everything a team owns is already fenced off.

Getting this wrong early is what forces a rewrite later. It isn't wrong.

Also already in place and reusable: roles, an audit log, a password system with
per-user salts, and Resend wired up for outbound email.

## 2. What changes for the people using it

Today an admin creates every account by hand. Someone wants in, they ask, you
make them a username and read them a password down the phone. There is no
signup, no password reset, and a head coach cannot add his own assistant.

Paid, the same person does all of that themselves:

| | Today | Paid |
| --- | --- | --- |
| Getting an account | You create it | They sign up, verify an email |
| Paying | — | Card at signup, managed in the provider's portal |
| Adding an assistant coach | You do it | The coach who pays does it |
| Forgotten password | They phone you | Email reset link |
| Cancelling | — | Self-serve; playbook goes read-only, never deleted |

## 3. The one structural change: a team-owner role

Roles today are `admin` and `coach`, and **`admin` is global** — it sees every
team's plays, users and feedback. That is right for the platform owner and wrong
for a customer. A paying coach must administer his own team and see nothing
beyond it.

    admin   platform owner. All teams, all feedback. Stays as it is.
    owner   paid the bill. Manages coaches on his own team only.
    coach   uses the playbook.

Everywhere that currently reads `role === 'admin'` needs to become a question
about *scope*, not just rank: "may this person manage this team?" That is the
one change with real reach through the codebase. Everything else is additive.

## 4. Merchant of record — decide this before writing any payment code

This decides who is legally the seller, and therefore who owes sales tax.

**Stripe** is a payment processor, not a merchant of record. Using it directly,
**you are the seller**. You are responsible for registering, collecting and
remitting sales tax in every jurisdiction that taxes SaaS — and many US states
do, with rules that differ per state. Texas, for example, treats SaaS as a
taxable data processing service. Stripe Tax can calculate what is owed but does
not file or remit it for you.

**A merchant of record** — Paddle, Lemon Squeezy, FastSpring — legally sells the
product to the customer on your behalf. They handle tax registration, collection
and remittance everywhere, and pay you out. Their name, not yours, is on the
customer's statement.

| | Stripe direct | Merchant of record |
| --- | --- | --- |
| Fee | ~2.9% + 30¢ | ~5% + 50¢ |
| Sales tax | Your problem, in every state | Handled |
| Setup | More code, more admin | Less of both |
| Control | Full | Their checkout, their rules |
| Fits when | Volume is high enough that 2% matters | Volume is low and your time is the scarce thing |

**Recommendation: a merchant of record**, for a solo operator selling a $29
product to coaches in many states. The extra ~2% is trivial next to the cost of
tracking multi-state tax obligations alone. Revisit if this ever gets big enough
that 2% is real money — by then it can justify an accountant.

If it stays informal — one league, cash or Venmo, you add accounts by hand —
none of this applies. That is a legitimate answer.

## 5. Pricing shape

Charge **per team per season, not per seat.** Youth coaches think in seasons and
will not do per-coach arithmetic for three volunteer dads. Roughly $29 a season,
or $6/month, whole staff included.

Worth considering a free tier: the 34 built-in plays browsable, and two or three
custom plays. For a product at this price a coach feeling it work beats a trial
countdown.

## 6. What gets built, in order

1. **Self-signup** — username, email verification, team named at signup.
2. **Password reset** — emailed link. Needed the day a stranger has an account;
   "phone JP" does not survive contact with paying customers.
3. **The `owner` role** — scope checks, and an invite flow for a team's own
   coaches.
4. **Payment** — provider's checkout, a webhook route in `worker.js`, and a
   `subscriptions` table keyed by team.
5. **Gating** — one check in the auth path. Decide deliberately what a lapsed
   team can still do; **read-only, never deleted** is the humane default. Losing
   a season's playbook over a failed card would be unforgivable.

Steps 1–3 are about a day. Steps 4–5 another.

### Data model

```sql
CREATE TABLE subscriptions (
  team              TEXT PRIMARY KEY,
  provider          TEXT NOT NULL,   -- 'paddle' | 'stripe'
  provider_ref      TEXT,            -- their customer/subscription id
  status            TEXT NOT NULL,   -- trialing | active | past_due | canceled
  current_period_end TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT
);
```

Plus on `users`: `email_verified`, `reset_token`, `reset_expires`.

Nothing existing has to change shape — `plays`, `roster` and `users` are already
keyed the right way.

## 7. Costs

Not a factor at this size. Workers and D1 free tiers cover hundreds of teams;
paid Workers is $5/month. The real costs are payment fees and your time.

## 8. Can one person coach more than one team?

**Settle this before signup is built.** It is the only open question that changes
the shape of the data, and it gets more expensive with every account created.

Today a user belongs to exactly one team, because team is a single column:

```sql
users.team  TEXT NOT NULL      -- one team, forever
users.role  TEXT NOT NULL      -- and one role, everywhere
```

That holds up fine for one man coaching one squad. It breaks the moment someone
runs a JV and a varsity, coaches two age groups, or helps out with another
team's staff — all of which are ordinary in youth football. It also breaks a
plausible business case: a league buying several teams at once.

Supporting it means membership becomes its own table, and **role moves onto the
membership rather than the person**:

```sql
CREATE TABLE memberships (
  user_id    TEXT NOT NULL,
  team       TEXT NOT NULL,
  role       TEXT NOT NULL,      -- owner | coach, per team
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, team)
);
```

That second part is the real consequence. Someone can be the **owner** of the
team he pays for and merely a **coach** on a friend's — so "what is this person
allowed to do" stops being a property of the user and becomes a question about a
user *and* a team. Every scope check changes shape, the session has to carry a
current team, and the interface needs somewhere to switch between them.

Three knock-on effects worth naming now:

- **Billing follows the team, not the person.** A coach on two teams may be
  paying for one and a guest on the other. The subscription already keys on team,
  which is fortunate — it means this stays true without rework.
- **The session gains a current team.** `readSession` returns one user today;
  it would return a user plus their memberships plus whichever team they are
  looking at.
- **Plays already scope correctly.** `plays.team` needs no change at all. The
  work is entirely in identity, not in content.

**Cost of deciding late:** every existing account has to be migrated into the new
table, every scope check rewritten, and any customer who signed up expecting one
team has to be told how the interface now works. Cheap at two users. Not cheap at
two hundred.

**Recommendation:** do not build it now, but ask Josh whether he or anyone on his
staff helps with a second squad. One honest answer settles it. If the answer is
yes, build `memberships` at the same time as signup — retrofitting identity is
the one piece of this that genuinely hurts.

## 9. Other open questions

- Season-based or monthly billing? Football is seasonal; a yearly charge in
  August may fit better than twelve monthly ones.
- Does the free tier need the export/print features, or are those the paid hook?
- Who owns a playbook if the coach who paid leaves the team?

---

*This file lives outside `public/`, so it is never served by the Worker.*

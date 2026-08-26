> **SUPERSEDED (2026-08-26):** built under the pre-revision model. Violates revised spec:
> fabricated "Load more" control (source uses infinite scroll — §9), passed QA with 8/272
> profiles captured (§10 count consistency), no analysis package or HITL gate (invariants 1–2).
> Retained as regression fixture for the new anti-fabrication and count-consistency QA gates.

# job-001 — monthlystaff.com → Teamloop

**Source:** https://monthlystaff.com/
**Rebrand:** Teamloop — "Specialists who stay, month after month."
**Status:** completed (attempt 1) · QA 28/28 passed

## What was built
A static rebrand that mirrors the source site's **structure and design language**
with 100% original copy and fictional placeholder profiles. No logos, copy,
imagery, testimonials, or legal text from the source were reused.

## Source structure captured
- Sticky header: brand + primary nav + dual CTAs
- Hero: kicker, headline w/ price anchor, subhead, search bar, popular tags, stat row
- Dual cards (for talent / explore)
- Talent section: category filter chips + responsive profile-card grid (8 cards)
- Vacancies section: heading + "looking to hire" banner
- How it works: 3 numbered steps
- Why choose us: dark section, intro + 4 benefit tiles
- CTA card (gradient)
- Footer: brand + 3 link columns + hiring-guides nav + bottom bar

## Design tokens (rebranded palette)
| Token | Value | Role |
|---|---|---|
| `--green` | `#1dbf73` | primary / accent |
| `--green-deep` | `#087850` | hover / dark accent |
| `--ink` | `#222325` | text |
| `--muted` | `#62646a` | secondary text |
| `--line` | `#e4e5e7` | borders |
| `--cream` | `#f7f7f2` | section bg |
| `--tint` | `#eaf8f1` | hero / avatar bg |

Font: Inter (Google Fonts). Rounded cards, soft shadows, pill buttons/chips.

## Outputs
- `exports/teamloop/index.html`
- `exports/teamloop/css/styles.css`
- `exports/teamloop/js/main.js`

## QA
`qa/checks/job-001.js` — 28 checks: tag balance, required sections/content,
every HTML class styled, no source-content leakage, no external images,
JS parses, CSS braces balanced. All passed.

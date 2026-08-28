# Analysis Review — dbg-r07

Source: **http://127.0.0.1:62657/**

> Review this before extraction begins. You can confirm, narrow scope, remove components/pages, or skip and accept the draft.

## Site structure

### Routes (2)

| Path | Type | Purpose |
|---|---|---|
| `/` | landing | We do things |
| `/services` | content | Services |

## Reusable assets

| Component | Reuse count | Routes | Confidence |
|---|---|---|---|
| `header` | 2 | 2 | 0.8 |
| `footer` | 2 | 2 | 0.8 |
| `navigation` | 2 | 2 | 0.8 |
| `card.profile-card` | 4 | 1 | 0.8 |
| `section` | 2 | 1 | 0.8 |

Design tokens: 1 colors, 0 font families.

## Personalization — what you need to supply

- **brand**: `displayName`, `logo`, `primaryColor`, `fonts`, `logo_home`
- **contact_integrations**: (none detected)
- **content**: `copy.home.h1-0`, `copy.home.h3-1`, `copy.home.h3-2`, `copy.home.h3-3`, `copy.home.h3-4`, `image.home-5`, `image.home-6`, `image.home-7` …+3
- **legal**: (none detected)

Detected integrations (record-only, never scraped): 
- linkedin: https://www.linkedin.com/company/fixture (from /)

Content collections: section.profile-card (4 items, static)

## Uncertainties / gaps

- [medium] interactions: no interactions detected

---
**Decision:** confirm / narrow (remove pages or components) / skip-and-accept-draft

# Design

<!-- impeccable:design from duty-desk full-site shell -->

## World

**Duty desk / appointment ledger.** Cool paper work surface, graphite tool rail, deep teal primary, copper only for active/CTA. Timetable vertical rules on auth brand plane. Not Element Plus default navy chrome, not centered white auth card, not menu+card admin kits.

## Tokens

| Role | Value |
|------|--------|
| Text | `#12151a` |
| Muted | `#5a616c` |
| Border | `#d5d9e0` |
| Surface | `#f7f8fa` |
| Background | `#e8eaee` |
| Primary | `#1a4d4a` |
| Accent | `#c45c26` |
| Sidebar | `#16191f` |
| List active | `#dde8e7` |

Font: Avenir Next / Segoe UI / PingFang SC / Noto Sans SC. Radius 4px for controls.

## Patterns

Shared in `global.css`:

- `.desk-split` / `.desk-list` / `.desk-panel` — employee, service, user admin CRUD
- `.desk-panel-solo` — settings sheet
- `.desk-stack` / `.desk-section` / `.desk-table` — ops stats
- `.desk-catalog` — service intro
- `.auth-shell` — login / register
- `.page-title` / `.page-hint` / `.page-load-error`

## Surfaces

- **Login / Register:** Full-bleed split brand + form
- **Admin rail:** Custom graphite nav, copper tick
- **Board:** Ledger table; free/partial/full/off/past mapped to teal/copper/paper
- **Customer shell:** Light top bar with copper underline active (portal contrast)
- **Client book:** Text steps + chip selectors (no el-steps / el-card)

## Motion

Auth brand rules: one clip/opacity entrance (`auth-rules-in`). No scattered page transitions.

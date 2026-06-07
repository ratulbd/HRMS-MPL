# HRMS Professional Redesign — Enterprise Grade

## Problem with Current Design

The current palette uses indigo/violet/rose gradients **everywhere** — on backgrounds, borders, shadows, text, cards — creating visual noise that looks amateur. Top HRMS software (Rippling, BambooHR, Linear, Notion) use:
- **90% neutrals** (crisp white, slate grays)
- **One precise accent color** (cool blue or teal) used sparingly
- **Color only for data** (green = active, red = error, amber = warning)
- **No decorative gradients** on the main UI chrome

---

## New Design Language: "Enterprise Clean"

### Brand Reference
**Rippling + Linear + BambooHR hybrid** — structured, spacious, data-dense, deeply trustworthy.

### Color System

| Role | Color | Hex |
|------|-------|-----|
| Page background | Near-white | `#F9FAFB` |
| Surface/Card | Pure white | `#FFFFFF` |
| Sidebar bg | Dark charcoal | `#111827` |
| Primary accent | Professional blue | `#2563EB` |
| Text primary | Near black | `#111827` |
| Text secondary | Slate | `#6B7280` |
| Border | Light gray | `#E5E7EB` |
| Active/Success | Green | `#10B981` |
| Danger | Red | `#EF4444` |
| Warning | Amber | `#F59E0B` |

### Key Design Rules
1. **Dark sidebar** — anchors layout, creates professional hierarchy
2. **Pure white cards** with `1px #E5E7EB` border and `0 1px 3px rgba(0,0,0,0.08)` shadow
3. **No gradient text** on page headings (dark `#111827` instead)
4. **Blue accent used sparingly** — only on primary actions and active states
5. **Status badges** — green pill for Active, red for Inactive, amber for Pending
6. **Clean tables** — `#F9FAFB` thead, no colored borders

---

## Files to Change

### `style.css` — Full design token + component rewrite
- New `:root` tokens (white/slate/blue)
- Dark sidebar with icon colors
- Clean card + employee card styles
- Professional button system
- Status badge system
- Table styles
- Form controls
- Modal styling

### `admin/admin_style.css` — Match new tokens

### `index.html` — Remove purple gradient from dashboard h1

---

## Open Questions

> [!IMPORTANT]
> **Sidebar color preference:** Top enterprise HRMS (Rippling, Linear) use a **dark charcoal sidebar** which creates excellent contrast and premium feel. Which do you prefer?
> - **Option A: Dark sidebar** `#111827` — Rippling/Linear style — high contrast, bold, professional
> - **Option B: White sidebar** `#FFFFFF` — BambooHR style — soft, clean, minimal

> [!NOTE]
> Login page is **not touched** — you confirmed satisfaction with it.

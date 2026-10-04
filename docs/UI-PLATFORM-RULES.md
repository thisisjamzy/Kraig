# UI platform rules

These rules override any other UI instruction.

## Phone (under 768px)

- The original mobile-first Dreda UI: BASELINE header, bottom navigation, "+" button, card stacks, full-screen pages and full-screen forms. BASELINE is commit `5080974` (see docs/mobile-restore-inventory.md).
- A new feature appears on the phone as a small entry point on an existing screen plus its own full-screen page.
- Never render web-only components on the phone: Sidebar, TopBar, PropertiesGrid, DatabaseToolbar, SidePeek, MasonryGrid, Notion tables, breadcrumbs. In development `useWebOnly` (src/shared/device/useWebOnly.ts) logs an error if one mounts under 768px, and ESLint stops files in src/phone from importing them.

## Tablet and web (768px and up)

- The Notion-style UI: sidebar, top bar, title in the body, properties grid, database toolbar standard, side peeks.

## Structure

- Each screen has one shared logic hook (src/logic) used by a phone view (src/phone) and a web view (src/screens). src/routes picks one with `DeviceSplit`. Never duplicate logic.
- A change that doesn't mention the phone leaves the phone on its BASELINE presentation; the phone only gets the data changes.
- Phone UI files are frozen by app/phone-line.lock.json. After a phone change that was asked for, run `npm run phone:approve`.

## Other rules

- The four money types (income, expenses, savings, transfers) stay separate. Funding sources apply.
- Plan changes are drafts with Apply and Discard.
- Client-side architecture: runTransaction, data under users/{uid}, no Cloud Functions.
- UI copy never uses long dashes or emoji.
- A PR description states which layouts it touches ("Layouts touched: phone", "web" or "both").

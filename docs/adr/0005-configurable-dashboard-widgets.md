# 0005. Configurable dashboard built from widgets

- Status: Accepted
- Date: 2026-10-25

## Context

The user wants to choose, arrange and (where practical) resize what appears on the home dashboard, with the layout
saved per user and following them across devices. Phone and desktop need different arrangements. Drag-and-drop
editing is not required in Phase 1, but the first dashboard must not need a rewrite to become customizable.

## Decision

- Every dashboard element is a **widget**: a self-contained component plus a server-side data loader, registered in a
  code-defined **widget registry** with `type`, title, group (Banking, Budgeting, Income, Investments, Planning),
  default size, allowed sizes and a typed settings schema (e.g. which account a "balance" widget shows).
- A **layout** is data: an ordered list of widget instances `{ instanceId, type, x, y, w, h, settings }`, stored per
  user and per breakpoint (`MOBILE`, `DESKTOP`) in `DashboardLayout` as versioned JSON.
- The **default layout** is defined in code. With no saved layout the default is rendered; "restore default" deletes
  the saved row.
- The dashboard page only reads the layout and renders registered widgets in a responsive grid. Widgets never know
  where they are placed.
- Phase 1 ships the registry, a polished default layout and the grid renderer. Add/remove/reorder/resize UI and
  persistence come later (Phase 7); simple controls (add, remove, move up/down, size presets) before any
  drag-and-drop library.

## Consequences

- New widgets are additive: register a type, write a component and loader.
- Saved layouts must tolerate code changes: unknown widget types are skipped, invalid settings fall back to defaults,
  and `version` allows migrating the JSON.
- Each widget loads its own data, so loaders must be efficient and share queries where widgets overlap.

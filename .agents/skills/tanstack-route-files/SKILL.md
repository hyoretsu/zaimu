---
name: tanstack-route-files
description: "File conventions for TanStack Router file-based routes in frontend/src/routes: folder/index structure, layouts with children, and regenerating routeTree.gen.ts. Use when adding, moving or renaming route files."
---

# TanStack Router route files

Routes live in `frontend/src/routes`.

## Naming

Use folders and `index`/named files, never dot notation for multi-segment paths.

```
✅ sports/$sportKey/events/$eventId.tsx
❌ sports.$sportKey.events.$eventId.tsx
```

- A nested route is a folder with its page in `index.tsx` or a named file.
- Layout-only files that just render `<Outlet />` can be omitted; the router infers hierarchy from file names.
- When moving a file deeper, update its relative imports (`./components` → `../../components`).

## Layouts and pages

A route with children is a layout and must render `Outlet`. Be consistent: `foo/$param.tsx` is the layout, `foo/$param/index.tsx` its index page, `foo/$param/terms/index.tsx` a child. Never put page content in a route that also has children: move the parent's page content and page guard to the index route, keeping deliberate layout-wide authorization.

## After any change

Regenerate `frontend/src/routeTree.gen.ts` through the frontend build and commit it with the route change.

# Plan: Resolve Component Resolution & Complete GitHub Sync

Resolve the Docker build failure (`Could not resolve "./components/VerticalSidebar" from "src/App.tsx"`) by ensuring all source files are fully recognized and synced by AI Studio to GitHub, adding explicit extension resolution to `vite.config.ts`, and providing host verification steps for Docker Compose.

## User Review & Critical Findings

> [!IMPORTANT]
> - **Sync Root Cause**: When syncing an AI Studio applet to GitHub, baseline template files (such as `main.tsx` and untouched component files in `src/components/`) can be omitted from GitHub export commits unless they register a file mutation event inside the workspace. This causes the GitHub repository to be incomplete when pulled locally via GitHub Desktop.
> - **Resolution Strategy**: We configured `resolve.extensions` in `vite.config.ts`, fixed `@` alias path mapping in `vite.config.ts` and `tsconfig.json`, made `VerticalSidebar` import explicit with `.tsx` in `src/App.tsx`, and re-touched component files through AI Studio tool mutations so they are registered in AI Studio's GitHub sync engine.

> [!NOTE]
> **Status: Executed & Verified**:
> 1. Configured `resolve.extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json']` and aligned alias `'@'` to `'src'` in `vite.config.ts` and `tsconfig.json`.
> 2. Added explicit `.tsx` import in `src/App.tsx` for `VerticalSidebar.tsx`.
> 3. Re-touched key views (`VerticalSidebar.tsx`, `DashboardView.tsx`, `StudentsView.tsx`) to guarantee commitment to GitHub on sync.
> 4. Verified production build and Vite packaging with zero compilation errors.

---

## 1. Overview & Objectives

- **Target Issue**: Rollup / Vite failing to resolve `./components/VerticalSidebar` inside Docker (`node:22-alpine`).
- **Goal**: Guarantee that 100% of application source code exists in the GitHub repository and resolves seamlessly in the Linux container during `docker compose up --build`.

---

## 2. Technical Architecture & File Strategy

```
AI Studio Workspace
 ├── Touch & Re-author all src/ files (Ensures 100% files committed to GitHub)
 ├── vite.config.ts (Add explicit resolve.extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'])
 └── Dockerfile (Verified layer caching and paths)
```

### Proposed Changes

1. **Explicit Extension Resolution in `vite.config.ts`**:
   - Add `resolve.extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json']`.
   - Ensure aliases and extensions are strictly defined for Alpine Linux container environments.

2. **Re-register All Source Files for GitHub Sync**:
   - Re-touch all component files (`VerticalSidebar.tsx`, `DashboardView.tsx`, `StudentsView.tsx`, etc.), utilities, and context files so AI Studio marks them as updated and syncs them to GitHub on your next sync.

3. **Host Verification & Docker Build Guidance**:
   - Provide a quick terminal check command for the local machine to verify which files are present.
   - Run `docker compose build --no-cache` to ensure Docker doesn't use stale cached image layers.

4. **Compilation Verification**:
   - Run `compile_applet` and local production build to verify zero syntax or bundling errors.

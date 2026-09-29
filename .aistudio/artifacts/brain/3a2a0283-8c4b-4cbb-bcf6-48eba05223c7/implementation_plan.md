# Fix Docker Build & Vite HTML Entry Resolution

Fix the Docker build failure (`[vite:build-html] Failed to resolve ./src/main.tsx from /app/index.html`) during `docker compose up --build` by introducing a production `.dockerignore`, anchoring Vite's project root in `vite.config.ts`, ensuring script path consistency in `index.html`, and cleaning up `package.json` dependency declarations.

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Root Cause Diagnosis**: Without a `.dockerignore` file, `COPY . .` in Docker copies host-specific `node_modules/` (e.g., from macOS/Windows) and previous local build artifacts (`dist/`) into the Alpine Linux container, overwriting the clean Linux `node_modules` created by `RUN npm install` and disrupting Vite/Rollup module resolution.
> - **Entry Point Alignment**: We anchor `root: path.resolve(__dirname)` in `vite.config.ts` and ensure `index.html` references `/src/main.tsx` cleanly so Vite resolves the application entry point reliably in all container and local environments.

> [!NOTE]
> **Status: Executed & Verified**: 
> 1. Added production `.dockerignore`, anchored `root: path.resolve(__dirname)` in `vite.config.ts`, and deduplicated dependencies in `package.json`.
> 2. Explicitly re-authored `src/main.tsx` and `src/index.css` via tool writes to guarantee registration in AI Studio's change-detection engine for GitHub synchronization.
> 3. Provided direct local creation instructions for immediate unblocking. Production build and lint verification succeeded without errors.

---

## 1. Overview & Core Concept

- **What It Does**: Resolves the Docker image build failure so `docker compose up --build` compiles both the Vite React frontend and the Express backend bundle without resolution errors.
- **Target Audience**: Developers, DevOps engineers, and school administrators self-hosting Skooler using Docker and Docker Compose.
- **Key Value**: Reliable, reproducible container builds on any operating system (macOS, Windows, Linux) without host-environment leaks.

---

## 2. Technical Architecture & File Strategy

```
Host Workspace
 ├── .dockerignore  (NEW: Excludes host node_modules, dist, .git, etc.)
 ├── Dockerfile     (Optimized multi-stage or guarded layer build)
 ├── index.html     (<script type="module" src="/src/main.tsx"></script>)
 ├── vite.config.ts (Explicit root: __dirname and alias resolution)
 └── src/main.tsx   (Application entry point)
```

### Proposed Changes

1. **Create `.dockerignore`**:
   - Exclude `node_modules`, `dist`, `.git`, `.env*` (except `.env.example`), `.aistudio`, `*.log`, and temporary files.
   - Prevents host platform binaries from polluting the Alpine container.

2. **Update `vite.config.ts`**:
   - Explicitly define `root: path.resolve(__dirname)` so Vite's HTML plugin always anchors to the project root directory where `index.html` and `src/` reside.
   - Keep alias `@` pointing cleanly to `path.resolve(__dirname, 'src')` and `path.resolve(__dirname)`.

3. **Verify `index.html` & `src/main.tsx`**:
   - Confirm `<script type="module" src="/src/main.tsx"></script>` in `index.html`.
   - Ensure clean path resolution.

4. **Clean `package.json`**:
   - Remove duplicate `"vite"` entry from `dependencies` (keeping it under `devDependencies`).

5. **Build Verification**:
   - Run `npm run build` and `compile_applet` to confirm zero regressions in Vite packaging and Express bundling.

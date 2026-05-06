# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tauri 2 desktop application for physical world simulation — a cooperative objective solution system where devices execute human goals in simulated 3D environments. Rust backend handles simulation logic and state persistence; React 19 frontend provides multi-window UI with 3D visualization.

## Build & Development Commands

```bash
npm install                # Install frontend dependencies (Rust toolchain required separately)
npm run tauri:dev          # Launch full dev environment (Rust compile + frontend hot reload)
npm run tauri:build        # Production desktop app build
npm run dev                # Frontend-only dev server at 127.0.0.1:1420
npm run build              # Frontend-only production build
npm run typecheck          # TypeScript type checking (tsc --noEmit)
```

Rust backend compiles automatically via Tauri CLI. Direct cargo commands run from `src-tauri/`:
```bash
cd src-tauri && cargo build   # Build Rust backend only
cd src-tauri && cargo check   # Fast type check without linking
```

No automated test framework is configured. `tmp-playwright/` contains experimental Playwright smoke tests run directly with Node.

## Architecture

### Frontend–Backend Communication

Frontend invokes Rust commands through `src/api/invoke.ts`, which wraps Tauri's `invoke()`. When running outside Tauri (browser-only), `src/api/browserFallback.ts` provides mock implementations. The simulation API layer in `src/api/simulation.ts` exposes typed wrappers for all Tauri commands.

### State Flow

`SimulationProvider` (React Context) is the single source of truth on the frontend. On mount, it calls Rust `load_state` which reads from `app_state.toml`. User actions dispatch Tauri commands → Rust mutates state → frontend re-syncs. State mutations use pure functions in `simulationStore.ts`. Cross-window sync uses a broadcast pattern via `windowSync.ts`.

State is persisted as TOML files in the Tauri data directory (auto-save when enabled). World snapshots go to `worlds/world_<id>.toml`.

### Multi-Window System

The app uses hash-based routing (`App.tsx`) with each route rendering a different window type:
- `#/world` — Main 3D world view (React Three Fiber + Drei)
- `#/control` — Hive control panel (rules, tasks, D3 charts)
- `#/glasses` — AI glasses interface (ASR/goal input)
- `#/device/:id` — Device first-person 3D POV
- `#/create-world` — World generation
- `#/settings` — Configuration

Windows are opened via `utils/openSimulatorWindow.ts` using Tauri's multi-window API.

### Rust Simulation Core (`src-tauri/src/`)

- `lib.rs` — Tauri app setup, command registration, state initialization
- `models.rs` — Domain types: Device, Goal, Task, World, PhysicalRules, SimulationState
- `simulation.rs` — World generation, task decomposition, physics stepping, rule solving
- `storage.rs` — TOML-based persistence
- `llm.rs` — Optional LLM intent resolution (configured via `config/llm.toml`)

### Key Design Decisions

- **TypeScript types in `src/types/rust-state.ts` must mirror Rust structs in `models.rs`** — keep them in sync when modifying state shape.
- **i18n**: Chinese (`zh-CN`, default) and English (`en-US`). Translations are inline in `src/i18n/resources.ts`. Locale persisted to localStorage under `world-scale-simulator.locale`.
- **Design system**: Google Cloud Console-inspired. Tokens defined in `src/styles/tokens.ts`. See `DESIGN.md` for full spec.
- **3D assets**: `.glb`, `.usd`, `.usdz`, `.stl`, `.dae`, `.urdf` handled by custom Rspack loader in `rsbuild.config.ts`.

## LLM Integration

Optional. Configured in `config/llm.toml` (gitignored). Falls back to `OPENCLAUDECODE_API_KEY` env var. See `src-tauri/src/llm.rs`.

## Key Documentation

- `ARCHITECTURE.md` — System design and window/layer structure (Chinese)
- `DESIGN.md` — Visual design system specification
- `ProjectPRD.md` — Product requirements document (Chinese)
- `TASK.md` — Current development tasks

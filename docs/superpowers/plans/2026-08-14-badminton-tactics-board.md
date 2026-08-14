# 羽毛球战术板初始化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 初始化一个可运行的 Vite + React + TypeScript 羽毛球战术板首版。

**Architecture:** React 负责界面和交互，纯函数状态模块负责战术模型、序列化与导入校验，SVG/CSS 负责按 0–1 相对坐标绘制场地和标记。`localStorage` 只由存储适配器访问。

**Tech Stack:** Vite, React, TypeScript, Vitest, SVG, localStorage

## Global Constraints

- 纯前端，无账号、后端或实时协作。
- 坐标统一使用 0 到 1 的相对值。
- 非法导入不得覆盖当前状态。
- 桌面端优先，移动端支持查看和基础拖动。

---

### Task 1: 建立 Vite 项目与状态模型

**Files:**
- Create: `package.json`, `index.html`, `src/main.tsx`, `src/styles.css`
- Create: `src/domain/tactics.ts`, `src/domain/tactics.test.ts`
- Create: `vite.config.ts`, `tsconfig.json`

**Interfaces:**
- `createEmptyTactics(mode?: CourtMode): Tactics`
- `serializeTactics(value: Tactics): string`
- `parseTactics(input: string): Tactics`

- [ ] **Step 1: Write failing tests** for default state, JSON round-trip, and invalid input rejection in `src/domain/tactics.test.ts`.
- [ ] **Step 2: Run** `npm test -- --run src/domain/tactics.test.ts`; expect failure because the module does not exist.
- [ ] **Step 3: Implement** the typed model and minimal Vite scaffolding.
- [ ] **Step 4: Run** `npm test -- --run src/domain/tactics.test.ts`; expect all tests to pass.
- [ ] **Step 5: Run** `npm run build`; expect a production bundle.

### Task 2: 实现场地与编辑交互

**Files:**
- Create: `src/App.tsx`, `src/components/CourtBoard.tsx`, `src/components/Toolbar.tsx`
- Modify: `src/styles.css`
- Create: `src/components/CourtBoard.test.tsx`

**Interfaces:**
- `CourtBoard` receives `tactics: Tactics` and `onChange(next: Tactics): void`.
- `Toolbar` receives mode and action callbacks for new, clear, import, and export.

- [ ] **Step 1: Write failing component tests** for singles/doubles mode labels and adding a player marker.
- [ ] **Step 2: Run** `npm test -- --run src/components/CourtBoard.test.tsx`; expect failure.
- [ ] **Step 3: Implement** SVG court lines, mode switch, player/shot/landing-point rendering, pointer-based drag, and toolbar actions.
- [ ] **Step 4: Run** the focused component tests; expect pass.
- [ ] **Step 5: Run** `npm run build`; expect pass without TypeScript errors.

### Task 3: 接入浏览器存储并完成验证

**Files:**
- Create: `src/infrastructure/tacticsStorage.ts`, `src/infrastructure/tacticsStorage.test.ts`
- Modify: `src/App.tsx`, `src/styles.css`

**Interfaces:**
- `loadTactics(storage: Storage): Tactics`
- `saveTactics(storage: Storage, value: Tactics): void`

- [ ] **Step 1: Write failing tests** for missing storage fallback and save/load round-trip.
- [ ] **Step 2: Run** `npm test -- --run src/infrastructure/tacticsStorage.test.ts`; expect failure.
- [ ] **Step 3: Implement** storage adapter and connect it to React state with a guarded import file reader.
- [ ] **Step 4: Run** `npm test -- --run`; expect all tests to pass.
- [ ] **Step 5: Run** `npm run build` and `git diff --check`; expect success.
- [ ] **Step 6: Start** `npm run dev -- --host 127.0.0.1`, open the local page, and manually verify mode switching, drag, refresh persistence, export, and invalid import.


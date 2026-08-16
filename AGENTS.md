# AGENTS.md - Developer Guide for Terminal Wallet CLI

This document provides context, commands, and guidelines for AI agents and developers working on the `terminal-wallet-cli` repository.

## 1. Project Overview
**Terminal Wallet CLI** is a privacy-enhanced Command Line Interface EVM wallet.
- **Core Technology**: Railgun (Privacy), Ethers.js (EVM), Waku (P2P).
- **Platform**: Node.js (>=24).
- **Language**: TypeScript (Strict).

## 2. Development Environment
- **Package Manager**: `npm` is used in practice (`package-lock.json` present; CI runs `npm ci`). The `packageManager` field in `package.json` lists `yarn@1.22.19` but `npm` is the primary tool.
- **Node Version**: Engines field specifies `>=24`.
- **TS Config**: `tsconfig.json` targets `ESNext` with `NodeNext` module resolution.
- **Dev Shell**: Use the Nix flake (`use flake` in `.envrc`) or install Node 24+, Python 3, just, and podman manually.
- **Containerised builds**: `just` targets use `podman run … docker.io/node:24` for reproducible builds.

## 3. Build & Execution Commands

### Build
Compiles TypeScript to `dist/`.
```bash
npm run build
# Runs: rimraf dist && tsc
```

### Start
Runs the compiled application from `dist/main.js` with increased memory.
```bash
npm start
# Runs: node --max-old-space-size=8192 --no-warnings --experimental-specifier-resolution=node dist/main.js
```

### Start (self-test)
Builds and runs the CLI in self-test mode.
```bash
npm run start:selftest
```

### Lint
Checks code quality using ESLint.
```bash
npm run lint
# Runs: npx eslint src
```

### Type-check
```bash
npm run typecheck          # src only (tsc --noEmit)
npm run typecheck:test     # test project (tsc -p tsconfig.test.json --noEmit)
```

### Test
Runs the Node.js native test runner via tsx.
```bash
npm test
# Runs: node --import tsx --test --test-reporter=dot 'test/**/*.test.ts'
```

### Composite checks
```bash
npm run check              # lint + typecheck + test
npm run check:full         # check + lint:test + typecheck:test + boundary + circular
```

### Boundary check
Ensures module-layer boundaries are respected.
```bash
npm run boundary
```

### Circular dependency check
```bash
npm run circular
# Runs: madge -c src/**/*
```

### Git hooks
```bash
npm run setup:hooks        # git config core.hooksPath .githooks
```
The pre-commit hook runs `npm run check` automatically.

### Release
```bash
npm run release            # release-it
npm run ship               # node ship.mjs --clean
```

## 4. Project Structure
The source code is located in `src/`.
- **`src/main.ts`**: Entry point. Handles config overrides, process signals, and starts the main loop.
- **`src/railgun/`**: Core Railgun subsystem — engine init, wallet management, balance scanning, DB, gas estimation, Waku P2P, and transactions.
- **`src/flows/`**: High-level user workflows — send (private/public), swap, transfer, approval, fee calculation, address entry.
- **`src/tui/`**: Terminal UI built on `blessed` — screens, layout, widgets, input handling, navigation, store, OSC52 clipboard.
- **`src/core/`**: Core event bus, history map, and input processing.
- **`src/platform/`**: Platform services — logger, console output, crypto helpers, lifecycle management, error handling, drain, log-file.
- **`src/config/`**: Configuration defaults, manager, and overrides.
- **`src/models/`**: Shared TypeScript interfaces (gas, balance, token, wallet, transaction, network, Waku, 0x).
- **`src/util/`**: Utilities for formatting, BigInt helpers, concurrency.
- **`src/price/`**: Price feeds (DefiLlama, portfolio).
- **`src/diagnostic/`**: Diagnostic reports and headless input.
- **`src/abi/`**: ABI JSON definitions and index.
- **`test/`**: Tests — `unit/`, `integration/`, `component/` directories, with `_support/` for fixtures, stubs, and helpers.
- **`scripts/`**: Boundary checks, probe scripts, and palette preview utilities.
- **`build-patches/`**: Patch files applied by `patch-package`.

## 5. Code Style & Conventions

### Formatting
- **Prettier**: The project uses Prettier with `trailingComma: "all"`.
- **Indentation**: 2 spaces (standard JS/TS).

### Naming
- **Files**: kebab-case (e.g., `wallet-manager.ts`, `error-util.ts`).
- **Classes**: PascalCase (e.g., `Logger`, `WalletService`).
- **Variables/Functions**: camelCase (e.g., `initializeWalletSystems`, `tokenBalance`).
- **Interfaces**: PascalCase (often without 'I' prefix).

### Imports
- **Style**: **Relative imports only**.
  - ✅ `import { Logger } from "../util/logger";`
  - ❌ `import { Logger } from "@/util/logger";` (Path aliases are not configured).
- **Order**: External libraries first, then internal modules.

### TypeScript
- **Strictness**: `strict: true` is enabled. Handle `null`/`undefined` explicitly.
- **Any**: Avoid `any`. Define interfaces in `src/models/` or inline if specific.
- **BigInt**: The codebase relies heavily on `bigint` for financial values.
  - Use `0n` notation.
  - Use `src/util/util.ts` helpers (`readablePrecision`, `bigIntToHex`) for display/conversion.

### Error Handling
- **Global Handlers**: `process.on("unhandledRejection")` and `SIGINT` are handled in `src/main.ts` via `processSafeExit`.
- **Throwing**: Use `throw new Error("message")`.
- **Safe Exit**: When shutting down, always use `processSafeExit()` to ensure the database and engine close correctly.

### Logging
- **Class**: Use the `Logger` class from `src/platform/logger.ts`.
- **Pattern**:
  ```typescript
  import Logger from "./platform/logger";
  // Inside a class or module
  const logger = new Logger("MyModule");
  logger.log("Operation started");
  logger.error(new Error("Something went wrong"));
  ```

### Terminal UI (CLI)
- **Library**: `blessed` is used for terminal rendering.
- **Architecture**: `src/tui/` contains screens, widgets, layout, navigation, and a central store.
- **Entry**: `src/tui/entry.ts` bootstraps the TUI.

## 6. Architecture Notes

### Wallet Engine
- The app initializes a Railgun engine instance (`src/railgun/engine/`).
- It connects to Waku (`src/railgun/waku/`) for P2P networking.
- **Database**: Uses `level-js` (browser/node compatible) for storage, located in `.railgun.db/`.

### Configuration
- Defaults are in `src/config/config-defaults.ts`.
- Overrides are handled in `src/config/config-overrides.ts`, checking for version mismatches.
- Runtime overrides come from `local-config.json` (operator-specific, gitignored).

### Transactions
- Transaction building separates Private (Shield/Unshield/Transfer) and Public operations.
- Gas estimation lives in `src/railgun/gas/`.
- Transaction flows are orchestrated in `src/flows/`.

### Module Boundaries
Run `npm run boundary` (via `scripts/check-core-boundary.sh`) to enforce layering rules.

## 7. Rules & Instructions
*(Derived from strict analysis of codebase)*

1.  **Do NOT introduce new dependencies** without checking `package.json` first.
2.  **Respect the singleton pattern** used for the Engine and Wallet Manager.
3.  **Always use BigInt** for token amounts; do not use `number` to avoid precision loss.
4.  **Use `ethers` v6** (as installed) for blockchain interactions.
5.  **Clean up resources**: Ensure file handles or DB connections are closed if writing standalone scripts.
6.  **Run `npm run check`** before committing (the pre-commit hook does this automatically).

## 8. Specific File Patterns

### `src/util/util.ts`
Contains critical helpers:
- `readablePrecision(amount, decimals, precision)`: Formats BigInts for UI.
- `promiseTimeout`: Wraps promises with a timeout.
- `delay`: Async sleep.

### `src/models/`
Central location for shared interfaces. Check here before defining new types.

### `test/_support/`
Test fixtures, stubs, and shared helpers for the test suite.

---
*Generated by analysis of repository state on Aug 17, 2026.*

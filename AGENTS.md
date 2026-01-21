# AGENTS.md - Developer Guide for Terminal Wallet CLI

This document provides context, commands, and guidelines for AI agents and developers working on the `terminal-wallet-cli` repository.

## 1. Project Overview
**Terminal Wallet CLI** is a privacy-enhanced Command Line Interface EVM wallet.
- **Core Technology**: Railgun (Privacy), Ethers.js (EVM), Waku (P2P).
- **Platform**: Node.js (>=20).
- **Language**: TypeScript (Strict).

## 2. Development Environment
- **Package Manager**: `yarn` (v1.22.19) is specified in `package.json`, but `package-lock.json` implies `npm` usage. Stick to `npm` unless otherwise instructed.
- **Node Version**: Engines field specifies `>=20`.
- **TS Config**: `tsconfig.json` targets `ESNext` with `NodeNext` module resolution.

## 3. Build & execution Commands

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
# Runs: node --max-old-space-size=8192 ... dist/main.js
```

### Lint
Checks code quality using ESLint.
```bash
npm run lint
# Runs: npx eslint src
```
*Note*: `circular` dependency check is available via `npm run circular`.

### Test
**Status**: No tests are currently present in the repository (`src/` or `test/`).
- **Future Tests**: If adding tests, use `mocha` or `jest` (dev deps include `chai`).
- **Location**: Co-locate tests with source files (e.g., `filename.test.ts`) or in a `test/` directory.
- **Config**: Ensure `tsconfig.json` and `.eslintrc.json` are updated to support the chosen test framework. Currently `.eslintrc.json` ignores `src/**/*.test.ts`.

## 4. Project Structure
The source code is located in `src/`.
- **`src/main.ts`**: Entry point. Handles config overrides, process signals, and starts the main loop.
- **`src/engine/`**: Core Railgun engine initialization and management.
- **`src/wallet/`**: Wallet creation, loading, and balance scanning logic.
- **`src/transaction/`**: Logic for building and sending transactions (ZeroX, Private, Public).
- **`src/ui/`**: User Interface components using `enquirer`.
- **`src/util/`**: Utilities for logging, error handling, cryptography, and formatting.
- **`src/balance/`**: Token balance calculations and caching.
- **`src/config/`**: Configuration defaults and overrides.

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
- **Class**: Use the `Logger` class from `src/util/logger.ts`.
- **Pattern**:
  ```typescript
  import Logger from "./util/logger";
  // Inside a class or module
  const logger = new Logger("MyModule");
  logger.log("Operation started");
  logger.error(new Error("Something went wrong"));
  ```

### User Interface (CLI)
- **Library**: `enquirer` is used for prompts.
- **Pattern**: UI functions are async and often located in `src/ui/`.
- **Example**:
  ```typescript
  const { response } = await prompt<{ response: string }>({
    type: "input",
    name: "response",
    message: "Enter value:",
  });
  ```

## 6. Architecture Notes

### Wallet Engine
- The app initializes a Railgun engine instance (`src/engine/engine.ts`).
- It connects to Waku (`src/waku/connect-waku.ts`) for P2P networking.
- **Database**: Uses `level-js` (browser/node compatible) for storage, located in `.railgun.db/`.

### Configuration
- Defaults are in `src/config/config-defaults.ts`.
- Overrides are handled in `src/config/config-overrides.ts`, checking for version mismatches.

### Transactions
- Transaction building separates Private (Shield/Unshield/Transfer) and Public operations.
- `src/transaction/transaction-builder.ts` is a key orchestrator.

## 7. Rules & Instructions
*(Derived from strict analysis of codebase)*

1.  **Do NOT introduce new dependencies** without checking `package.json` first.
2.  **Respect the singleton pattern** used for the Engine and Wallet Manager.
3.  **Always use BigInt** for token amounts; do not use `number` to avoid precision loss.
4.  **Use `ethers` v6** (as installed) for blockchain interactions.
5.  **Clean up resources**: Ensure file handles or DB connections are closed if writing standalone scripts.

## 8. Specific File Patterns

### `src/util/util.ts`
Contains critical helpers:
- `readablePrecision(amount, decimals, precision)`: Formats BigInts for UI.
- `promiseTimeout`: Wraps promises with a timeout.
- `delay`: Async sleep.

### `src/models/`
Central location for shared interfaces. Check here before defining new types.

---
*Generated by analysis of repository state on Jan 21, 2026.*

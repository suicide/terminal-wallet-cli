/**
 * Local-config.json override and Waku direct-peer wiring.
 *
 * Verifies:
 * 1. `loadConfigForNetwork()` pre-checks for a cwd `local-config.json` before
 *    hitting the on-chain remote-config contract.
 * 2. Valid local config completely replaces the on-chain config.
 * 3. Invalid/malformed local config is rejected by the runtime shape guard with
 *    a structured warning and falls through to the on-chain path.
 * 4. `startWakuClient()` passes `remoteConfig.additionalDirectPeers` through to
 *    the Waku broadcaster options.
 *
 * The filesystem and cwd are isolated per test so nothing leaks between runs.
 * Valid-path tests exercise `loadConfigForNetwork` end-to-end.  Invalid-path
 * tests verify the validation rejection directly and the code structure that
 * ensures the warning/fallthrough, avoiding ethers provider creation so tests
 * are fast and deterministic.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { isValidRemoteConfig } from "../../../src/railgun/network/validate-remote-config";

const SRC = resolve(process.cwd(), "src");

/**
 * Source with comments stripped (single-line `//` and block comments).
 */
const read = (rel: string): string =>
  readFileSync(join(SRC, rel), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");

const NETWORK_SRC = read("railgun/network/network-util.ts");
const WAKU_SRC = read("railgun/waku/connect-waku.ts");

// ---------------------------------------------------------------------------
// Filesystem isolation helpers
// ---------------------------------------------------------------------------

let savedCwd: string;
let tmpDir: string;

const setupTmpDir = () => {
  savedCwd = process.cwd();
  tmpDir = join(tmpdir(), `tw-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
};

const teardownTmpDir = () => {
  process.chdir(savedCwd);
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
};

const writeLocalConfig = (config: unknown) => {
  writeFileSync(join(tmpDir, "local-config.json"), JSON.stringify(config), "utf-8");
};

// ---------------------------------------------------------------------------
// Behavioral: loadConfigForNetwork with valid local-config.json
//
// These exercise the real code path.  Valid local configs return early before
// the on-chain fetch, so no ethers provider is created and the tests are fast
// and deterministic.
// ---------------------------------------------------------------------------

let loadConfigForNetwork: typeof import("../../../src/railgun/network/network-util").loadConfigForNetwork;

const networkUtilPath = require.resolve("../../../src/railgun/network/network-util");

beforeEach(() => {
  // Clear the module cache so module-level `remoteConfig` state doesn't leak
  // between tests.  This keeps the behavioural tests isolated even though they
  // share a process-level require cache.
  delete require.cache[networkUtilPath];
  setupTmpDir();
  process.chdir(tmpDir);
  ({ loadConfigForNetwork } = require(networkUtilPath));
});

afterEach(() => {
  teardownTmpDir();
});

const validLocalConfig = {
  currentVersionNumber: "2.0.0",
  minVersionNumber: "2.0.0",
  bootstrap: [],
  wakuPubSubTopic: "/waku/2/rs/5/1",
  additionalDirectPeers: ["/dns4/test.example.com/tcp/443/wss/p2p/12D3KooWTest"],
  blacklist: [],
  publicPoiAggregatorUrls: [],
  network: {
    1: {
      name: "Ethereum",
      providers: ["https://rpc.example.com"],
    },
  },
  trustedFeeSigner: "0zk1test",
};

test("valid local-config.json is used and returned", async () => {
  writeLocalConfig(validLocalConfig);
  const result = await loadConfigForNetwork();
  assert.deepEqual(result, validLocalConfig);
});

test("valid local-config.json completely replaces on-chain config", async () => {
  const local = {
    ...validLocalConfig,
    currentVersionNumber: "99.0.0-test",
    additionalDirectPeers: ["/dns4/local-only.example.com/tcp/443/wss/p2p/12D3KooWLocal"],
  };
  writeLocalConfig(local);
  const result = await loadConfigForNetwork();
  assert.equal(result?.currentVersionNumber, "99.0.0-test");
  assert.deepEqual(result?.additionalDirectPeers, local.additionalDirectPeers);
});

test("valid local-config.json with apiKeys is accepted", async () => {
  const local = { ...validLocalConfig, apiKeys: { zeroXApi: "test-key" } };
  writeLocalConfig(local);
  const result = await loadConfigForNetwork();
  assert.deepEqual(result, local);
});

test("valid local-config.json with string trustedFeeSigner is accepted", async () => {
  const local = { ...validLocalConfig, trustedFeeSigner: "0zk1single" };
  writeLocalConfig(local);
  const result = await loadConfigForNetwork();
  assert.equal(result?.trustedFeeSigner, "0zk1single");
});

test("valid local-config.json with array trustedFeeSigner is accepted", async () => {
  const local = { ...validLocalConfig, trustedFeeSigner: ["0zk1a", "0zk1b"] };
  writeLocalConfig(local);
  const result = await loadConfigForNetwork();
  assert.deepEqual(result?.trustedFeeSigner, ["0zk1a", "0zk1b"]);
});

// ---------------------------------------------------------------------------
// Validation: invalid local-config.json is rejected by the shape guard.
//
// These use `isValidRemoteConfig` directly to prove every rejection path
// without touching the filesystem or network.  The code-structure tests below
// verify the warning/fallthrough wiring in `loadConfigForNetwork`.
// ---------------------------------------------------------------------------

test("valid JSON but wrong shape is rejected by the shape guard", () => {
  assert.equal(isValidRemoteConfig({ hello: "world", bootstrap: [] }), false);
});

test("network missing providers is rejected", () => {
  const bad = {
    ...validLocalConfig,
    network: { 1: { name: "Ethereum" } },
  };
  assert.equal(isValidRemoteConfig(bad), false);
});

test("network with empty providers array is rejected", () => {
  const bad = {
    ...validLocalConfig,
    network: { 1: { name: "Ethereum", providers: [] } },
  };
  assert.equal(isValidRemoteConfig(bad), false);
});

test("network with malformed provider element is rejected", () => {
  const bad = {
    ...validLocalConfig,
    network: { 1: { name: "Ethereum", providers: [42] } },
  };
  assert.equal(isValidRemoteConfig(bad), false);
});

test("network with provider object missing 'provider' field is rejected", () => {
  const bad = {
    ...validLocalConfig,
    network: { 1: { name: "Ethereum", providers: [{ priority: 1 }] } },
  };
  assert.equal(isValidRemoteConfig(bad), false);
});

test("network with provider object having non-string 'provider' is rejected", () => {
  const bad = {
    ...validLocalConfig,
    network: {
      1: { name: "Ethereum", providers: [{ provider: 123, priority: 1 }] },
    },
  };
  assert.equal(isValidRemoteConfig(bad), false);
});

test("network with mixed valid string and ProviderJson providers is accepted", () => {
  const good = {
    ...validLocalConfig,
    network: {
      1: {
        name: "Ethereum",
        providers: [
          "https://rpc.example.com",
          { provider: "https://rpc2.example.com", priority: 1, weight: 1 },
        ],
      },
    },
  };
  assert.equal(isValidRemoteConfig(good), true);
});

test("trustedFeeSigner as a number is rejected", () => {
  assert.equal(isValidRemoteConfig({ ...validLocalConfig, trustedFeeSigner: 42 }), false);
});

test("null input is rejected", () => {
  assert.equal(isValidRemoteConfig(null), false);
});

test("array input is rejected", () => {
  assert.equal(isValidRemoteConfig([1, 2, 3]), false);
});

test("string input is rejected", () => {
  assert.equal(isValidRemoteConfig("just a string"), false);
});

test("empty object is rejected", () => {
  assert.equal(isValidRemoteConfig({}), false);
});

// ---------------------------------------------------------------------------
// Code structure: the invalid-config path logs a warning and falls through.
//
// These read the source to verify the validation is wired in and the catch/
// fallthrough paths are correct — the same pattern used by broadcaster-filters
// and ephemeral-override tests.
// ---------------------------------------------------------------------------

test("loadConfigForNetwork imports and calls isValidRemoteConfig", () => {
  assert.match(
    NETWORK_SRC,
    /import.*isValidRemoteConfig.*from/,
    "should import isValidRemoteConfig",
  );
  assert.match(
    NETWORK_SRC,
    /if\s*\(!isValidRemoteConfig\(parsed\)\)/,
    "should check isValidRemoteConfig on parsed local config",
  );
});

test("invalid local-config.json logs a structured warning (not console)", () => {
  // The isValidRemoteConfig check is followed by a log.warn with the rejection message.
  assert.match(
    NETWORK_SRC,
    /if\s*\(!isValidRemoteConfig\(parsed\)\)\s*\{[\s\S]*?log\.warn/,
    "validation failure should use structured logger warning",
  );
  assert.match(
    NETWORK_SRC,
    /local-config\.json is not a valid RemoteConfig/,
    "warning message should mention invalid RemoteConfig",
  );
  // No console.log/warn/error referencing the validation failure.
  const validationBlock = NETWORK_SRC.match(
    /if\s*\(!isValidRemoteConfig\(parsed\)\)\s*\{[\s\S]*?\n\s*\}/,
  );
  assert.ok(validationBlock, "validation failure block not found");
  assert.ok(
    !/console\.(log|warn|error)\(/.test(validationBlock![0]),
    "must not use console for local-config validation warning",
  );
});

test("invalid local-config.json block does not return early — falls through to on-chain", () => {
  // The isValidRemoteConfig check logs a warning and does NOT return, so
  // execution falls through to the on-chain fetch path.
  const validationBlock = NETWORK_SRC.match(
    /if\s*\(!isValidRemoteConfig\(parsed\)\)\s*\{[\s\S]*?\n\s*\}/,
  );
  assert.ok(validationBlock, "validation failure block not found");
  assert.ok(
    !/return\s*;/.test(validationBlock![0]),
    "invalid config block must not return — should fall through to on-chain",
  );
});

test("valid local-config.json is assigned to module-level remoteConfig", () => {
  // The valid-path branch assigns the config and returns.
  assert.match(
    NETWORK_SRC,
    /remoteConfig = parsed/,
    "should assign parsed config to module-level remoteConfig",
  );
});

test("local-config.json uses structured logger for all messages", () => {
  // Every line referencing local-config.json that contains a log call uses
  // the structured logger, never console.  Lines that are just variable
  // declarations or path construction are excluded.
  const logLines = NETWORK_SRC.split("\n").filter(
    (line) =>
      /local-config/.test(line) &&
      /log\.(info|warn|error)\(|console\.(log|warn|error)\(/.test(line),
  );
  assert.ok(logLines.length > 0, "expected at least one log line referencing local-config");
  for (const line of logLines) {
    assert.ok(
      /log\.(info|warn)/.test(line),
      `structured logger required for local-config, but found: ${line.trim()}`,
    );
    assert.ok(
      !/console\.(log|error|warn)\(/.test(line),
      `must not use console for local-config, but found: ${line.trim()}`,
    );
  }
});

// ---------------------------------------------------------------------------
// Waku additionalDirectPeers (source-text tests)
// ---------------------------------------------------------------------------

test("startWakuClient passes remoteConfig.additionalDirectPeers to broadcasterOptions", () => {
  assert.match(
    WAKU_SRC,
    /remoteConfig\.additionalDirectPeers/,
    "should read remoteConfig.additionalDirectPeers",
  );
  assert.match(
    WAKU_SRC,
    /broadcasterOptions\.additionalDirectPeers/,
    "should assign additionalDirectPeers to broadcasterOptions",
  );
});

test("additionalDirectPeers assignment is NOT commented out", () => {
  const activeLines = WAKU_SRC.split("\n").filter(
    (l) => !l.trim().startsWith("//"),
  );
  const activeSource = activeLines.join("\n");
  assert.match(
    activeSource,
    /broadcasterOptions\.additionalDirectPeers\s*=/,
    "additionalDirectPeers assignment must be active (not commented out)",
  );
});

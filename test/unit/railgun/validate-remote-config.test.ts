/**
 * Runtime shape validation for RemoteConfig.
 *
 * Pure-function unit tests for `isValidRemoteConfig`. These exercise every
 * rejection path so a downstream caller can trust the guard without needing
 * to mock the filesystem or network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidRemoteConfig } from "../../../src/railgun/network/validate-remote-config";

/** Minimal valid RemoteConfig for reuse. */
const validConfig = () => ({
  currentVersionNumber: "2.0.0",
  minVersionNumber: "2.0.0",
  bootstrap: [],
  wakuPubSubTopic: "/waku/2/rs/5/1",
  additionalDirectPeers: [],
  blacklist: [],
  publicPoiAggregatorUrls: [],
  network: {
    1: {
      name: "Ethereum",
      providers: ["https://rpc.example.com"],
    },
  },
  trustedFeeSigner: "0zk1example",
});

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

test("rejects null", () => {
  assert.equal(isValidRemoteConfig(null), false);
});

test("rejects undefined", () => {
  assert.equal(isValidRemoteConfig(undefined), false);
});

test("rejects a string", () => {
  assert.equal(isValidRemoteConfig("{}"), false);
});

test("rejects an array", () => {
  assert.equal(isValidRemoteConfig([]), false);
});

// ---------------------------------------------------------------------------
// Missing required top-level fields
// ---------------------------------------------------------------------------

test("rejects an empty object", () => {
  assert.equal(isValidRemoteConfig({}), false);
});

test("rejects when currentVersionNumber is missing", () => {
  const { currentVersionNumber: _, ...rest } = validConfig();
  assert.equal(isValidRemoteConfig(rest), false);
});

test("rejects when minVersionNumber is missing", () => {
  const { minVersionNumber: _, ...rest } = validConfig();
  assert.equal(isValidRemoteConfig(rest), false);
});

test("rejects when bootstrap is missing", () => {
  const { bootstrap: _, ...rest } = validConfig();
  assert.equal(isValidRemoteConfig(rest), false);
});

test("rejects when wakuPubSubTopic is missing", () => {
  const { wakuPubSubTopic: _, ...rest } = validConfig();
  assert.equal(isValidRemoteConfig(rest), false);
});

test("rejects when additionalDirectPeers is missing", () => {
  const { additionalDirectPeers: _, ...rest } = validConfig();
  assert.equal(isValidRemoteConfig(rest), false);
});

test("rejects when blacklist is missing", () => {
  const { blacklist: _, ...rest } = validConfig();
  assert.equal(isValidRemoteConfig(rest), false);
});

test("rejects when publicPoiAggregatorUrls is missing", () => {
  const { publicPoiAggregatorUrls: _, ...rest } = validConfig();
  assert.equal(isValidRemoteConfig(rest), false);
});

test("rejects when network is missing", () => {
  const { network: _, ...rest } = validConfig();
  assert.equal(isValidRemoteConfig(rest), false);
});

test("rejects when trustedFeeSigner is missing", () => {
  const { trustedFeeSigner: _, ...rest } = validConfig();
  assert.equal(isValidRemoteConfig(rest), false);
});

// ---------------------------------------------------------------------------
// Wrong types for required fields
// ---------------------------------------------------------------------------

test("rejects currentVersionNumber that is not a string", () => {
  assert.equal(isValidRemoteConfig({ ...validConfig(), currentVersionNumber: 123 }), false);
});

test("rejects currentVersionNumber that is empty", () => {
  assert.equal(isValidRemoteConfig({ ...validConfig(), currentVersionNumber: "" }), false);
});

test("rejects bootstrap that is not an array", () => {
  assert.equal(isValidRemoteConfig({ ...validConfig(), bootstrap: "not-array" }), false);
});

test("rejects bootstrap with non-string items", () => {
  assert.equal(isValidRemoteConfig({ ...validConfig(), bootstrap: [1, 2] }), false);
});

test("rejects additionalDirectPeers that is not an array", () => {
  assert.equal(isValidRemoteConfig({ ...validConfig(), additionalDirectPeers: 42 }), false);
});

test("rejects blacklist that is not an array", () => {
  assert.equal(isValidRemoteConfig({ ...validConfig(), blacklist: null }), false);
});

test("rejects wakuPubSubTopic that is not a string", () => {
  assert.equal(isValidRemoteConfig({ ...validConfig(), wakuPubSubTopic: [] }), false);
});

test("rejects publicPoiAggregatorUrls that is not an array", () => {
  assert.equal(isValidRemoteConfig({ ...validConfig(), publicPoiAggregatorUrls: {} }), false);
});

// ---------------------------------------------------------------------------
// network field
// ---------------------------------------------------------------------------

test("rejects network that is null", () => {
  assert.equal(isValidRemoteConfig({ ...validConfig(), network: null }), false);
});

test("rejects network that is an array", () => {
  assert.equal(isValidRemoteConfig({ ...validConfig(), network: [] }), false);
});

test("rejects network that is empty", () => {
  assert.equal(isValidRemoteConfig({ ...validConfig(), network: {} }), false);
});

test("rejects network entry that is not an object", () => {
  assert.equal(
    isValidRemoteConfig({
      ...validConfig(),
      network: { 1: "not-object" },
    }),
    false,
  );
});

test("rejects network entry with missing name", () => {
  assert.equal(
    isValidRemoteConfig({
      ...validConfig(),
      network: { 1: { providers: ["https://rpc.example.com"] } },
    }),
    false,
  );
});

test("rejects network entry with missing providers", () => {
  assert.equal(
    isValidRemoteConfig({
      ...validConfig(),
      network: { 1: { name: "Ethereum" } },
    }),
    false,
  );
});

// ---------------------------------------------------------------------------
// trustedFeeSigner: string | string[]
// ---------------------------------------------------------------------------

test("accepts trustedFeeSigner as a string", () => {
  const cfg = { ...validConfig(), trustedFeeSigner: "0zk1example" };
  assert.equal(isValidRemoteConfig(cfg), true);
});

test("accepts trustedFeeSigner as a string array", () => {
  const cfg = { ...validConfig(), trustedFeeSigner: ["0zk1a", "0zk1b"] };
  assert.equal(isValidRemoteConfig(cfg), true);
});

test("rejects trustedFeeSigner as a number", () => {
  assert.equal(isValidRemoteConfig({ ...validConfig(), trustedFeeSigner: 42 }), false);
});

test("rejects trustedFeeSigner as array with non-strings", () => {
  assert.equal(
    isValidRemoteConfig({ ...validConfig(), trustedFeeSigner: [1, 2] }),
    false,
  );
});

// ---------------------------------------------------------------------------
// apiKeys (optional)
// ---------------------------------------------------------------------------

test("accepts config without apiKeys", () => {
  assert.equal(isValidRemoteConfig(validConfig()), true);
});

test("accepts config with valid apiKeys object", () => {
  const cfg = { ...validConfig(), apiKeys: { zeroXApi: "key" } };
  assert.equal(isValidRemoteConfig(cfg), true);
});

test("rejects apiKeys that is an array", () => {
  const cfg = { ...validConfig(), apiKeys: [] };
  assert.equal(isValidRemoteConfig(cfg), false);
});

test("rejects apiKeys that is null", () => {
  const cfg = { ...validConfig(), apiKeys: null };
  assert.equal(isValidRemoteConfig(cfg), false);
});

// ---------------------------------------------------------------------------
// Valid happy paths
// ---------------------------------------------------------------------------

test("accepts a complete valid config", () => {
  const cfg = validConfig();
  assert.equal(isValidRemoteConfig(cfg), true);
});

test("accepts a complete valid config with apiKeys", () => {
  const cfg = {
    ...validConfig(),
    apiKeys: { zeroXApi: "test-key" },
    trustedFeeSigner: ["0zk1a", "0zk1b"],
    additionalDirectPeers: ["/dns4/peer.example.com/tcp/443/wss/p2p/12D3KooWTest"],
  };
  assert.equal(isValidRemoteConfig(cfg), true);
});

// ---------------------------------------------------------------------------
// Realistic local-config.json.example shape
// ---------------------------------------------------------------------------

test("accepts the example config shape from local-config.json.example", () => {
  const example = {
    currentVersionNumber: "2.0.0",
    minVersionNumber: "2.0.0",
    blacklist: [],
    bootstrap: [],
    publicPoiAggregatorUrls: ["https://ppoi.fdi.network"],
    apiKeys: { zeroXApi: "YOUR_ZERO_X_API_KEY_HERE" },
    wakuPubSubTopic: "/waku/2/rs/5/1",
    additionalDirectPeers: [
      "/dns4/relay-a.rootedinprivacy.com/tcp/8000/wss/p2p/16Uiu2HAmMkCL9Y4R6V8eyTfHRfPA9JUBSnsJXwiUvgUJHU7N9AsR",
    ],
    trustedFeeSigner: ["0zk1qyzgh9ctuxm6d06gmax39xutjgraw"],
    network: {
      1: {
        name: "Ethereum",
        flags: {
          canSendPublic: true,
          canSendShielded: true,
          canShield: true,
          canUnshield: true,
          canSwapPublic: true,
          canSwapShielded: true,
          canRelayAdapt: true,
        },
        providers: ["https://ethereum-rpc.publicnode.com"],
      },
    },
  };
  assert.equal(isValidRemoteConfig(example), true);
});

/**
 * Circuit artifact provisioning by individual file CID.
 *
 * Pins the pure pieces: variant detection, the exact SDK cache layout for both
 * POI and transfer circuits, the brotli+hash gate, and the fail-closed
 * behaviour when a file is missing or a zkey cannot be parsed. The fetch path
 * is exercised only with an empty gateway list, which must fail closed; no
 * network is used.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { brotliCompressSync } from "node:zlib";
import { createHash } from "node:crypto";
import {
  POI_BUNDLE_CID,
  artifactCacheDir,
  artifactPaths,
  decodeAndVerify,
  ensureCircuitArtifacts,
  exportVkeyFromZkey,
  isKnownVariant,
  type CircuitArtifactStore,
} from "../../../src/railgun/engine/circuit-artifact-source";

const makeStore = (initial: Record<string, string | Buffer> = {}) => {
  const files = new Map<string, string | Uint8Array>(Object.entries(initial));
  const store: CircuitArtifactStore = {
    get: async (path) => files.get(path) ?? null,
    exists: async (path) => files.has(path),
    store: async (_dir, path, item) => {
      files.set(path, item);
    },
  };
  return { files, store };
};

test("isKnownVariant matches transfer and POI circuits only", () => {
  assert.equal(isKnownVariant("02x02"), true);
  assert.equal(isKnownVariant("01x01"), true);
  assert.equal(isKnownVariant("POI_3x3"), true);
  assert.equal(isKnownVariant("POI_13x13"), true);
  assert.equal(isKnownVariant("POI_8x2"), false);
  assert.equal(isKnownVariant("99x99"), false);
});

test("artifactCacheDir uses the POI bundle only for POI circuits", () => {
  assert.equal(artifactCacheDir("02x02"), "artifacts-v2.1/02x02");
  assert.equal(
    artifactCacheDir("POI_3x3"),
    `artifacts-v2.1/${POI_BUNDLE_CID}/POI_3x3`,
  );
});

test("artifactPaths matches the SDK cache layout", () => {
  const transfer = artifactPaths("02x02");
  assert.equal(transfer.zkey, "artifacts-v2.1/02x02/zkey");
  assert.equal(transfer.wasm, "artifacts-v2.1/02x02/wasm");
  assert.equal(transfer.vkey, "artifacts-v2.1/02x02/vkey.json");

  const poi = artifactPaths("POI_13x13");
  const dir = `artifacts-v2.1/${POI_BUNDLE_CID}/POI_13x13`;
  assert.equal(poi.dir, dir);
  assert.equal(poi.vkey, `${dir}/vkey.json`);
  assert.equal(poi.zkey, `${dir}/zkey`);
  assert.equal(poi.wasm, `${dir}/wasm`);
});

test("decodeAndVerify accepts brotli bytes whose hash matches", () => {
  const data = Buffer.from("synthetic proving circuit bytes");
  const compressed = new Uint8Array(brotliCompressSync(data));
  const sha = createHash("sha256").update(data).digest("hex");
  assert.deepEqual(Buffer.from(decodeAndVerify(compressed, sha)), data);
});

test("decodeAndVerify rejects a hash mismatch", () => {
  const compressed = new Uint8Array(brotliCompressSync(Buffer.from("data")));
  assert.throws(() => decodeAndVerify(compressed, "0".repeat(64)), /hash mismatch/);
});

test("decodeAndVerify rejects a non-brotli body (gateway error page)", () => {
  assert.throws(() =>
    decodeAndVerify(new Uint8Array(Buffer.from("<html>502</html>")), "0".repeat(64)),
  );
});

test("ensureCircuitArtifacts returns false for an unknown variant", async () => {
  const { store } = makeStore();
  assert.equal(await ensureCircuitArtifacts("99x99", store, []), false);
});

test("ensureCircuitArtifacts fails closed when a file is missing and no gateway works", async () => {
  const { store } = makeStore();
  assert.equal(await ensureCircuitArtifacts("POI_13x13", store, []), false);
});

test("ensureCircuitArtifacts fails closed when the cached POI zkey cannot be parsed", async () => {
  const paths = artifactPaths("POI_3x3");
  const { store } = makeStore({
    [paths.zkey]: Buffer.from("not a real zkey"),
    [paths.wasm]: Buffer.from("w"),
  });
  assert.equal(await ensureCircuitArtifacts("POI_3x3", store, []), false);
});

test("ensureCircuitArtifacts fails closed when the cached transfer zkey cannot be parsed", async () => {
  const paths = artifactPaths("02x02");
  const { store } = makeStore({
    [paths.zkey]: Buffer.from("not a real zkey"),
    [paths.wasm]: Buffer.from("w"),
  });
  assert.equal(await ensureCircuitArtifacts("02x02", store, []), false);
});

test("exportVkeyFromZkey rejects non-zkey bytes", async () => {
  await assert.rejects(() => exportVkeyFromZkey(new Uint8Array(Buffer.from("nope"))));
});

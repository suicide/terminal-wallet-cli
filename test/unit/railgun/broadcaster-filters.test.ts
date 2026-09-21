/**
 * Which broadcasters the wallet is allowed to see.
 *
 * The SDK's filter is `!allowlist || allowlist.includes(address)`. That makes
 * the allow list a very sharp instrument with two failure modes on either side
 * of it: `undefined` admits every broadcaster on the network, and an empty
 * ARRAY admits none, because `[]` is truthy and `[].includes(x)` is false.
 *
 * The policy is that the allow list stays `undefined` — no address restriction.
 * Admission is decided by the SDK's trusted-fee-signer mechanism instead:
 * `broadcasterOptions.trustedFeeSigner` sets the authorized fee each trusted
 * signer publishes, and any other broadcaster is admitted only while its quote
 * stays within the SDK's variance band of that authorized fee. Setting the
 * allow list to the signer addresses would leave only those signers reachable
 * and make the variance band unreachable, hiding every in-range broadcaster
 * from a different signer.
 *
 * The blocklist remains local and user-controlled, and may only subtract.
 *
 * These read the source, because reaching the real filter means starting a
 * libp2p mesh.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const SRC = resolve(process.cwd(), "src");

/**
 * Source with comments stripped.
 *
 * These assertions are about what the code DOES, and the comments here quote
 * the calls being asserted against — so reading the raw file would match prose
 * describing a rule rather than the code implementing it.
 */
const read = (rel: string): string =>
  readFileSync(join(SRC, rel), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");

const TRUSTED_SIGNER = "0zk1qyzgh9ctuxm6d06gmax39xutjgraw";
const IN_RANGE_BROADCASTER = "0zk1qykotherbroadcasteraddress00";

/** The SDK's rule, reproduced so the consequence is demonstrated, not asserted. */
const sdkFilter = (
  addresses: string[],
  allowlist: string[] | string | undefined,
  blocklist: string[] | undefined,
): string[] =>
  addresses
    .filter((a) => !allowlist || allowlist.includes(a))
    .filter((a) => !blocklist || !blocklist.includes(a));

test("an undefined allow list admits the whole network", () => {
  // The desired behavior now: who is reachable is decided by the SDK's
  // trusted-fee-signer variance band, not by an address allow list.
  const seen = [TRUSTED_SIGNER, IN_RANGE_BROADCASTER];
  assert.deepEqual(sdkFilter(seen, undefined, undefined), seen);
});

test("CONTROL: an empty-array allow list admits nobody", () => {
  // The fail-CLOSED side, and the reason `[]` is never a safe seed value: it
  // is truthy, so it is a restriction to the empty set rather than the absence
  // of a restriction.
  const seen = [TRUSTED_SIGNER, IN_RANGE_BROADCASTER];
  assert.deepEqual(sdkFilter(seen, [], undefined), []);
});

test("CONTROL: an allow list of signers would hide every other broadcaster", () => {
  // What the app used to do, shown so the reason for dropping it is explicit:
  // an in-range broadcaster from a different signer disappears before the SDK
  // variance check ever runs.
  const seen = [TRUSTED_SIGNER, IN_RANGE_BROADCASTER];
  assert.deepEqual(sdkFilter(seen, [TRUSTED_SIGNER], undefined), [TRUSTED_SIGNER]);
});

test("boot leaves the allow list unset and only sets the blocklist", () => {
  const source = read("railgun/waku/connect-waku.ts");
  assert.match(
    source,
    /initializeLists\(blocked\)/,
    "boot no longer passes just the blocklist",
  );
  assert.ok(
    !/initializeLists\(signers/.test(source),
    "boot still restricts broadcasters to the trusted fee signers",
  );
  assert.match(
    source,
    /setAddressFilters\(undefined, baseBlockList\)/,
    "the allow list is not left undefined at boot",
  );
});

test("fee-signature trust is still enforced, through the option that means it", () => {
  // The SDK's variance band is the admission gate now. It needs the trusted
  // signers to establish the authorized fee baseline.
  const source = read("railgun/waku/connect-waku.ts");
  assert.match(
    source,
    /broadcasterOptions\.trustedFeeSigner = remoteConfig\.trustedFeeSigner/,
  );
});

test("a config value declared string-or-array is normalized before it is used", () => {
  // `includes` on an array is a membership test; on a string it is a substring
  // test. Same method name, different question. Used for the blocklist and the
  // signer count in the boot log.
  const source = read("railgun/waku/connect-waku.ts");
  assert.match(source, /Array\.isArray\(value\) \? value : \[value\]/);
});

test("blocking a broadcaster never reopens an allow list", () => {
  // Blocking must only subtract. If a filter mutation passed an allow list, it
  // would silently restrict every lookup to that list — the exact narrowing
  // this policy removed.
  const source = read("railgun/waku/broadcaster-util.ts");
  const calls = source.match(/setAddressFilters\([^)]*\)/g) ?? [];
  assert.ok(calls.length > 0, "expected at least one filter mutation");
  for (const call of calls) {
    assert.match(
      call,
      /setAddressFilters\(undefined,\s*currentBlockList\)/,
      `${call} does not leave the allow list unset`,
    );
  }
  assert.ok(
    !/currentAllowList/.test(source),
    "the blocklist util still carries allow-list state",
  );
});

test("CONTROL: the filter mutator does not seed itself with an empty array", () => {
  // Seeded with `[]`, blocking one broadcaster before any mutation set the
  // blocklist to the empty set — harmless here, but ambiguous with the SDK's
  // fail-closed allow-list semantics.
  const source = read("railgun/waku/broadcaster-util.ts");
  assert.ok(
    !/let currentBlockList[^=]*=\s*\[\]/.test(source),
    "the block list is seeded with []",
  );
});

test("CONTROL: pushing to a filter does not mutate the base list in place", () => {
  // `currentBlockList = baseBlockList` followed by `.push()` edits the module's
  // base list, so resetting the filters restores the mutated list rather than
  // the configured one.
  const source = read("railgun/waku/broadcaster-util.ts");
  assert.ok(
    !/currentBlockList = baseBlockList;\s*\n\s*\}/.test(source),
    "the block list aliases the base list before being pushed to",
  );
  assert.match(source, /startFrom\(baseBlockList\)/);
});

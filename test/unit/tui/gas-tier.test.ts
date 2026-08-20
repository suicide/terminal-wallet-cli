/**
 * Hand-entered gas tiers.
 *
 * The presets come from the network and are trustworthy; a custom entry is
 * whatever was typed. Each of these three failures is silent if it is not
 * caught here — a zero max fee produces a transaction that can never be mined,
 * and a priority above the max is rejected outright by most nodes, in both
 * cases after the user has waited for a proof.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUnits } from "ethers";
import { parseCustomTier, feeDataForTier, TIER_LABELS } from "../../../src/tui/screens/gas-tier";

test("a valid pair parses to wei", () => {
  const result = parseCustomTier("30", "1.5");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.maxFeePerGas, parseUnits("30", "gwei"));
  assert.equal(result.maxPriorityFeePerGas, parseUnits("1.5", "gwei"));
});

test("a zero max fee is refused", () => {
  const result = parseCustomTier("0", "0");
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.message : "", /greater than zero/);
});

test("a priority above the max fee is refused", () => {
  const result = parseCustomTier("10", "20");
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.message : "", /cannot exceed max fee/);
});

test("a priority equal to the max fee is allowed", () => {
  // Legal, and occasionally what someone means when they want it mined now.
  assert.equal(parseCustomTier("10", "10").ok, true);
});

test("a non-numeric entry is refused rather than coerced", () => {
  const result = parseCustomTier("fast", "1");
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.message : "", /Invalid gwei/);
});

test("a blank entry is a cancel, not an error", () => {
  assert.deepEqual(parseCustomTier(undefined, "1"), {
    ok: false,
    message: "Cancelled.",
  });
  assert.deepEqual(parseCustomTier("10", ""), { ok: false, message: "Cancelled." });
});

test("gasPrice tracks maxFeePerGas so legacy paths honour the chosen tier", () => {
  // A broadcaster submission becomes Type-1, which reads gasPrice and ignores
  // the 1559 fields. Without this the tier would be silently discarded.
  const fee = feeDataForTier(parseUnits("30", "gwei"), parseUnits("2", "gwei"));
  assert.equal(fee.gasPrice, parseUnits("30", "gwei"));
  assert.equal(fee.maxFeePerGas, parseUnits("30", "gwei"));
  assert.equal(fee.maxPriorityFeePerGas, parseUnits("2", "gwei"));
});

// --- six-tier label coverage ---

test("TIER_LABELS covers every GasTierKey with a human-readable label", () => {
  // Import the real labels map from the gas-tier screen and verify every tier
  // key has a non-empty label.  If GasTierKey gains a new key and the labels
  // map is not extended, TypeScript will error — this test makes the contract
  // explicit at runtime as well.
  const keys: Array<keyof typeof TIER_LABELS> = [
    "slowest",
    "slower",
    "slow",
    "average",
    "fast",
    "network",
  ];
  for (const key of keys) {
    assert.ok(TIER_LABELS[key], `missing label for tier "${key}"`);
    assert.ok(
      TIER_LABELS[key].length > 0,
      `empty label for tier "${key}"`,
    );
  }
  // The percentile labels include the archived percentile so the user knows
  // what each tier means.
  assert.match(TIER_LABELS.slowest, /20%/);
  assert.match(TIER_LABELS.slower, /40%/);
  assert.match(TIER_LABELS.slow, /60%/);
  assert.match(TIER_LABELS.average, /80%/);
  assert.match(TIER_LABELS.fast, /95%/);
  // The network tier uses eth_gasPrice.
  assert.match(TIER_LABELS.network, /gasPrice/);
});

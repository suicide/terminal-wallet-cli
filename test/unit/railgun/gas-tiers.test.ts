/**
 * Which priority-fee percentiles the five tiers come from.
 *
 * Tips in a block are steeply skewed and effectively bimodal: most pay almost
 * nothing, and a large cohort pays whatever their wallet defaults to — 2 gwei,
 * overwhelmingly.  The five percentiles [20, 40, 60, 80, 95] archive the
 * original develop setting, sampling the full range from budget to premium.
 *
 * Each tier is the raw median: no universal floor is applied.  When all
 * sampled blocks report zero for a percentile the median is 0n, which is a
 * valid on-chain tip on many L2s.  The user can fall back to the "Network"
 * option (eth_gasPrice) if a non-zero tip is preferred.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUnits } from "ethers";
import {
  REWARD_PERCENTILES,
  maxFeeFor,
  tiersFromRewards,
} from "../../../src/railgun/gas/gas-fee";

const gwei = (v: string) => parseUnits(v, "gwei");

/**
 * One row per block, one column per requested percentile. Shaped like a real
 * distribution: the low percentiles are near zero, p80 picks up the wallet
 * defaults cohort, and p95 lands on the ~2 gwei default.
 * Columns are [p20, p40, p60, p80, p95] under the current settings.
 */
const rewards = (): bigint[][] =>
  Array.from({ length: 40 }, () => [
    gwei("0.0005"),
    gwei("0.001"),
    gwei("0.05"),
    gwei("0.6"),
    gwei("2.0"),
  ]);

test("the five reward percentiles are [20, 40, 60, 80, 95]", () => {
  assert.deepEqual(REWARD_PERCENTILES, [20, 40, 60, 80, 95]);
});

test("five tiers come out of the measured distribution as raw medians", () => {
  const { slowest, slower, slow, average, fast } = tiersFromRewards(rewards());
  // No floor — raw medians from the fixture.
  assert.equal(slowest, gwei("0.0005"), "p20 median");
  assert.equal(slower, gwei("0.001"), "p40 median");
  assert.equal(slow, gwei("0.05"), "p60 median");
  assert.equal(average, gwei("0.6"), "p80 median — wallet defaults cohort");
  assert.equal(fast, gwei("2.0"), "p95 — the fixed 2 gwei default");
});

test("the five tiers are ordered and non-decreasing", () => {
  const { slowest, slower, slow, average, fast } = tiersFromRewards(rewards());
  assert.ok(slowest <= slower, "slowest is not cheaper than slower");
  assert.ok(slower <= slow, "slower is not cheaper than slow");
  assert.ok(slow <= average, "slow is not cheaper than average");
  assert.ok(average <= fast, "average is not cheaper than fast");
});

test("raw medians — no floor collapses any tier", () => {
  // All percentiles below the median produce 0n medians; the raw result is
  // 0n rather than being clamped to a floor.
  const quiet = Array.from({ length: 40 }, () => [
    gwei("0.0001"),
    gwei("0.001"),
    gwei("0.002"),
    gwei("0.003"),
    gwei("0.3"),
  ]);
  const { slowest, slower, slow, average, fast } = tiersFromRewards(quiet);
  // Raw medians — no MIN_PRIORITY_FEE floor.
  assert.equal(slowest, gwei("0.0001"));
  assert.equal(slower, gwei("0.001"));
  assert.equal(slow, gwei("0.002"));
  assert.equal(average, gwei("0.003"));
  assert.equal(fast, gwei("0.3"));
  assert.ok(
    slowest <= slower && slower <= slow && slow <= average && average <= fast,
    "ordering must hold without a floor",
  );
});

test("all-zero blocks produce all-zero tiers", () => {
  // When every sampled block reports no tip, the median is 0n.  This is a
  // valid on-chain tip on many L2s; the user can fall back to "Network".
  const quiet = Array.from({ length: 40 }, () => [0n, 0n, 0n, 0n, 0n]);
  const { slowest, slower, slow, average, fast } = tiersFromRewards(quiet);
  assert.equal(slowest, 0n);
  assert.equal(slower, 0n);
  assert.equal(slow, 0n);
  assert.equal(average, 0n);
  assert.equal(fast, 0n);
});

test("the median across blocks, not the mean", () => {
  // A few spike blocks drag a mean far above the fee a normal transaction
  // needs, which is the failure mode this smoothing exists to avoid.
  const blocks = [
    ...Array.from({ length: 39 }, () => [
      gwei("0.01"),
      gwei("0.015"),
      gwei("0.02"),
      gwei("0.025"),
      gwei("0.03"),
    ]),
    [gwei("500"), gwei("500"), gwei("500"), gwei("500"), gwei("500")], // one MEV block
  ];
  const { fast } = tiersFromRewards(blocks);
  assert.equal(fast, gwei("0.03"), "a single spike block moved the tier");
});

// --- the ceiling ------------------------------------------------------------

test("the max fee leaves room for the base fee to rise", () => {
  // Set to exactly tip + base it covers only the base fee at the moment it was
  // read. A proof takes long enough for that to stop being true, and the
  // broadcaster rejects what no longer covers the current base fee.
  const base = gwei("0.088");
  const tip = gwei("0.02");
  const ceiling = maxFeeFor(tip, base);
  assert.ok(ceiling > tip + base, "no headroom at all");
  assert.equal(ceiling, tip + base * 3n);
});

/** Base fee after n consecutive FULL blocks, which is the 12.5%/block cap. */
const afterFullBlocks = (base: bigint, blocks: number): bigint => {
  let risen = base;
  for (let block = 0; block < blocks; block += 1) risen = (risen * 1125n) / 1000n;
  return risen;
};

test("headroom outlasts a slow 7702 proof", () => {
  // The regression this replaces. A cross-contract relay-adapt proof regularly
  // runs past 89 seconds, which is all the old 2x bought once the broadcaster's
  // 1.2x gas-limit padding is taken into account — so the ceiling went
  // underwater while proving and the send was refused after the user had paid
  // to generate the proof.
  //
  // 10 blocks is ~120s at 12s blocks.
  const base = gwei("0.088");
  const tip = gwei("0.02");
  const covered = (maxFeeFor(tip, base) * 12n) / 10n; // the broadcaster's padding
  const risen = afterFullBlocks(base, 10);
  assert.ok(
    covered > risen,
    `ceiling ${covered} does not cover a base fee of ${risen} ten full blocks later`,
  );
});

test("CONTROL: 2x headroom would not have survived that", () => {
  // Shown rather than described: the same ten blocks against the old constant.
  const base = gwei("0.088");
  const tip = gwei("0.02");
  const oldCeiling = ((tip + base * 2n) * 12n) / 10n;
  assert.ok(
    oldCeiling < afterFullBlocks(base, 10),
    "the old headroom already covered ten full blocks, so it was not the cause",
  );
});

test("headroom is bounded — it is not a blank cheque", () => {
  // The fee scales linearly with this, so a runaway multiplier is a permanent
  // premium paid on every relayed send.
  const base = gwei("1");
  const ceiling = maxFeeFor(0n, base);
  assert.ok(ceiling <= base * 4n, "headroom grew past 4x; the fee scales with it");
});

test("the ceiling is not a price", () => {
  // What a self-signed transaction actually pays is base + tip, whatever the
  // ceiling is — the headroom costs nothing there. It is not free for a
  // broadcaster send, whose fee scales with the ceiling, which is why the
  // multiplier is deliberate rather than generous.
  const base = gwei("0.088");
  const tip = gwei("0.02");
  const paid = base + tip;
  assert.ok(maxFeeFor(tip, base) > paid);
  // Still far below what the old p80 default cost: 0.765 tip on a 0.057 base.
  assert.ok(maxFeeFor(tip, base) < gwei("0.822"));
});

test("p95 samples the wallet-default cohort, not the fast market", () => {
  // p95 lands on the 2 gwei default almost regardless of conditions — a fixed
  // price wearing a percentile's clothes.  This is expected; the "Network"
  // option gives users an alternative that reflects the node's own gas price.
  const { fast } = tiersFromRewards(rewards());
  assert.equal(fast, gwei("2.0"), "p95 is the wallet default, not a market signal");
});

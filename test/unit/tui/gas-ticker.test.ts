/**
 * The header's gas ticker.
 *
 * It rounded anything at or above a gwei to a whole number, which on a chain
 * sitting at 14 gwei printed "14 / 14 / 14" — three prices that differ, shown
 * as one, in the one place the deck reports them. The tiers ARE the fractions
 * at ordinary gas prices, so rounding them away leaves a live-updating widget
 * that says nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUnits } from "ethers";
import { gasTicker } from "../../../src/tui/format/deck";
import { CustomGasEstimate } from "../../../src/models/gas-models";

const gwei = (n: string) => parseUnits(n, "gwei");

const estimate = (
  base: string,
  slowest: string,
  slower: string,
  slow: string,
  average: string,
  fast: string,
): CustomGasEstimate =>
  ({
    baseFeePerGas: gwei(base),
    slowest: gwei(slowest),
    slower: gwei(slower),
    slow: gwei(slow),
    average: gwei(average),
    fast: gwei(fast),
    gasPrice: 0n,
    maxFeePerGas: 0n,
    maxPriorityFeePerGas: 0n,
  }) as CustomGasEstimate;

test("tiers that differ by less than a gwei still read as different", () => {
  // The reported case: rounding turned a working ticker into three equal
  // numbers.  All five tiers carry distinct non-zero tips.
  const ticker = gasTicker(estimate("14", "0.01", "0.1", "0.15", "0.45", "0.9"));
  assert.equal(ticker, "14.01 / 14.10 / 14.15 / 14.45 / 14.90 gwei");
});

test("the base fee is included, since that is what a transaction pays", () => {
  assert.equal(
    gasTicker(estimate("20", "0.3", "0.5", "1", "2", "3")),
    "20.30 / 20.50 / 21.00 / 22.00 / 23.00 gwei",
  );
});

test("a busy chain stays on one line", () => {
  // Three-digit gas with two decimals each would run the stat card over, and
  // at 120 gwei the second decimal is not a number anyone acts on.
  assert.equal(
    gasTicker(estimate("120", "1", "3", "5", "10", "20")),
    "121.0 / 123.0 / 125.0 / 130.0 / 140.0 gwei",
  );
});

test("sub-gwei keeps the precision that is the whole figure", () => {
  // An L2 at 0.001 gwei base fee — every tier is sub-gwei and each must keep
  // enough digits to be distinguishable.  All five tips are non-zero.
  const ticker = gasTicker(estimate("0.001", "0.001", "0.002", "0.003", "0.004", "0.006"));
  assert.match(ticker, /0\.002 \/ 0\.003 \/ 0\.004 \/ 0\.005 \/ 0\.007 gwei/);
});

test("a zero estimate does not print a decimal fringe", () => {
  assert.equal(
    gasTicker(estimate("0", "0", "0", "0", "0", "0")),
    "0 / 0 / 0 / 0 / 0 gwei",
  );
});

test("slowest and slower are not silently swallowed when nonzero", () => {
  // Regression: the helper used to hard-code slowest/slower to zero, masking
  // formatting bugs in those tiers.
  const ticker = gasTicker(estimate("10", "0.2", "0.5", "1", "2", "4"));
  // slowest (0.2 + 10 = 10.20) must differ from slower (0.5 + 10 = 10.50).
  assert.ok(ticker.startsWith("10.20 / 10.50 / 11.00 / 12.00 / 14.00"), ticker);
});

// --- narrow-terminal sanity ------------------------------------------------

test("ticker fits in a 26-column card for the zero case", () => {
  // The gas card is Math.floor(width / shown.length) columns, with 2 columns
  // of padding.  At 104 columns with 4 cards that is 26 columns (24 content).
  // The zero case is the only one tight enough to fit.
  const zero = gasTicker(estimate("0", "0", "0", "0", "0", "0"));
  assert.ok(zero.length <= 26, `zero ticker too wide: ${zero.length}`);
});

test("sub-gwei five-tier ticker overflows a narrow card but stays under 45 chars", () => {
  // Five tiers with sub-gwei precision produce 42 chars.  A 26-column card
  // clips the tail — blessed truncates gracefully, showing the cheaper tiers
  // the user most likely chose.  The 45-char ceiling bounds the line so it
  // never wraps inside the card.
  const sub = gasTicker(estimate("0.001", "0.001", "0.002", "0.003", "0.004", "0.006"));
  assert.ok(sub.length > 26, "expected overflow at narrow widths");
  assert.ok(sub.length <= 45, `ticker grew past 45 chars: ${sub.length}`);
});

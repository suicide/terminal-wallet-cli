/**
 * The header's gas ticker.
 *
 * Six tiers: five from fee-history percentiles plus a "Network" option sourced
 * from eth_gasPrice.  The five percentile tiers show the effective gas price
 * (priority + base fee).  The Network tier shows gasPrice directly — it is
 * already the total the node quotes — so sub-gwei precision is preserved
 * rather than rounded away.
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
  network: string,
): CustomGasEstimate =>
  ({
    baseFeePerGas: gwei(base),
    slowest: gwei(slowest),
    slower: gwei(slower),
    slow: gwei(slow),
    average: gwei(average),
    fast: gwei(fast),
    gasPrice: gwei(network),
    maxFeePerGas: 0n,
    maxPriorityFeePerGas: 0n,
  }) as CustomGasEstimate;

test("six tiers that differ by less than a gwei still read as different", () => {
  // All six tiers carry distinct non-zero tips.
  const ticker = gasTicker(estimate("14", "0.01", "0.1", "0.15", "0.45", "0.9", "0.8"));
  // Percentile tiers: priority + baseFee. Network: gasPrice directly.
  assert.equal(ticker, "14.01 / 14.10 / 14.15 / 14.45 / 14.90 / 0.8 gwei");
});

test("the base fee is included for percentile tiers, network shows gasPrice", () => {
  assert.equal(
    gasTicker(estimate("20", "0.3", "0.5", "1", "2", "3", "1.5")),
    "20.30 / 20.50 / 21.00 / 22.00 / 23.00 / 1.50 gwei",
  );
});

test("a busy chain stays on one line", () => {
  // Three-digit gas with two decimals each would run the stat card over, and
  // at 120 gwei the second decimal is not a number anyone acts on.
  assert.equal(
    gasTicker(estimate("120", "1", "3", "5", "10", "20", "8")),
    "121.0 / 123.0 / 125.0 / 130.0 / 140.0 / 8.00 gwei",
  );
});

test("sub-gwei keeps the precision that is the whole figure", () => {
  // An L2 at 0.001 gwei base fee — every tier is sub-gwei and each must keep
  // enough digits to be distinguishable.  All six tips are non-zero.
  const ticker = gasTicker(
    estimate("0.001", "0.001", "0.002", "0.003", "0.004", "0.006", "0.005"),
  );
  // Network = gasPrice directly = 0.005.
  assert.match(ticker, /0\.002 \/ 0\.003 \/ 0\.004 \/ 0\.005 \/ 0\.007 \/ 0\.005 gwei/);
});

test("a zero estimate does not print a decimal fringe", () => {
  assert.equal(
    gasTicker(estimate("0", "0", "0", "0", "0", "0", "0")),
    "0 / 0 / 0 / 0 / 0 / 0 gwei",
  );
});

test("slowest and slower are not silently swallowed when nonzero", () => {
  // Regression: the helper used to hard-code slowest/slower to zero, masking
  // formatting bugs in those tiers.
  const ticker = gasTicker(estimate("10", "0.2", "0.5", "1", "2", "4", "3"));
  // slowest (0.2 + 10 = 10.20) must differ from slower (0.5 + 10 = 10.50).
  // network = gasPrice = 3.00.
  assert.ok(ticker.startsWith("10.20 / 10.50 / 11.00 / 12.00 / 14.00 / 3.00"), ticker);
});

test("ticker contains exactly six slash-separated tiers", () => {
  const ticker = gasTicker(estimate("14", "0.01", "0.1", "0.15", "0.45", "0.9", "0.8"));
  const parts = ticker.split(" / ");
  // 5 slashes → 6 tiers, last part ends with " gwei"
  assert.equal(parts.length, 6, `expected 6 tiers, got ${parts.length}`);
  assert.ok(parts[5].endsWith(" gwei"), "last tier must end with ' gwei'");
});

test("network tier reflects raw gasPrice, not priority + baseFee", () => {
  // The network tier shows gasPrice directly (the total the node quotes),
  // while the percentile tiers show priority + baseFee.
  const ticker = gasTicker(estimate("10", "0.2", "0.5", "1", "2", "4", "3"));
  // network = gasPrice = 3 gwei → "3.00"
  assert.ok(ticker.includes("3.00"), `network tier missing: ${ticker}`);
  // Must NOT be 13.00 (= old behavior of gasPrice + baseFee).
  assert.ok(!ticker.includes("13.00"), `old network+baseFee double-counted: ${ticker}`);
});

// --- narrow-terminal sanity ------------------------------------------------

test("ticker fits in a 30-column card for the zero case", () => {
  // The gas card is Math.floor(width / shown.length) columns, with 2 columns
  // of padding.  At 104 columns with 4 cards that is 26 columns (24 content).
  // Six tiers with the zero case: "0 / 0 / 0 / 0 / 0 / 0 gwei" = 25 chars.
  const zero = gasTicker(estimate("0", "0", "0", "0", "0", "0", "0"));
  assert.ok(zero.length <= 30, `zero ticker too wide: ${zero.length}`);
});

test("sub-gwei six-tier ticker stays under 55 chars", () => {
  // Six tiers with sub-gwei precision produce a longer line.  The 55-char
  // ceiling bounds the line so it never wraps inside the card.
  const sub = gasTicker(
    estimate("0.001", "0.001", "0.002", "0.003", "0.004", "0.006", "0.005"),
  );
  assert.ok(sub.length > 30, "expected overflow at narrow widths");
  assert.ok(sub.length <= 55, `ticker grew past 55 chars: ${sub.length}`);
});

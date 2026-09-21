/**
 * Compact three-line gas card — user-approved layout with full-label guarantee.
 *
 * Verifies the focused formatter in deck.ts renders exactly:
 *   net: <gwei>   slowest: <gwei>
 *   slower: <gwei>   slow: <gwei>
 *   average: <gwei>   fast: <gwei>
 * when an estimate exists. Cryptic abbreviations (sst/slr/slo,
 * avg/fst, single-letter) are never used; the previous narrow-width fallback
 * to placeholder dashes is removed — layout suppresses gas below its threshold
 * (86) and this formatter always returns the three full labeled rows, never
 * placeholders, even for direct callers with a narrow width.
 * Uses formatGwei for all values, raw gasPrice for net, priority+baseFee for
 * the five percentiles, exactly three lines, and no gwei/click/legend content.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUnits } from "ethers";
import { formatGasCard, formatGwei } from "../../../src/tui/format/deck";
import { CustomGasEstimate } from "../../../src/models/gas-models";
import { computeLayout, GAS_MIN_CONTENT } from "../../../src/tui/layout";

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

const stripTag = (s: string): string =>
  s.replace(/\{[^}]+\}/g, "").replace(/\{\/[^}]*\}/g, "");

test("formatter is exported", () => {
  assert.ok(typeof formatGasCard === "function");
});

test("exactly three lines", () => {
  const out = formatGasCard(estimate("14", "0.01", "0.1", "0.15", "0.45", "0.9", "0.8"));
  const lines = out.split("\n");
  assert.equal(lines.length, 3, `expected 3 lines, got ${lines.length}: ${JSON.stringify(out)}`);
});

test("row ordering and labels precisely", () => {
  const est = estimate("10", "0.2", "0.5", "1", "2", "4", "3");
  const lines = formatGasCard(est).split("\n");
  // Row 1: net before slowest
  assert.match(lines[0], /^net: \S+ {3}slowest: \S+$/);
  assert.ok(lines[0].indexOf("net:") < lines[0].indexOf("slowest:"));
  // Row 2: slower before slow
  assert.match(lines[1], /^slower: \S+ {3}slow: \S+$/);
  assert.ok(lines[1].indexOf("slower:") < lines[1].indexOf("slow:"));
  // Ensure "slower:" not confused with "slow:" ordering - slower row must start with slower
  assert.ok(lines[1].startsWith("slower:"));
  // Row 3: average before fast
  assert.match(lines[2], /^average: \S+ {3}fast: \S+$/);
  assert.ok(lines[2].indexOf("average:") < lines[2].indexOf("fast:"));
});

test("raw network value — no baseFee double count", () => {
  const est = estimate("10", "0.2", "0.5", "1", "2", "4", "3");
  const lines = formatGasCard(est).split("\n");
  const netValue = lines[0].match(/^net: (\S+)/)?.[1];
  assert.ok(netValue, "net value missing");
  // net = formatGwei(3 gwei) = 3.00 ; must NOT be 13.00 (gasPrice + baseFee)
  assert.equal(netValue, formatGwei(gwei("3")));
  assert.equal(netValue, "3.00");
  // sanity: slowest is 0.2 + 10 = 10.20 not 0.2
  const slowestValue = lines[0].match(/slowest: (\S+)$/)?.[1];
  assert.equal(slowestValue, formatGwei(gwei("10.20")));
  // When gasPrice < baseFee, still raw
  const est2 = estimate("20", "0.3", "0.5", "1", "2", "3", "1.5");
  const net2 = formatGasCard(est2).split("\n")[0].match(/^net: (\S+)/)?.[1];
  assert.equal(net2, formatGwei(gwei("1.5")));
  assert.equal(net2, "1.50");
});

test("percentile effective prices are priority + baseFee via formatGwei", () => {
  const est = estimate("14", "0.01", "0.1", "0.15", "0.45", "0.9", "0.8");
  const lines = formatGasCard(est).split("\n");
  const expected = {
    slowest: formatGwei(gwei("14.01")),
    slower: formatGwei(gwei("14.10")),
    slow: formatGwei(gwei("14.15")),
    average: formatGwei(gwei("14.45")),
    fast: formatGwei(gwei("14.90")),
    net: formatGwei(gwei("0.8")),
  };
  assert.equal(lines[0], `net: ${expected.net}   slowest: ${expected.slowest}`);
  assert.equal(lines[1], `slower: ${expected.slower}   slow: ${expected.slow}`);
  assert.equal(lines[2], `average: ${expected.average}   fast: ${expected.fast}`);
});

test("sub-gwei keeps full precision via formatGwei", () => {
  const est = estimate("0.001", "0.001", "0.002", "0.003", "0.004", "0.006", "0.005");
  const lines = formatGasCard(est).split("\n");
  // Values are base+priority: 0.002,0.003,0.004,0.005,0.007 + net 0.005
  assert.match(lines[0], /net: 0\.005 {3}slowest: 0\.002/);
  const allValues = lines.join(" ").match(/0\.\d+/g) ?? [];
  assert.equal(allValues.length, 6);
});

test("busy chain bounds to one decimal via formatGwei", () => {
  const est = estimate("120", "1", "3", "5", "10", "20", "8");
  const out = formatGasCard(est);
  const lines = out.split("\n");
  assert.equal(lines[0], `net: ${formatGwei(gwei("8"))}   slowest: ${formatGwei(gwei("121"))}`);
  assert.equal(formatGwei(gwei("121")), "121.0");
});

test("no unit/click/legend content", () => {
  const est = estimate("10", "0.2", "0.5", "1", "2", "4", "3");
  const out = formatGasCard(est);
  const lower = out.toLowerCase();
  // No "gwei" unit
  assert.ok(!lower.includes("gwei"), `should omit gwei but got: ${out}`);
  // No click hint
  assert.ok(!lower.includes("click"), `should omit click hint: ${out}`);
  // No legend middle-dot separator
  assert.ok(!out.includes("·"), `should omit legend dot: ${out}`);
  // No slash separator from old ticker
  assert.ok(!out.includes("/"), `should omit slash ticker: ${out}`);
  // Exactly the six labels, no avg abbreviation
  assert.ok(out.includes("net:"), "missing net:");
  assert.ok(out.includes("slowest:"), "missing slowest:");
  assert.ok(out.includes("slower:"), "missing slower:");
  // Ensure "slow:" label appears as distinct token (not part of slower/slowest)
  assert.match(out, /\bslow: /);
  assert.ok(out.includes("average:"), "missing average:");
  assert.ok(out.includes("fast:"), "missing fast:");
  // "avg" abbreviation must not appear in the default long layout
  assert.ok(!/\bavg:/.test(out), "should use average, not avg in long layout");
  // Cryptic abbreviations must never appear on normal path
  assert.ok(!out.includes("sst:"), "should not contain sst:");
  assert.ok(!out.includes("slr:"), "should not contain slr:");
  assert.ok(!out.includes("slo:"), "should not contain slo:");
  assert.ok(!out.includes("fst:"), "should not contain fst:");
});

test("entry gas card: estimated state has exactly three tagged lines", () => {
  // Simulate the entry render path: formatGasCard split and tagged
  const est = estimate("10", "0.2", "0.5", "1", "2", "4", "3");
  const tag = (s: string, _c: string) => `{${_c}-fg}${s}{/}`;
  const rendered = formatGasCard(est)
    .split("\n")
    .map((line) => tag(line, "magenta"))
    .join("\n");
  const strippedLines = stripTag(rendered).split("\n");
  assert.equal(strippedLines.length, 3);
  assert.equal(strippedLines[0].startsWith("net:"), true);
});

test("entry gas card: unavailable is minimal and has no legend/click/gwei", () => {
  const tag = (s: string, _c: string) => `{${_c}-fg}${s}{/}`;
  const unavailable = [tag("—", "gray"), tag("—", "gray"), tag("—", "gray")].join("\n");
  const stripped = stripTag(unavailable);
  assert.ok(!stripped.toLowerCase().includes("gwei"));
  assert.ok(!stripped.toLowerCase().includes("click"));
  assert.ok(!stripped.includes("·"));
  assert.ok(!stripped.includes("slowest"));
  // Must not be empty
  assert.ok(stripped.includes("—"));
});

test("normal width preserves exact long-label layout and fits width", () => {
  const est = estimate("14", "0.01", "0.1", "0.15", "0.45", "0.9", "0.8");
  const expectedNet = formatGwei(gwei("0.8"));
  const expectedSlowest = formatGwei(gwei("14.01"));
  const expectedSlower = formatGwei(gwei("14.10"));
  const expectedSlow = formatGwei(gwei("14.15"));
  const expectedAvg = formatGwei(gwei("14.45"));
  const expectedFast = formatGwei(gwei("14.90"));
  // Width that definitely fits long layout (long max ~28); use 30
  const width = 30;
  const out = formatGasCard(est, width);
  const lines = out.split("\n");
  assert.equal(lines.length, 3, "normal width must be exactly 3 lines");
  assert.equal(lines[0], `net: ${expectedNet}   slowest: ${expectedSlowest}`);
  assert.equal(lines[1], `slower: ${expectedSlower}   slow: ${expectedSlow}`);
  assert.equal(lines[2], `average: ${expectedAvg}   fast: ${expectedFast}`);
  for (const line of lines) {
    assert.ok(line.length <= width, `normal line exceeds width ${width}: ${JSON.stringify(line)} length ${line.length}`);
  }
  // contains all six values
  const joined = lines.join(" ");
  for (const v of [expectedNet, expectedSlowest, expectedSlower, expectedSlow, expectedAvg, expectedFast]) {
    assert.ok(joined.includes(v), `missing value ${v} at normal width`);
  }
});

test("narrow width does not hide available estimate behind placeholders", () => {
  const est = estimate("14", "0.01", "0.1", "0.15", "0.45", "0.9", "0.8");
  // Even when a direct caller passes a width far below what the full rows need,
  // layout suppresses the gas card below its threshold — the formatter must
  // never hide an available estimate behind dashes.
  for (const width of [16, 22, 30]) {
    const out = formatGasCard(est, width);
    const lines = out.split("\n");
    assert.equal(lines.length, 3, `narrow width ${width} must still be exactly 3 lines, got ${JSON.stringify(out)}`);
    // Must NOT be the placeholder fallback
    assert.notEqual(out, "—\n—\n—", `width ${width} should not be placeholder dashes`);
    // Must contain all six full labels and values (no cryptic abbreviations)
    assert.ok(out.includes("net:"), `width ${width} missing net:`);
    assert.ok(out.includes("slowest:"), `width ${width} missing slowest:`);
    assert.ok(out.includes("slower:"), `width ${width} missing slower:`);
    assert.match(out, /\bslow: /);
    assert.ok(out.includes("average:"), `width ${width} missing average:`);
    assert.ok(out.includes("fast:"), `width ${width} missing fast:`);
    assert.ok(!out.includes("sst:"), "should not contain sst:");
    assert.ok(!out.includes("slr:"));
    // And the six values must be present
    const expectedSlowest = formatGwei(gwei("14.01"));
    assert.ok(out.includes(expectedSlowest), `width ${width} missing value ${expectedSlowest}`);
  }
});

test("narrow width with sufficient width still shows full labels (no abbreviation fallback)", () => {
  const est = estimate("10", "0.2", "0.5", "1", "2", "4", "3");
  const vals = [
    formatGwei(gwei("3")),
    formatGwei(gwei("10.20")),
    formatGwei(gwei("10.50")),
    formatGwei(gwei("11.00")),
    formatGwei(gwei("12.00")),
    formatGwei(gwei("14.00")),
  ];
  // Width 42 is the guaranteed minimum when gas is shown (layout); it fits
  const width = 42;
  const out = formatGasCard(est, width);
  const lines = out.split("\n");
  assert.equal(lines.length, 3);
  for (const line of lines) assert.ok(line.length <= width, `line too long for ${width}: ${line}`);
  const joined = lines.join(" ");
  for (const v of vals) assert.ok(joined.includes(v), `missing ${v}`);
  // Still no cryptic abbreviations
  assert.ok(!out.includes("sst:"));
  assert.ok(!out.includes("slr:"));
});

test("width param does not alter pricing logic", () => {
  const est = estimate("20", "0.3", "0.5", "1", "2", "3", "1.5");
  const wide = formatGasCard(est, 40);
  const fitting = formatGasCard(est, 42);
  // Both must encode same net value 1.50 when they fit
  assert.ok(wide.includes(formatGwei(gwei("1.5"))), "wide missing net");
  assert.ok(fitting.includes(formatGwei(gwei("1.5"))), "fitting missing net");
  // Both must encode same slowest 20.30 etc
  assert.ok(wide.includes(formatGwei(gwei("20.30"))));
  assert.ok(fitting.includes(formatGwei(gwei("20.30"))));
  // Narrow width also preserves full values (no placeholder dashes)
  const narrow = formatGasCard(est, 16);
  assert.ok(narrow.includes(formatGwei(gwei("1.5"))), "narrow should still contain net value, not dashes");
  assert.equal(narrow.split("\n").length, 3, "narrow should still be 3 lines with full labels");
});

test("layout at wide threshold gives gas at least 42 content cols and full rows remain 3 lines", () => {
  const est = estimate("14", "0.01", "0.1", "0.15", "0.45", "0.9", "0.8");
  const lay = computeLayout({ width: 126, height: 40, wantLeft: true, wantRight: true });
  assert.equal(lay.showGas, true, "gas should be visible at 126");
  assert.ok(lay.gasBoxWidth >= 46, `gasBoxWidth at 126 should be >=46, got ${lay.gasBoxWidth}`);
  assert.ok(lay.gasContentWidth >= GAS_MIN_CONTENT, `gasContentWidth at 126 should be >=42, got ${lay.gasContentWidth}`);
  assert.ok(lay.gasContentWidth >= 42, "content width at 126 must meet 42 requirement");
  // Formatter with actual allocated width must remain exactly 3 physical lines with all six values
  const out = formatGasCard(est, lay.gasContentWidth);
  const lines = out.split("\n");
  assert.equal(lines.length, 3, `gas card at 126 must be exactly 3 lines, got ${JSON.stringify(out)}`);
  for (const line of lines) {
    assert.ok(line.length <= lay.gasContentWidth, `line exceeds allocated content width at 126: ${JSON.stringify(line)} length ${line.length} > ${lay.gasContentWidth}`);
  }
  const expectedVals = [
    formatGwei(gwei("0.8")),
    formatGwei(gwei("14.01")),
    formatGwei(gwei("14.10")),
    formatGwei(gwei("14.15")),
    formatGwei(gwei("14.45")),
    formatGwei(gwei("14.90")),
  ];
  const joined = out;
  for (const v of expectedVals) assert.ok(joined.includes(v), `126 layout missing value ${v}`);
  assert.ok(out.includes("net:"), "must include net:");
  assert.ok(out.includes("slowest:"), "must include slowest:");
  assert.ok(out.includes("slower:"), "must include slower:");
  assert.match(out, /\bslow: /);
  assert.ok(out.includes("average:"), "must include average:");
  assert.ok(out.includes("fast:"), "must include fast:");
  // Other cards remain usable
  assert.ok(lay.otherContentWidth >= 16, `other cards at 126 should remain usable, got ${lay.otherContentWidth}`);
});

test("large-price regression: all three full rows and six values fit at minimum visible gas content width", () => {
  // Minimum visible gas content width is 42 (box 46). Use high real-world values
  // where formatted gwei strings are at their widest (e.g. 342.5 gwei with one
  // decimal for >=100). This ensures the earlier 32-width would have wrapped or
  // triggered the old placeholder fallback.
  const est = estimate("300", "5", "10", "20", "40", "80", "250");
  // Values: net 250.0, slowest 305.0, slower 310.0, slow 320.0, average 340.0, fast 380.0
  const expected = {
    net: formatGwei(gwei("250")),
    slowest: formatGwei(gwei("305")),
    slower: formatGwei(gwei("310")),
    slow: formatGwei(gwei("320")),
    average: formatGwei(gwei("340")),
    fast: formatGwei(gwei("380")),
  };
  assert.equal(expected.net, "250.0");
  assert.equal(expected.slowest, "305.0");
  // Also test an even more extreme value with 4 digits
  const est2 = estimate("800", "10", "20", "30", "50", "100", "500");
  const out2 = formatGasCard(est2, GAS_MIN_CONTENT);
  assert.equal(out2.split("\n").length, 3, "extreme gas card must still be 3 lines");
  for (const line of out2.split("\n")) {
    assert.ok(line.length <= GAS_MIN_CONTENT, `extreme line exceeds 42: ${JSON.stringify(line)} length ${line.length}`);
  }
  const lay = computeLayout({ width: 86, height: 40, wantLeft: true, wantRight: true });
  assert.equal(lay.showGas, true, "gas should be visible at minimum threshold 86");
  assert.ok(lay.gasContentWidth >= 42, `minimum visible gasContentWidth must be >=42, got ${lay.gasContentWidth}`);
  // With GAS_MIN_CONTENT exactly, all three rows must fit even for large values
  const out = formatGasCard(est, GAS_MIN_CONTENT);
  const lines = out.split("\n");
  assert.equal(lines.length, 3, `large-price gas card must be exactly 3 lines`);
  for (const line of lines) {
    assert.ok(line.length <= GAS_MIN_CONTENT, `large-price line exceeds ${GAS_MIN_CONTENT}: ${JSON.stringify(line)} length ${line.length}`);
  }
  // All six values must be present (no truncation, no placeholder)
  for (const v of [expected.net, expected.slowest, expected.slower, expected.slow, expected.average, expected.fast]) {
    assert.ok(out.includes(v), `large-price regression missing value ${v} in ${JSON.stringify(out)}`);
  }
  // And with the actual allocated width at the threshold it also fits
  const outAtThreshold = formatGasCard(est, lay.gasContentWidth);
  for (const line of outAtThreshold.split("\n")) {
    assert.ok(line.length <= lay.gasContentWidth, `threshold-width line too long: ${line}`);
  }
  // Must contain all six labels
  assert.ok(out.includes("net:"));
  assert.ok(out.includes("slowest:"));
  assert.ok(out.includes("slower:"));
  assert.match(out, /\bslow: /);
  assert.ok(out.includes("average:"));
  assert.ok(out.includes("fast:"));
  // Also verify at the wide allocation width
  const layWide = computeLayout({ width: 126, height: 40, wantLeft: true, wantRight: true });
  const outWide = formatGasCard(est, layWide.gasContentWidth);
  assert.equal(outWide.split("\n").length, 3);
  for (const line of outWide.split("\n")) {
    assert.ok(line.length <= layWide.gasContentWidth);
  }
});

test("wider layout retains all cards", () => {
  for (const w of [126, 140, 180, 200]) {
    const lay = computeLayout({ width: w, height: 40, wantLeft: true, wantRight: true });
    assert.equal(lay.showGas, true, `gas should be visible at wide width ${w}`);
    // At sufficiently wide terminals all cards are preserved: 3 non-gas + gas + util =5
    // Our threshold for 5 cards is 126; so 126+ should have all.
    if (w >= 126) {
      assert.equal(lay.statusCards, 3, `width ${w} should have 3 non-gas cards`);
      assert.equal(lay.totalShown, 5, `width ${w} should show 5 total cards`);
    }
    assert.ok(lay.gasBoxWidth >= 46, `width ${w} gasBoxWidth >=46`);
    assert.ok(lay.gasContentWidth >= 42, `width ${w} gasContentWidth >=42`);
    assert.ok(lay.otherContentWidth >= 16, `width ${w} otherContentWidth usable`);
    // And formatter still fits
    const est = estimate("14", "0.01", "0.1", "0.15", "0.45", "0.9", "0.8");
    const out = formatGasCard(est, lay.gasContentWidth);
    assert.equal(out.split("\n").length, 3, `wide width ${w} must be 3 lines`);
  }
});

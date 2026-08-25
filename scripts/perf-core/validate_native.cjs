"use strict";

/**
 * Validation gate 1 of section 5 of `local/optimize-whisper.md`.
 *
 * The native whisper oracle runs each workload and must retire the exact
 * instruction count that the generator calculates. A mistake in an encoding
 * would otherwise show as a free speedup in the browser figures.
 *
 * The oracle is `crates/riscv-rs/SweRV-ISS-1/opt/whisper`. The differential
 * harness (`crates/riscv-rs/tests/differential_harness.rs`) builds it with:
 *
 *   make -f GNUmakefile.wdc BOOST_DIR=<repo>/crates/riscv-rs/vendor opt
 *
 * Usage:
 *   node scripts/perf-core/validate_native.cjs
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const HERE = __dirname;
const REPO = path.resolve(HERE, "..", "..");
const ORACLE = path.join(
  REPO,
  "crates",
  "riscv-rs",
  "SweRV-ISS-1",
  "opt",
  "whisper",
);
const WORKLOAD_DIR = path.join(HERE, "workloads");

const RETIRED_LINE = /Retired\s+(\d+)\s+instructions?\s+in\s+([\d.]+)s\s+(\d+)\s+inst\/s/;

function main() {
  if (!fs.existsSync(ORACLE)) {
    console.error(`The native oracle is not at ${ORACLE}.`);
    console.error(
      "Build it with: make -f GNUmakefile.wdc " +
        "BOOST_DIR=<repo>/crates/riscv-rs/vendor opt",
    );
    process.exit(1);
  }

  const manifest = JSON.parse(
    fs.readFileSync(path.join(WORKLOAD_DIR, "manifest.json"), "utf8"),
  );

  let failures = 0;
  for (const isa of ["acdfimsu", "acdfim"]) {
    for (const w of manifest.workloads) {
      const res = spawnSync(
        ORACLE,
        [
          "--newlib",
          path.join(WORKLOAD_DIR, w.file),
          "--isa",
          isa,
          "--setreg",
          "sp=0x10000",
        ],
        { encoding: "utf8", maxBuffer: 1 << 24 },
      );
      // `reportInstsPerSec` writes the figure to stderr.
      const text = (res.stdout || "") + (res.stderr || "");
      const m = RETIRED_LINE.exec(text);
      if (!m) {
        console.error(`${isa} ${w.name}: no 'Retired ... inst/s' line`);
        failures++;
        continue;
      }
      const retired = Number(m[1]);
      const ok = retired === w.instructions;
      if (!ok) failures++;
      console.log(
        `${ok ? "PASS" : "FAIL"}  --isa ${isa.padEnd(9)} ${w.name.padEnd(7)} ` +
          `retired ${retired} (expected ${w.instructions})  ` +
          `${(Number(m[3]) / 1e6).toFixed(1)} MIPS native`,
      );
    }
  }

  if (failures) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll native retired counts are exact.");
}

main();

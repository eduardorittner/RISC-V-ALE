# step-6-trim — startup and footprint

Commit: `4ed613d`  Repetitions: 9

Median of the repetitions, milliseconds.

| Configuration | To the first instruction | ... the module | ... the core startup | To the exit | Reservation |
| --- | --- | --- | --- | --- | --- |
| Rust (the control) | 6.3 | 1.9 | 2.4 | 6.5 | 1.8 MB |
| C++ --isa acdfim | 47.4 | 7.1 | 39.3 | 154.6 | 160.0 MB |
| C++ as the application starts it | 47.3 | 7.7 | 38.5 | 154.7 | 160.0 MB |
| C++ with a 16 MB guest memory (not the application) | 31.6 | 7.3 | 23.1 | 137.1 | 160.0 MB |

Module size.

| File | Raw | Gzip |
| --- | --- | --- |
| `whisper.js` | 79734 (78 KB) | 21 KB |
| `whisper.wasm` | 2393197 (2337 KB) | 591 KB |
| `riscv_rs.js` | 21889 (21 KB) | 4 KB |
| `riscv_rs_bg.wasm` | 132561 (129 KB) | 52 KB |

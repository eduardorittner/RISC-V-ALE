# step-5-memory — startup and footprint

Commit: `4ed613d`  Repetitions: 9

Median of the repetitions, milliseconds.

| Configuration | To the first instruction | ... the module | ... the core startup | To the exit | Reservation |
| --- | --- | --- | --- | --- | --- |
| Rust (the control) | 6.6 | 1.9 | 2.3 | 6.8 | 1.8 MB |
| C++ --isa acdfim | 50.1 | 9.1 | 39.8 | 157.7 | 160.0 MB |
| C++ as the application starts it | 47.1 | 8.7 | 37.3 | 153.5 | 160.0 MB |
| C++ with a 16 MB guest memory (not the application) | 34.0 | 9.3 | 23.5 | 139.9 | 160.0 MB |

Module size.

| File | Raw | Gzip |
| --- | --- | --- |
| `whisper.js` | 96479 (94 KB) | 26 KB |
| `whisper.wasm` | 4095232 (3999 KB) | 920 KB |
| `riscv_rs.js` | 21889 (21 KB) | 4 KB |
| `riscv_rs_bg.wasm` | 132561 (129 KB) | 52 KB |

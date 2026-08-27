# nofill-startup — startup and footprint

Commit: `9a8eff7`  Repetitions: 15

Median of the repetitions, milliseconds.

| Configuration | To the first instruction | ... the module | ... the core startup | To the exit | Reservation |
| --- | --- | --- | --- | --- | --- |
| Rust (the control) | 3.9 | 1.2 | 1.5 | 4.0 | 1.8 MB |
| C++ --isa acdfim | 14.8 | 3.9 | 10.3 | 15.9 | 160.0 MB |
| C++ as the application starts it | 14.8 | 4.0 | 10.2 | 15.9 | 160.0 MB |
| C++ with a 16 MB guest memory (not the application) | 14.8 | 4.0 | 10.2 | 16.0 | 160.0 MB |

Module size.

| File | Raw | Gzip |
| --- | --- | --- |
| `whisper.js` | 70194 (69 KB) | 19 KB |
| `whisper.wasm` | 956198 (934 KB) | 303 KB |
| `riscv_rs.js` | 21889 (21 KB) | 4 KB |
| `riscv_rs_bg.wasm` | 132561 (129 KB) | 52 KB |

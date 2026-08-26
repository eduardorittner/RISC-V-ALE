# step-8-no-asyncify — startup and footprint

Commit: `4ee1c2c`  Repetitions: 9

Median of the repetitions, milliseconds.

| Configuration | To the first instruction | ... the module | ... the core startup | To the exit | Reservation |
| --- | --- | --- | --- | --- | --- |
| Rust (the control) | 4.7 | 1.4 | 1.7 | 4.9 | 1.8 MB |
| C++ --isa acdfim | 33.5 | 4.8 | 28.4 | 34.8 | 160.0 MB |
| C++ as the application starts it | 34.4 | 4.6 | 28.6 | 35.6 | 160.0 MB |
| C++ with a 16 MB guest memory (not the application) | 19.2 | 4.7 | 13.8 | 20.5 | 160.0 MB |

Module size.

| File | Raw | Gzip |
| --- | --- | --- |
| `whisper.js` | 70791 (69 KB) | 19 KB |
| `whisper.wasm` | 956545 (934 KB) | 303 KB |
| `riscv_rs.js` | 21889 (21 KB) | 4 KB |
| `riscv_rs_bg.wasm` | 132561 (129 KB) | 52 KB |

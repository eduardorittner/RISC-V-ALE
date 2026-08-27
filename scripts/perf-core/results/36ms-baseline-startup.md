# 36ms-baseline — startup and footprint

Commit: `9a8eff7`  Repetitions: 15

Median of the repetitions, milliseconds.

| Configuration | To the first instruction | ... the module | ... the core startup | To the exit | Reservation |
| --- | --- | --- | --- | --- | --- |
| Rust (the control) | 3.8 | 1.1 | 1.5 | 4.0 | 1.8 MB |
| C++ --isa acdfim | 30.4 | 3.8 | 25.8 | 31.5 | 160.0 MB |
| C++ as the application starts it | 30.8 | 3.9 | 26.2 | 31.9 | 160.0 MB |
| C++ with a 16 MB guest memory (not the application) | 16.7 | 3.9 | 12.1 | 17.8 | 160.0 MB |

Module size.

| File | Raw | Gzip |
| --- | --- | --- |
| `whisper.js` | 70791 (69 KB) | 19 KB |
| `whisper.wasm` | 956545 (934 KB) | 303 KB |
| `riscv_rs.js` | 21889 (21 KB) | 4 KB |
| `riscv_rs_bg.wasm` | 132561 (129 KB) | 52 KB |

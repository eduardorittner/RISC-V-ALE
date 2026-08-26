# step-8-control-step-7 — startup and footprint

Commit: `4ee1c2c`  Repetitions: 9

Median of the repetitions, milliseconds.

| Configuration | To the first instruction | ... the module | ... the core startup | To the exit | Reservation |
| --- | --- | --- | --- | --- | --- |
| Rust (the control) | 5.8 | 1.8 | 1.8 | 5.9 | 1.8 MB |
| C++ --isa acdfim | 43.6 | 5.9 | 36.4 | 149.8 | 160.0 MB |
| C++ as the application starts it | 44.8 | 6.5 | 37.2 | 150.6 | 160.0 MB |
| C++ with a 16 MB guest memory (not the application) | 29.0 | 6.4 | 21.2 | 134.1 | 160.0 MB |

Module size.

| File | Raw | Gzip |
| --- | --- | --- |
| `whisper.js` | 79734 (78 KB) | 21 KB |
| `whisper.wasm` | 1757149 (1716 KB) | 464 KB |
| `riscv_rs.js` | 21889 (21 KB) | 4 KB |
| `riscv_rs_bg.wasm` | 132561 (129 KB) | 52 KB |

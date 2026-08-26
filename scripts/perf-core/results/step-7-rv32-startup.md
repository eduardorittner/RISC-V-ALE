# step-7-rv32 — startup and footprint

Commit: `e417a54`  Repetitions: 9

Median of the repetitions, milliseconds.

| Configuration | To the first instruction | ... the module | ... the core startup | To the exit | Reservation |
| --- | --- | --- | --- | --- | --- |
| Rust (the control) | 6.3 | 1.8 | 2.3 | 6.5 | 1.8 MB |
| C++ --isa acdfim | 44.1 | 6.3 | 36.8 | 150.2 | 160.0 MB |
| C++ as the application starts it | 46.3 | 6.9 | 38.5 | 153.3 | 160.0 MB |
| C++ with a 16 MB guest memory (not the application) | 31.5 | 6.9 | 23.4 | 137.4 | 160.0 MB |

Module size.

| File | Raw | Gzip |
| --- | --- | --- |
| `whisper.js` | 79734 (78 KB) | 21 KB |
| `whisper.wasm` | 1757149 (1716 KB) | 464 KB |
| `riscv_rs.js` | 21889 (21 KB) | 4 KB |
| `riscv_rs_bg.wasm` | 132561 (129 KB) | 52 KB |

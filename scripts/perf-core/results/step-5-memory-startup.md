# step-5-memory — startup and footprint

Commit: `445b118`  Repetitions: 7

Median of the repetitions, milliseconds.

| Configuration | To the first instruction | To the exit | Reservation |
| --- | --- | --- | --- |
| Rust (the control) | 6.2 | 6.4 | 1.8 MB |
| C++ --isa acdfim | 48.0 | 154.4 | 160.0 MB |
| C++ as the application starts it | 47.0 | 150.7 | 160.0 MB |
| C++ with a 16 MB guest memory (not the application) | 32.0 | 136.6 | 160.0 MB |

Module size.

| File | Raw | Gzip |
| --- | --- | --- |
| `whisper.js` | 96479 (94 KB) | 26 KB |
| `whisper.wasm` | 4095232 (3999 KB) | 920 KB |
| `riscv_rs.js` | 21889 (21 KB) | 4 KB |
| `riscv_rs_bg.wasm` | 132561 (129 KB) | 52 KB |

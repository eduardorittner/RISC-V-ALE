# step-1-baseline

Commit: `645aa31`  Repetitions: 5

Median of the repetitions, MIPS.

| Configuration | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Rust | 202.2 | 201.6 | 261.1 |
| C++ --isa acdfimsu | 35.8 | 31.6 | 35.3 |
| C++ --isa acdfim | 136.1 | 90.5 | 178.6 |

Best of the repetitions, MIPS.

| Configuration | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Rust | 205.8 | 202.8 | 263.5 |
| C++ --isa acdfimsu | 35.8 | 32.4 | 35.6 |
| C++ --isa acdfim | 137.0 | 90.5 | 180.2 |

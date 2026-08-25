# step-3-rebuild

Commit: `467ecb1`  Repetitions: 5

Median of the repetitions, MIPS.

| Configuration | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Rust | 201.8 | 202.0 | 263.2 |
| C++ --isa acdfimsu | 27.7 | 24.4 | 27.1 |
| C++ --isa acdfim | 133.3 | 77.8 | 141.8 |

Best of the repetitions, MIPS.

| Configuration | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Rust | 205.3 | 204.5 | 264.6 |
| C++ --isa acdfimsu | 27.9 | 24.7 | 27.2 |
| C++ --isa acdfim | 134.2 | 78.1 | 142.9 |

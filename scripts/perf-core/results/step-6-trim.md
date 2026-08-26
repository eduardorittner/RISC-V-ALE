# step-6-trim

Commit: `4ed613d`  Repetitions: 5

Median of the repetitions, MIPS.

| Configuration | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Rust | 204.3 | 201.2 | 260.4 |
| C++ --isa acdfimsu | 25.2 | 25.6 | 25.0 |
| C++ --isa acdfim | 135.1 | 125.0 | 144.9 |

Best of the repetitions, MIPS.

| Configuration | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Rust | 213.0 | 205.3 | 263.5 |
| C++ --isa acdfimsu | 25.6 | 25.7 | 25.3 |
| C++ --isa acdfim | 137.0 | 125.0 | 144.9 |

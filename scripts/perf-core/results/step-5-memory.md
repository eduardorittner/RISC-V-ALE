# step-5-memory

Commit: `445b118`  Repetitions: 5

Median of the repetitions, MIPS.

| Configuration | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Rust | 211.4 | 207.3 | 263.9 |
| C++ --isa acdfimsu | 27.6 | 27.6 | 27.1 |
| C++ --isa acdfim | 131.6 | 122.0 | 140.8 |

Best of the repetitions, MIPS.

| Configuration | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Rust | 233.4 | 209.6 | 271.0 |
| C++ --isa acdfimsu | 27.8 | 27.8 | 27.3 |
| C++ --isa acdfim | 131.6 | 122.7 | 140.8 |

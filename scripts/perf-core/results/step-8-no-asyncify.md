# step-8-no-asyncify

Commit: `4ee1c2c`  Repetitions: 5

Median of the repetitions, MIPS.

| Configuration | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Rust | 214.6 | 193.6 | 251.6 |
| C++ --isa acdfimsu | 49.5 | 39.8 | 36.2 |
| C++ --isa acdfim | 235.3 | 217.4 | 227.3 |

Best of the repetitions, MIPS.

| Configuration | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Rust | 217.4 | 195.9 | 254.1 |
| C++ --isa acdfimsu | 51.2 | 40.6 | 36.6 |
| C++ --isa acdfim | 238.1 | 219.8 | 232.6 |

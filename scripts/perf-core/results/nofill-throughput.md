# nofill-throughput

Commit: `9a8eff7`  Repetitions: 5

Median of the repetitions, MIPS.

| Configuration | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Rust | 226.5 | 202.8 | 262.8 |
| C++ --isa acdfimsu | 53.1 | 41.7 | 38.3 |
| C++ --isa acdfim | 241.0 | 217.4 | 227.3 |

Best of the repetitions, MIPS.

| Configuration | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Rust | 228.1 | 204.7 | 264.2 |
| C++ --isa acdfimsu | 53.5 | 41.8 | 39.1 |
| C++ --isa acdfim | 243.9 | 222.2 | 238.1 |

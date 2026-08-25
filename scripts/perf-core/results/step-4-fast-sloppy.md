# step-4-fast-sloppy

Commit: `6c2bb53`  Repetitions: 5

Median of the repetitions, MIPS.

| Configuration | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Rust | 200.8 | 203.0 | 263.5 |
| C++ --isa acdfimsu | 27.8 | 27.7 | 27.1 |
| C++ --isa acdfim | 133.3 | 122.0 | 140.8 |

Best of the repetitions, MIPS.

| Configuration | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Rust | 209.2 | 204.1 | 265.3 |
| C++ --isa acdfimsu | 27.9 | 27.9 | 27.2 |
| C++ --isa acdfim | 133.3 | 122.0 | 142.9 |

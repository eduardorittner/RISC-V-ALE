# step-7-rv32

Commit: `e417a54`  Repetitions: 5

Median of the repetitions, MIPS.

| Configuration | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Rust | 206.8 | 210.1 | 265.6 |
| C++ --isa acdfimsu | 25.8 | 25.8 | 25.5 |
| C++ --isa acdfim | 137.0 | 126.6 | 147.1 |

Best of the repetitions, MIPS.

| Configuration | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Rust | 215.1 | 211.6 | 271.0 |
| C++ --isa acdfimsu | 25.9 | 26.0 | 25.6 |
| C++ --isa acdfim | 138.9 | 126.6 | 150.4 |

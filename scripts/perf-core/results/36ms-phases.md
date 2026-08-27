# 36ms-phases — where the startup time goes

Commit: `9a8eff7`  Module: `scripts/build-whisper/.build/instr`  Repetitions: 15

## C++ as the application starts it (128 MB guest memory)

To the first instruction: 31.6 ms. To the exit: 32.8 ms. The whole run: 32.9 ms, of which 0.2 ms is not in any leaf phase (each phase below the 0.1 ms resolution of the clock reads 0.00).

| Phase | Median (ms) | Min | Max |
| --- | --- | --- | --- |
| Fetch the ELF file | 0.70 | 0.50 | 8.50 |
| Fetch, compile and instantiate the module | 4.00 | 3.80 | 19.30 |
| Write the ELF into MEMFS (preRun) | 0.40 | 0.30 | 1.10 |
| The Emscripten runtime, up to main | 0.80 | 0.70 | 3.30 |
| **main, up to the return** | 25.40 | 24.30 | 69.20 |
| &nbsp;&nbsp;  parseCmdLineArgs (Boost) | 1.30 | 1.10 | 1.80 |
| &nbsp;&nbsp;  expandTargets | 0.20 | 0.10 | 0.20 |
| &nbsp;&nbsp;  the configuration file | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;  the register width (the ELF class) | 1.10 | 0.80 | 1.80 |
| &nbsp;&nbsp;**session, up to the return** | 23.00 | 21.80 | 65.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the primary configuration | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;**new System** | 20.90 | 19.90 | 61.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Memory** | 16.20 | 15.60 | 51.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the PMA table (the member list) | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        mmap the guest memory | 16.00 | 15.50 | 50.90 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of Memory | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Core and new Hart** | 4.70 | 4.00 | 9.90 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the Core object and the CSR vector | 0.40 | 0.30 | 4.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the CSR table | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        between the CSRs and the table | 0.10 | 0.10 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        setupInstVec | 2.50 | 2.10 | 3.60 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the instruction name map | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of InstTable | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the other Hart members | 0.10 | 0.10 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the decode cache | 1.10 | 1.00 | 1.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of the Hart body | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the vector of harts | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the asserts of session | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configHarts | 0.70 | 0.60 | 2.90 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configMemory | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;    openUserFiles | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;    hart.reset | 0.30 | 0.10 | 0.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;**aleStart** | 0.60 | 0.50 | 0.80 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the newlib test (reads the ELF) | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the ISA string | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      load the ELF into the guest | 0.30 | 0.10 | 0.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the hart options | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the program arguments (writes the stack) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the rest of aleStart | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the tail of session | 0.10 | 0.00 | 0.20 |
| **The first slice, up to the first instruction** | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;  the slice call and the run setup | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;  the first three instructions | 0.40 | 0.20 | 0.50 |
| The rest of the program | 0.50 | 0.40 | 0.60 |
| The report (Retired N instructions) | 0.70 | 0.70 | 0.90 |
| The tail of the run | 0.20 | 0.10 | 0.40 |

## C++ with a 64 MB guest memory (not the application)

To the first instruction: 23.8 ms. To the exit: 24.9 ms. The whole run: 25.2 ms, of which 0.2 ms is not in any leaf phase (each phase below the 0.1 ms resolution of the clock reads 0.00).

| Phase | Median (ms) | Min | Max |
| --- | --- | --- | --- |
| Fetch the ELF file | 0.80 | 0.60 | 3.80 |
| Fetch, compile and instantiate the module | 4.10 | 3.80 | 4.90 |
| Write the ELF into MEMFS (preRun) | 0.40 | 0.40 | 0.50 |
| The Emscripten runtime, up to main | 0.80 | 0.70 | 0.90 |
| **main, up to the return** | 16.90 | 16.10 | 18.60 |
| &nbsp;&nbsp;  parseCmdLineArgs (Boost) | 1.40 | 1.20 | 1.60 |
| &nbsp;&nbsp;  expandTargets | 0.20 | 0.10 | 0.20 |
| &nbsp;&nbsp;  the configuration file | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;  the register width (the ELF class) | 1.20 | 0.70 | 1.80 |
| &nbsp;&nbsp;**session, up to the return** | 14.00 | 13.60 | 15.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the primary configuration | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;**new System** | 12.30 | 11.80 | 13.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Memory** | 8.00 | 7.80 | 8.70 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the PMA table (the member list) | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        mmap the guest memory | 8.00 | 7.60 | 8.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of Memory | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Core and new Hart** | 4.30 | 4.00 | 5.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the Core object and the CSR vector | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the CSR table | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        between the CSRs and the table | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        setupInstVec | 2.30 | 1.90 | 2.90 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the instruction name map | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of InstTable | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the other Hart members | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the decode cache | 1.00 | 0.90 | 1.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of the Hart body | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the vector of harts | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the asserts of session | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configHarts | 0.70 | 0.60 | 0.80 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configMemory | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;    openUserFiles | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    hart.reset | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;**aleStart** | 0.50 | 0.40 | 0.70 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the newlib test (reads the ELF) | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the ISA string | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      load the ELF into the guest | 0.20 | 0.20 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the hart options | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the program arguments (writes the stack) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the rest of aleStart | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the tail of session | 0.10 | 0.00 | 0.20 |
| **The first slice, up to the first instruction** | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;  the slice call and the run setup | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;  the first three instructions | 0.40 | 0.30 | 0.50 |
| The rest of the program | 0.50 | 0.40 | 0.60 |
| The report (Retired N instructions) | 0.70 | 0.60 | 0.80 |
| The tail of the run | 0.20 | 0.10 | 0.30 |

## C++ with a 16 MB guest memory (not the application)

To the first instruction: 17.0 ms. To the exit: 18.2 ms. The whole run: 18.4 ms, of which 0.3 ms is not in any leaf phase (each phase below the 0.1 ms resolution of the clock reads 0.00).

| Phase | Median (ms) | Min | Max |
| --- | --- | --- | --- |
| Fetch the ELF file | 0.70 | 0.60 | 0.80 |
| Fetch, compile and instantiate the module | 4.10 | 3.80 | 4.80 |
| Write the ELF into MEMFS (preRun) | 0.40 | 0.30 | 0.60 |
| The Emscripten runtime, up to main | 0.70 | 0.70 | 0.80 |
| **main, up to the return** | 10.70 | 10.10 | 12.10 |
| &nbsp;&nbsp;  parseCmdLineArgs (Boost) | 1.30 | 1.30 | 1.60 |
| &nbsp;&nbsp;  expandTargets | 0.20 | 0.10 | 0.20 |
| &nbsp;&nbsp;  the configuration file | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;  the register width (the ELF class) | 1.10 | 0.70 | 1.50 |
| &nbsp;&nbsp;**session, up to the return** | 8.10 | 7.70 | 9.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the primary configuration | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;**new System** | 6.40 | 6.00 | 6.90 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Memory** | 2.10 | 1.90 | 2.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the PMA table (the member list) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        mmap the guest memory | 2.10 | 1.80 | 2.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of Memory | 0.00 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Core and new Hart** | 4.20 | 3.90 | 4.60 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the Core object and the CSR vector | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the CSR table | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        between the CSRs and the table | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        setupInstVec | 2.10 | 1.90 | 2.70 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the instruction name map | 0.00 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of InstTable | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the other Hart members | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the decode cache | 1.00 | 0.90 | 1.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of the Hart body | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the vector of harts | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the asserts of session | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configHarts | 0.70 | 0.60 | 0.80 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configMemory | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;    openUserFiles | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    hart.reset | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;**aleStart** | 0.50 | 0.40 | 0.60 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the newlib test (reads the ELF) | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the ISA string | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      load the ELF into the guest | 0.20 | 0.10 | 0.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the hart options | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the program arguments (writes the stack) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the rest of aleStart | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the tail of session | 0.10 | 0.00 | 0.20 |
| **The first slice, up to the first instruction** | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;  the slice call and the run setup | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;  the first three instructions | 0.40 | 0.30 | 0.50 |
| The rest of the program | 0.50 | 0.40 | 0.60 |
| The report (Retired N instructions) | 0.70 | 0.60 | 0.70 |
| The tail of the run | 0.20 | 0.10 | 0.20 |

## C++ with a 4 MB guest memory (not the application)

To the first instruction: 15.5 ms. To the exit: 16.8 ms. The whole run: 17.0 ms, of which 0.2 ms is not in any leaf phase (each phase below the 0.1 ms resolution of the clock reads 0.00).

| Phase | Median (ms) | Min | Max |
| --- | --- | --- | --- |
| Fetch the ELF file | 0.70 | 0.60 | 0.90 |
| Fetch, compile and instantiate the module | 4.20 | 3.80 | 4.60 |
| Write the ELF into MEMFS (preRun) | 0.40 | 0.40 | 0.50 |
| The Emscripten runtime, up to main | 0.80 | 0.70 | 0.90 |
| **main, up to the return** | 9.30 | 8.50 | 10.50 |
| &nbsp;&nbsp;  parseCmdLineArgs (Boost) | 1.30 | 1.20 | 1.50 |
| &nbsp;&nbsp;  expandTargets | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;  the configuration file | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;  the register width (the ELF class) | 1.10 | 0.60 | 1.30 |
| &nbsp;&nbsp;**session, up to the return** | 6.70 | 6.20 | 8.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the primary configuration | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;**new System** | 4.90 | 4.50 | 6.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Memory** | 0.60 | 0.60 | 0.70 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the PMA table (the member list) | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        mmap the guest memory | 0.60 | 0.50 | 0.70 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of Memory | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Core and new Hart** | 4.20 | 3.80 | 5.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the Core object and the CSR vector | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the CSR table | 0.40 | 0.30 | 0.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        between the CSRs and the table | 0.20 | 0.10 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        setupInstVec | 2.10 | 1.80 | 3.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the instruction name map | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of InstTable | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the other Hart members | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the decode cache | 1.10 | 0.90 | 1.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of the Hart body | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the vector of harts | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the asserts of session | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configHarts | 0.60 | 0.60 | 0.80 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configMemory | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;    openUserFiles | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    hart.reset | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;**aleStart** | 0.50 | 0.50 | 0.70 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the newlib test (reads the ELF) | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the ISA string | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      load the ELF into the guest | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the hart options | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the program arguments (writes the stack) | 0.00 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the rest of aleStart | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the tail of session | 0.10 | 0.00 | 0.20 |
| **The first slice, up to the first instruction** | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;  the slice call and the run setup | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;  the first three instructions | 0.40 | 0.30 | 0.50 |
| The rest of the program | 0.50 | 0.40 | 0.60 |
| The report (Retired N instructions) | 0.70 | 0.60 | 0.80 |
| The tail of the run | 0.10 | 0.10 | 0.20 |

## C++ with a 1 MiB guest memory (not the application)

To the first instruction: 15.5 ms. To the exit: 16.6 ms. The whole run: 16.8 ms, of which 0.2 ms is not in any leaf phase (each phase below the 0.1 ms resolution of the clock reads 0.00).

| Phase | Median (ms) | Min | Max |
| --- | --- | --- | --- |
| Fetch the ELF file | 0.70 | 0.50 | 0.80 |
| Fetch, compile and instantiate the module | 4.10 | 3.70 | 4.90 |
| Write the ELF into MEMFS (preRun) | 0.40 | 0.30 | 0.50 |
| The Emscripten runtime, up to main | 0.80 | 0.70 | 0.90 |
| **main, up to the return** | 9.00 | 8.20 | 9.70 |
| &nbsp;&nbsp;  parseCmdLineArgs (Boost) | 1.40 | 1.20 | 1.50 |
| &nbsp;&nbsp;  expandTargets | 0.10 | 0.10 | 0.30 |
| &nbsp;&nbsp;  the configuration file | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;  the register width (the ELF class) | 1.10 | 0.60 | 1.50 |
| &nbsp;&nbsp;**session, up to the return** | 6.30 | 5.80 | 7.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the primary configuration | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;**new System** | 4.60 | 4.10 | 5.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Memory** | 0.20 | 0.20 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the PMA table (the member list) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        mmap the guest memory | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of Memory | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Core and new Hart** | 4.30 | 3.80 | 5.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the Core object and the CSR vector | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the CSR table | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        between the CSRs and the table | 0.10 | 0.10 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        setupInstVec | 2.30 | 1.90 | 2.90 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the instruction name map | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of InstTable | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the other Hart members | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the decode cache | 1.00 | 0.90 | 1.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of the Hart body | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the vector of harts | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the asserts of session | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configHarts | 0.70 | 0.60 | 0.70 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configMemory | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;    openUserFiles | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    hart.reset | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;**aleStart** | 0.50 | 0.40 | 0.70 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the newlib test (reads the ELF) | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the ISA string | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      load the ELF into the guest | 0.20 | 0.20 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the hart options | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the program arguments (writes the stack) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the rest of aleStart | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the tail of session | 0.10 | 0.00 | 0.20 |
| **The first slice, up to the first instruction** | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;  the slice call and the run setup | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;  the first three instructions | 0.40 | 0.20 | 0.40 |
| The rest of the program | 0.50 | 0.40 | 0.60 |
| The report (Retired N instructions) | 0.70 | 0.60 | 0.80 |
| The tail of the run | 0.20 | 0.10 | 0.30 |


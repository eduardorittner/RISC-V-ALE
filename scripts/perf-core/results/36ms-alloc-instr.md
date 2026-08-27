# 36ms-alloc-instr — where the startup time goes

Commit: `9a8eff7`  Module: `scripts/build-whisper/.build/instr`  Repetitions: 15

Browser: Google Chrome 152.0.7977.65

## C++ as the application starts it (128 MB guest memory)

To the first instruction: 30.8 ms. To the exit: 32.0 ms. The whole run: 32.2 ms, of which 0.2 ms is not in any leaf phase (each phase below the 0.1 ms resolution of the clock reads 0.00).

| Phase | Median (ms) | Min | Max |
| --- | --- | --- | --- |
| Fetch the ELF file | 0.60 | 0.60 | 2.90 |
| Fetch, compile and instantiate the module | 3.90 | 3.80 | 18.10 |
| Write the ELF into MEMFS (preRun) | 0.40 | 0.30 | 1.00 |
| The Emscripten runtime, up to main | 0.80 | 0.60 | 2.30 |
| **main, up to the return** | 24.80 | 23.00 | 36.60 |
| &nbsp;&nbsp;  parseCmdLineArgs (Boost) | 1.30 | 1.20 | 1.40 |
| &nbsp;&nbsp;  expandTargets | 0.10 | 0.10 | 0.20 |
| &nbsp;&nbsp;  the configuration file | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;  the register width (the ELF class) | 0.80 | 0.70 | 1.40 |
| &nbsp;&nbsp;**session, up to the return** | 22.20 | 20.70 | 33.60 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the primary configuration | 0.00 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;**new System** | 20.30 | 19.00 | 31.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Memory** | 15.90 | 14.20 | 25.70 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the PMA table (the member list) | 0.00 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        mmap the guest memory | 15.80 | 14.20 | 25.70 |
|         check that the buffer is zero | (no mark) | | |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of Memory | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Core and new Hart** | 4.70 | 4.10 | 5.60 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the Core object and the CSR vector | 0.40 | 0.30 | 1.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the CSR table | 0.40 | 0.30 | 0.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        between the CSRs and the table | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        setupInstVec | 2.60 | 2.10 | 2.90 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the instruction name map | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of InstTable | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the other Hart members | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the decode cache | 1.10 | 0.90 | 1.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of the Hart body | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the vector of harts | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the asserts of session | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configHarts | 0.60 | 0.60 | 0.80 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configMemory | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;    openUserFiles | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    hart.reset | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;**aleStart** | 0.60 | 0.60 | 0.70 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the newlib test (reads the ELF) | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the ISA string | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      load the ELF into the guest | 0.20 | 0.20 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the hart options | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the program arguments (writes the stack) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the rest of aleStart | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the tail of session | 0.10 | 0.00 | 0.10 |
| **The first slice, up to the first instruction** | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;  the slice call and the run setup | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;  the first three instructions | 0.40 | 0.30 | 0.40 |
| The rest of the program | 0.50 | 0.40 | 0.60 |
| The report (Retired N instructions) | 0.70 | 0.60 | 0.80 |
| The tail of the run | 0.20 | 0.20 | 0.40 |

## C++ with a 64 MB guest memory (not the application)

To the first instruction: 23.1 ms. To the exit: 24.2 ms. The whole run: 24.4 ms, of which 0.2 ms is not in any leaf phase (each phase below the 0.1 ms resolution of the clock reads 0.00).

| Phase | Median (ms) | Min | Max |
| --- | --- | --- | --- |
| Fetch the ELF file | 0.80 | 0.70 | 1.30 |
| Fetch, compile and instantiate the module | 4.00 | 3.80 | 4.90 |
| Write the ELF into MEMFS (preRun) | 0.40 | 0.30 | 0.50 |
| The Emscripten runtime, up to main | 0.80 | 0.70 | 0.90 |
| **main, up to the return** | 16.70 | 16.00 | 17.70 |
| &nbsp;&nbsp;  parseCmdLineArgs (Boost) | 1.30 | 1.20 | 1.40 |
| &nbsp;&nbsp;  expandTargets | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;  the configuration file | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;  the register width (the ELF class) | 1.10 | 0.50 | 1.40 |
| &nbsp;&nbsp;**session, up to the return** | 14.10 | 13.70 | 15.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the primary configuration | 0.00 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;**new System** | 12.40 | 11.90 | 13.60 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Memory** | 8.00 | 7.50 | 8.60 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the PMA table (the member list) | 0.00 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        mmap the guest memory | 7.90 | 7.50 | 8.50 |
|         check that the buffer is zero | (no mark) | | |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of Memory | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Core and new Hart** | 4.30 | 4.00 | 5.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the Core object and the CSR vector | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the CSR table | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        between the CSRs and the table | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        setupInstVec | 2.20 | 2.10 | 2.90 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the instruction name map | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of InstTable | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the other Hart members | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the decode cache | 1.00 | 0.90 | 1.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of the Hart body | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the vector of harts | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the asserts of session | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configHarts | 0.60 | 0.60 | 0.80 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configMemory | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;    openUserFiles | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    hart.reset | 0.30 | 0.20 | 0.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;**aleStart** | 0.50 | 0.40 | 0.70 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the newlib test (reads the ELF) | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the ISA string | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      load the ELF into the guest | 0.20 | 0.20 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the hart options | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the program arguments (writes the stack) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the rest of aleStart | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the tail of session | 0.10 | 0.00 | 0.10 |
| **The first slice, up to the first instruction** | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;  the slice call and the run setup | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;  the first three instructions | 0.40 | 0.30 | 0.50 |
| The rest of the program | 0.50 | 0.40 | 0.60 |
| The report (Retired N instructions) | 0.70 | 0.60 | 0.80 |
| The tail of the run | 0.20 | 0.10 | 0.30 |

## C++ with a 16 MB guest memory (not the application)

To the first instruction: 17.0 ms. To the exit: 18.1 ms. The whole run: 18.3 ms, of which 0.2 ms is not in any leaf phase (each phase below the 0.1 ms resolution of the clock reads 0.00).

| Phase | Median (ms) | Min | Max |
| --- | --- | --- | --- |
| Fetch the ELF file | 0.70 | 0.60 | 3.10 |
| Fetch, compile and instantiate the module | 4.20 | 3.80 | 4.60 |
| Write the ELF into MEMFS (preRun) | 0.40 | 0.30 | 0.50 |
| The Emscripten runtime, up to main | 0.80 | 0.70 | 0.90 |
| **main, up to the return** | 10.60 | 10.00 | 11.20 |
| &nbsp;&nbsp;  parseCmdLineArgs (Boost) | 1.30 | 1.20 | 1.50 |
| &nbsp;&nbsp;  expandTargets | 0.20 | 0.10 | 0.20 |
| &nbsp;&nbsp;  the configuration file | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;  the register width (the ELF class) | 1.10 | 0.60 | 1.50 |
| &nbsp;&nbsp;**session, up to the return** | 8.10 | 7.80 | 8.60 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the primary configuration | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;**new System** | 6.30 | 6.00 | 6.90 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Memory** | 2.00 | 1.90 | 2.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the PMA table (the member list) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        mmap the guest memory | 2.00 | 1.80 | 2.20 |
|         check that the buffer is zero | (no mark) | | |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of Memory | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Core and new Hart** | 4.30 | 3.90 | 4.80 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the Core object and the CSR vector | 0.30 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the CSR table | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        between the CSRs and the table | 0.10 | 0.10 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        setupInstVec | 2.20 | 1.90 | 2.80 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the instruction name map | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of InstTable | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the other Hart members | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the decode cache | 1.00 | 1.00 | 1.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of the Hart body | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the vector of harts | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the asserts of session | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configHarts | 0.70 | 0.50 | 0.70 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configMemory | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;    openUserFiles | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    hart.reset | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;**aleStart** | 0.60 | 0.50 | 0.60 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the newlib test (reads the ELF) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the ISA string | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      load the ELF into the guest | 0.20 | 0.20 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the hart options | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the program arguments (writes the stack) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the rest of aleStart | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the tail of session | 0.00 | 0.00 | 0.10 |
| **The first slice, up to the first instruction** | 0.40 | 0.40 | 0.50 |
| &nbsp;&nbsp;  the slice call and the run setup | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;  the first three instructions | 0.40 | 0.30 | 0.50 |
| The rest of the program | 0.50 | 0.40 | 0.60 |
| The report (Retired N instructions) | 0.60 | 0.60 | 0.80 |
| The tail of the run | 0.20 | 0.10 | 0.30 |

## C++ with a 4 MB guest memory (not the application)

To the first instruction: 15.6 ms. To the exit: 16.7 ms. The whole run: 16.9 ms, of which 0.3 ms is not in any leaf phase (each phase below the 0.1 ms resolution of the clock reads 0.00).

| Phase | Median (ms) | Min | Max |
| --- | --- | --- | --- |
| Fetch the ELF file | 0.70 | 0.50 | 0.80 |
| Fetch, compile and instantiate the module | 4.10 | 3.90 | 4.90 |
| Write the ELF into MEMFS (preRun) | 0.40 | 0.40 | 0.50 |
| The Emscripten runtime, up to main | 0.80 | 0.70 | 0.90 |
| **main, up to the return** | 9.20 | 8.80 | 10.00 |
| &nbsp;&nbsp;  parseCmdLineArgs (Boost) | 1.30 | 1.20 | 1.50 |
| &nbsp;&nbsp;  expandTargets | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;  the configuration file | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;  the register width (the ELF class) | 1.10 | 0.70 | 1.40 |
| &nbsp;&nbsp;**session, up to the return** | 6.60 | 6.30 | 7.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the primary configuration | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;**new System** | 4.90 | 4.60 | 5.60 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Memory** | 0.60 | 0.60 | 0.80 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the PMA table (the member list) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        mmap the guest memory | 0.60 | 0.40 | 0.70 |
|         check that the buffer is zero | (no mark) | | |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of Memory | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Core and new Hart** | 4.20 | 4.00 | 4.80 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the Core object and the CSR vector | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the CSR table | 0.40 | 0.30 | 0.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        between the CSRs and the table | 0.10 | 0.10 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        setupInstVec | 2.20 | 1.90 | 2.70 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the instruction name map | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of InstTable | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the other Hart members | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the decode cache | 1.00 | 0.90 | 1.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of the Hart body | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the vector of harts | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the asserts of session | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configHarts | 0.70 | 0.60 | 0.80 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configMemory | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;    openUserFiles | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    hart.reset | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;**aleStart** | 0.50 | 0.50 | 0.60 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the newlib test (reads the ELF) | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the ISA string | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      load the ELF into the guest | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the hart options | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the program arguments (writes the stack) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the rest of aleStart | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the tail of session | 0.10 | 0.00 | 0.10 |
| **The first slice, up to the first instruction** | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;  the slice call and the run setup | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;  the first three instructions | 0.40 | 0.30 | 0.50 |
| The rest of the program | 0.40 | 0.30 | 0.60 |
| The report (Retired N instructions) | 0.70 | 0.60 | 0.80 |
| The tail of the run | 0.20 | 0.10 | 0.30 |

## C++ with a 1 MiB guest memory (not the application)

To the first instruction: 15.3 ms. To the exit: 16.4 ms. The whole run: 16.6 ms, of which 0.2 ms is not in any leaf phase (each phase below the 0.1 ms resolution of the clock reads 0.00).

| Phase | Median (ms) | Min | Max |
| --- | --- | --- | --- |
| Fetch the ELF file | 0.70 | 0.50 | 0.80 |
| Fetch, compile and instantiate the module | 4.20 | 3.90 | 4.50 |
| Write the ELF into MEMFS (preRun) | 0.40 | 0.40 | 0.60 |
| The Emscripten runtime, up to main | 0.80 | 0.70 | 0.90 |
| **main, up to the return** | 8.90 | 8.10 | 9.40 |
| &nbsp;&nbsp;  parseCmdLineArgs (Boost) | 1.30 | 1.20 | 1.40 |
| &nbsp;&nbsp;  expandTargets | 0.10 | 0.10 | 0.20 |
| &nbsp;&nbsp;  the configuration file | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;  the register width (the ELF class) | 1.20 | 0.80 | 1.30 |
| &nbsp;&nbsp;**session, up to the return** | 6.20 | 5.90 | 7.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the primary configuration | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;**new System** | 4.50 | 4.30 | 5.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Memory** | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the PMA table (the member list) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        mmap the guest memory | 0.20 | 0.00 | 0.30 |
|         check that the buffer is zero | (no mark) | | |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of Memory | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Core and new Hart** | 4.20 | 4.00 | 5.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the Core object and the CSR vector | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the CSR table | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        between the CSRs and the table | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        setupInstVec | 2.20 | 2.00 | 3.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the instruction name map | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of InstTable | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the other Hart members | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the decode cache | 1.10 | 0.90 | 1.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of the Hart body | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the vector of harts | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the asserts of session | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configHarts | 0.70 | 0.60 | 0.80 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configMemory | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;    openUserFiles | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    hart.reset | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;**aleStart** | 0.50 | 0.40 | 0.60 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the newlib test (reads the ELF) | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the ISA string | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      load the ELF into the guest | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the hart options | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the program arguments (writes the stack) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the rest of aleStart | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the tail of session | 0.10 | 0.00 | 0.20 |
| **The first slice, up to the first instruction** | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;  the slice call and the run setup | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;  the first three instructions | 0.40 | 0.30 | 0.40 |
| The rest of the program | 0.50 | 0.40 | 0.60 |
| The report (Retired N instructions) | 0.60 | 0.60 | 0.80 |
| The tail of the run | 0.20 | 0.10 | 0.30 |


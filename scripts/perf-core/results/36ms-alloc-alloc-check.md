# 36ms-alloc-alloc-check — where the startup time goes

Commit: `9a8eff7`  Module: `scripts/build-whisper/.build/alloc-check`  Repetitions: 15

Browser: Google Chrome 152.0.7977.65

## C++ as the application starts it (128 MB guest memory)

To the first instruction: 40.1 ms. To the exit: 41.0 ms. The whole run: 41.2 ms, of which 0.2 ms is not in any leaf phase (each phase below the 0.1 ms resolution of the clock reads 0.00).

| Phase | Median (ms) | Min | Max |
| --- | --- | --- | --- |
| Fetch the ELF file | 0.70 | 0.50 | 1.40 |
| Fetch, compile and instantiate the module | 4.10 | 4.00 | 6.10 |
| Write the ELF into MEMFS (preRun) | 0.40 | 0.30 | 0.60 |
| The Emscripten runtime, up to main | 0.80 | 0.60 | 1.00 |
| **main, up to the return** | 33.90 | 27.20 | 36.60 |
| &nbsp;&nbsp;  parseCmdLineArgs (Boost) | 1.30 | 1.20 | 1.60 |
| &nbsp;&nbsp;  expandTargets | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;  the configuration file | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;  the register width (the ELF class) | 1.20 | 0.70 | 1.50 |
| &nbsp;&nbsp;**session, up to the return** | 31.30 | 25.10 | 33.80 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the primary configuration | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;**new System** | 29.40 | 23.30 | 31.80 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Memory** | 25.00 | 18.80 | 26.70 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the PMA table (the member list) | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        mmap the guest memory | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        check that the buffer is zero | 24.90 | 18.60 | 26.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of Memory | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Core and new Hart** | 5.20 | 4.30 | 6.70 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the Core object and the CSR vector | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the CSR table | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        between the CSRs and the table | 0.10 | 0.10 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        setupInstVec | 2.80 | 2.10 | 4.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the instruction name map | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of InstTable | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the other Hart members | 0.00 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the decode cache | 1.20 | 1.10 | 1.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of the Hart body | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the vector of harts | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the asserts of session | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configHarts | 0.70 | 0.60 | 0.80 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configMemory | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;    openUserFiles | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    hart.reset | 0.30 | 0.20 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;**aleStart** | 0.60 | 0.50 | 0.70 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the newlib test (reads the ELF) | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the ISA string | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      load the ELF into the guest | 0.30 | 0.20 | 0.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the hart options | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the program arguments (writes the stack) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the rest of aleStart | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the tail of session | 0.10 | 0.00 | 0.20 |
| **The first slice, up to the first instruction** | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;  the slice call and the run setup | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;  the first three instructions | 0.40 | 0.30 | 0.50 |
| The rest of the program | 0.40 | 0.40 | 0.50 |
| The report (Retired N instructions) | 0.60 | 0.50 | 0.60 |
| The tail of the run | 0.20 | 0.10 | 0.30 |

## C++ with a 64 MB guest memory (not the application)

To the first instruction: 29.1 ms. To the exit: 30.0 ms. The whole run: 30.2 ms, of which 0.2 ms is not in any leaf phase (each phase below the 0.1 ms resolution of the clock reads 0.00).

| Phase | Median (ms) | Min | Max |
| --- | --- | --- | --- |
| Fetch the ELF file | 0.80 | 0.70 | 1.30 |
| Fetch, compile and instantiate the module | 4.30 | 3.80 | 5.10 |
| Write the ELF into MEMFS (preRun) | 0.40 | 0.40 | 0.50 |
| The Emscripten runtime, up to main | 0.80 | 0.70 | 0.90 |
| **main, up to the return** | 22.10 | 18.00 | 28.40 |
| &nbsp;&nbsp;  parseCmdLineArgs (Boost) | 1.40 | 1.30 | 1.50 |
| &nbsp;&nbsp;  expandTargets | 0.20 | 0.10 | 0.20 |
| &nbsp;&nbsp;  the configuration file | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;  the register width (the ELF class) | 1.10 | 0.70 | 1.30 |
| &nbsp;&nbsp;**session, up to the return** | 19.40 | 15.50 | 25.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the primary configuration | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;**new System** | 17.70 | 13.60 | 23.60 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Memory** | 13.30 | 9.10 | 19.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the PMA table (the member list) | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        mmap the guest memory | 0.00 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        check that the buffer is zero | 13.10 | 8.90 | 19.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of Memory | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Core and new Hart** | 4.30 | 4.20 | 5.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the Core object and the CSR vector | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the CSR table | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        between the CSRs and the table | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        setupInstVec | 2.20 | 2.10 | 3.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the instruction name map | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of InstTable | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the other Hart members | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the decode cache | 1.10 | 1.00 | 1.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of the Hart body | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the vector of harts | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the asserts of session | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configHarts | 0.70 | 0.60 | 0.80 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configMemory | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;    openUserFiles | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    hart.reset | 0.30 | 0.20 | 0.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;**aleStart** | 0.60 | 0.50 | 0.70 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the newlib test (reads the ELF) | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the ISA string | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      load the ELF into the guest | 0.20 | 0.20 | 0.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the hart options | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the program arguments (writes the stack) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the rest of aleStart | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the tail of session | 0.10 | 0.00 | 0.10 |
| **The first slice, up to the first instruction** | 0.40 | 0.40 | 0.50 |
| &nbsp;&nbsp;  the slice call and the run setup | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;  the first three instructions | 0.40 | 0.30 | 0.40 |
| The rest of the program | 0.40 | 0.30 | 0.50 |
| The report (Retired N instructions) | 0.60 | 0.50 | 0.70 |
| The tail of the run | 0.20 | 0.20 | 0.30 |

## C++ with a 16 MB guest memory (not the application)

To the first instruction: 18.8 ms. To the exit: 19.8 ms. The whole run: 20.0 ms, of which 0.3 ms is not in any leaf phase (each phase below the 0.1 ms resolution of the clock reads 0.00).

| Phase | Median (ms) | Min | Max |
| --- | --- | --- | --- |
| Fetch the ELF file | 0.80 | 0.60 | 1.00 |
| Fetch, compile and instantiate the module | 4.10 | 3.80 | 4.70 |
| Write the ELF into MEMFS (preRun) | 0.40 | 0.30 | 0.50 |
| The Emscripten runtime, up to main | 0.80 | 0.70 | 0.90 |
| **main, up to the return** | 12.40 | 11.80 | 14.20 |
| &nbsp;&nbsp;  parseCmdLineArgs (Boost) | 1.40 | 1.20 | 1.50 |
| &nbsp;&nbsp;  expandTargets | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;  the configuration file | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;  the register width (the ELF class) | 1.20 | 0.70 | 1.50 |
| &nbsp;&nbsp;**session, up to the return** | 9.70 | 9.20 | 11.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the primary configuration | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;**new System** | 8.00 | 7.60 | 9.70 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Memory** | 3.60 | 2.80 | 5.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the PMA table (the member list) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        mmap the guest memory | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        check that the buffer is zero | 3.50 | 2.50 | 5.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of Memory | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Core and new Hart** | 4.40 | 4.00 | 4.80 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the Core object and the CSR vector | 0.40 | 0.30 | 0.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the CSR table | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        between the CSRs and the table | 0.10 | 0.10 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        setupInstVec | 2.20 | 1.90 | 2.70 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the instruction name map | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of InstTable | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the other Hart members | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the decode cache | 1.00 | 1.00 | 1.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of the Hart body | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the vector of harts | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the asserts of session | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configHarts | 0.70 | 0.60 | 0.80 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configMemory | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;    openUserFiles | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    hart.reset | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;**aleStart** | 0.50 | 0.50 | 0.70 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the newlib test (reads the ELF) | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the ISA string | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      load the ELF into the guest | 0.20 | 0.20 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the hart options | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the program arguments (writes the stack) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the rest of aleStart | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the tail of session | 0.10 | 0.00 | 0.20 |
| **The first slice, up to the first instruction** | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;  the slice call and the run setup | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;  the first three instructions | 0.40 | 0.30 | 0.40 |
| The rest of the program | 0.40 | 0.30 | 0.50 |
| The report (Retired N instructions) | 0.50 | 0.40 | 0.60 |
| The tail of the run | 0.20 | 0.10 | 0.30 |

## C++ with a 4 MB guest memory (not the application)

To the first instruction: 16.5 ms. To the exit: 17.4 ms. The whole run: 17.6 ms, of which 0.2 ms is not in any leaf phase (each phase below the 0.1 ms resolution of the clock reads 0.00).

| Phase | Median (ms) | Min | Max |
| --- | --- | --- | --- |
| Fetch the ELF file | 0.70 | 0.60 | 1.20 |
| Fetch, compile and instantiate the module | 4.20 | 3.90 | 4.40 |
| Write the ELF into MEMFS (preRun) | 0.40 | 0.40 | 0.50 |
| The Emscripten runtime, up to main | 0.80 | 0.70 | 0.90 |
| **main, up to the return** | 10.00 | 9.50 | 10.70 |
| &nbsp;&nbsp;  parseCmdLineArgs (Boost) | 1.40 | 1.20 | 1.50 |
| &nbsp;&nbsp;  expandTargets | 0.20 | 0.00 | 0.20 |
| &nbsp;&nbsp;  the configuration file | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;  the register width (the ELF class) | 1.20 | 0.70 | 1.40 |
| &nbsp;&nbsp;**session, up to the return** | 7.30 | 6.80 | 8.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the primary configuration | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;**new System** | 5.40 | 5.20 | 6.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Memory** | 1.10 | 0.90 | 1.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the PMA table (the member list) | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        mmap the guest memory | 0.00 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        check that the buffer is zero | 1.00 | 0.80 | 1.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of Memory | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Core and new Hart** | 4.20 | 4.00 | 5.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the Core object and the CSR vector | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the CSR table | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        between the CSRs and the table | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        setupInstVec | 2.20 | 2.00 | 3.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the instruction name map | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of InstTable | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the other Hart members | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the decode cache | 1.00 | 0.90 | 1.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of the Hart body | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the vector of harts | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the asserts of session | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configHarts | 0.70 | 0.60 | 0.80 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configMemory | 0.20 | 0.20 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;    openUserFiles | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    hart.reset | 0.20 | 0.10 | 0.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;**aleStart** | 0.50 | 0.40 | 0.60 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the newlib test (reads the ELF) | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the ISA string | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      load the ELF into the guest | 0.20 | 0.20 | 0.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the hart options | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the program arguments (writes the stack) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the rest of aleStart | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the tail of session | 0.10 | 0.00 | 0.10 |
| **The first slice, up to the first instruction** | 0.40 | 0.40 | 0.50 |
| &nbsp;&nbsp;  the slice call and the run setup | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;  the first three instructions | 0.40 | 0.30 | 0.50 |
| The rest of the program | 0.40 | 0.30 | 0.50 |
| The report (Retired N instructions) | 0.60 | 0.50 | 0.60 |
| The tail of the run | 0.20 | 0.10 | 0.30 |

## C++ with a 1 MiB guest memory (not the application)

To the first instruction: 16.0 ms. To the exit: 17.0 ms. The whole run: 17.2 ms, of which 0.3 ms is not in any leaf phase (each phase below the 0.1 ms resolution of the clock reads 0.00).

| Phase | Median (ms) | Min | Max |
| --- | --- | --- | --- |
| Fetch the ELF file | 0.70 | 0.60 | 1.20 |
| Fetch, compile and instantiate the module | 4.20 | 3.80 | 4.60 |
| Write the ELF into MEMFS (preRun) | 0.40 | 0.30 | 0.50 |
| The Emscripten runtime, up to main | 0.80 | 0.70 | 0.90 |
| **main, up to the return** | 9.40 | 8.80 | 10.30 |
| &nbsp;&nbsp;  parseCmdLineArgs (Boost) | 1.40 | 1.20 | 1.60 |
| &nbsp;&nbsp;  expandTargets | 0.20 | 0.10 | 0.20 |
| &nbsp;&nbsp;  the configuration file | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;  the register width (the ELF class) | 0.80 | 0.70 | 1.30 |
| &nbsp;&nbsp;**session, up to the return** | 6.90 | 6.30 | 7.80 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the primary configuration | 0.00 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;**new System** | 5.20 | 4.70 | 5.90 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Memory** | 0.50 | 0.40 | 0.60 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the PMA table (the member list) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        mmap the guest memory | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        check that the buffer is zero | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of Memory | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Core and new Hart** | 4.60 | 4.10 | 5.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the Core object and the CSR vector | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the CSR table | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        between the CSRs and the table | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        setupInstVec | 2.40 | 2.00 | 3.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the instruction name map | 0.00 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of InstTable | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the other Hart members | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the decode cache | 1.00 | 0.90 | 1.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of the Hart body | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the vector of harts | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the asserts of session | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configHarts | 0.70 | 0.60 | 0.80 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configMemory | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;    openUserFiles | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    hart.reset | 0.20 | 0.10 | 0.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;**aleStart** | 0.50 | 0.40 | 0.70 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the newlib test (reads the ELF) | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the ISA string | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      load the ELF into the guest | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the hart options | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the program arguments (writes the stack) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the rest of aleStart | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the tail of session | 0.10 | 0.00 | 0.20 |
| **The first slice, up to the first instruction** | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;  the slice call and the run setup | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;  the first three instructions | 0.40 | 0.30 | 0.40 |
| The rest of the program | 0.40 | 0.40 | 0.50 |
| The report (Retired N instructions) | 0.60 | 0.40 | 0.60 |
| The tail of the run | 0.20 | 0.10 | 0.30 |


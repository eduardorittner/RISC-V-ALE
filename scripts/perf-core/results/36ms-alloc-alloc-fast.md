# 36ms-alloc-alloc-fast — where the startup time goes

Commit: `9a8eff7`  Module: `scripts/build-whisper/.build/alloc-fast`  Repetitions: 15

Browser: Google Chrome 152.0.7977.65

## C++ as the application starts it (128 MB guest memory)

To the first instruction: 15.1 ms. To the exit: 16.3 ms. The whole run: 16.5 ms, of which 0.2 ms is not in any leaf phase (each phase below the 0.1 ms resolution of the clock reads 0.00).

| Phase | Median (ms) | Min | Max |
| --- | --- | --- | --- |
| Fetch the ELF file | 0.70 | 0.60 | 1.20 |
| Fetch, compile and instantiate the module | 4.10 | 3.90 | 7.00 |
| Write the ELF into MEMFS (preRun) | 0.40 | 0.40 | 0.50 |
| The Emscripten runtime, up to main | 0.80 | 0.60 | 1.00 |
| **main, up to the return** | 8.80 | 8.60 | 11.20 |
| &nbsp;&nbsp;  parseCmdLineArgs (Boost) | 1.30 | 1.20 | 1.40 |
| &nbsp;&nbsp;  expandTargets | 0.20 | 0.10 | 0.20 |
| &nbsp;&nbsp;  the configuration file | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;  the register width (the ELF class) | 1.20 | 0.70 | 1.70 |
| &nbsp;&nbsp;**session, up to the return** | 6.40 | 6.00 | 7.90 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the primary configuration | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;**new System** | 4.60 | 4.20 | 5.70 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Memory** | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the PMA table (the member list) | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        mmap the guest memory | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        check that the buffer is zero | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of Memory | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Core and new Hart** | 4.30 | 4.00 | 5.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the Core object and the CSR vector | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the CSR table | 0.40 | 0.30 | 0.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        between the CSRs and the table | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        setupInstVec | 2.10 | 1.90 | 3.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the instruction name map | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of InstTable | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the other Hart members | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the decode cache | 1.10 | 0.90 | 1.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of the Hart body | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the vector of harts | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the asserts of session | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configHarts | 0.70 | 0.60 | 0.90 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configMemory | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;    openUserFiles | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    hart.reset | 0.30 | 0.20 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;**aleStart** | 0.60 | 0.40 | 0.70 |
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
| The rest of the program | 0.50 | 0.30 | 0.60 |
| The report (Retired N instructions) | 0.70 | 0.60 | 0.80 |
| The tail of the run | 0.20 | 0.10 | 0.30 |

## C++ with a 64 MB guest memory (not the application)

To the first instruction: 15.2 ms. To the exit: 16.3 ms. The whole run: 16.6 ms, of which 0.2 ms is not in any leaf phase (each phase below the 0.1 ms resolution of the clock reads 0.00).

| Phase | Median (ms) | Min | Max |
| --- | --- | --- | --- |
| Fetch the ELF file | 0.70 | 0.60 | 0.90 |
| Fetch, compile and instantiate the module | 4.10 | 3.90 | 5.10 |
| Write the ELF into MEMFS (preRun) | 0.40 | 0.30 | 0.60 |
| The Emscripten runtime, up to main | 0.80 | 0.70 | 0.90 |
| **main, up to the return** | 8.90 | 8.40 | 9.70 |
| &nbsp;&nbsp;  parseCmdLineArgs (Boost) | 1.40 | 1.20 | 1.50 |
| &nbsp;&nbsp;  expandTargets | 0.10 | 0.10 | 0.20 |
| &nbsp;&nbsp;  the configuration file | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;  the register width (the ELF class) | 1.10 | 0.70 | 1.40 |
| &nbsp;&nbsp;**session, up to the return** | 6.40 | 5.90 | 7.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the primary configuration | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;**new System** | 4.50 | 4.20 | 5.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Memory** | 0.10 | 0.00 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the PMA table (the member list) | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        mmap the guest memory | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        check that the buffer is zero | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of Memory | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Core and new Hart** | 4.40 | 4.10 | 5.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the Core object and the CSR vector | 0.40 | 0.20 | 0.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the CSR table | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        between the CSRs and the table | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        setupInstVec | 2.40 | 2.00 | 2.90 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the instruction name map | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of InstTable | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the other Hart members | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the decode cache | 1.00 | 1.00 | 1.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of the Hart body | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the vector of harts | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the asserts of session | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configHarts | 0.70 | 0.60 | 0.80 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configMemory | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;    openUserFiles | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    hart.reset | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;**aleStart** | 0.60 | 0.40 | 0.70 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the newlib test (reads the ELF) | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the ISA string | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      load the ELF into the guest | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the hart options | 0.00 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the program arguments (writes the stack) | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the rest of aleStart | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the tail of session | 0.00 | 0.00 | 0.20 |
| **The first slice, up to the first instruction** | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;  the slice call and the run setup | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;  the first three instructions | 0.40 | 0.30 | 0.50 |
| The rest of the program | 0.50 | 0.40 | 0.60 |
| The report (Retired N instructions) | 0.70 | 0.60 | 0.70 |
| The tail of the run | 0.20 | 0.10 | 0.30 |

## C++ with a 16 MB guest memory (not the application)

To the first instruction: 15.3 ms. To the exit: 16.6 ms. The whole run: 16.7 ms, of which 0.2 ms is not in any leaf phase (each phase below the 0.1 ms resolution of the clock reads 0.00).

| Phase | Median (ms) | Min | Max |
| --- | --- | --- | --- |
| Fetch the ELF file | 0.70 | 0.60 | 1.00 |
| Fetch, compile and instantiate the module | 4.20 | 3.90 | 5.50 |
| Write the ELF into MEMFS (preRun) | 0.40 | 0.30 | 0.60 |
| The Emscripten runtime, up to main | 0.80 | 0.70 | 0.90 |
| **main, up to the return** | 8.90 | 8.40 | 10.20 |
| &nbsp;&nbsp;  parseCmdLineArgs (Boost) | 1.30 | 1.20 | 1.60 |
| &nbsp;&nbsp;  expandTargets | 0.20 | 0.10 | 0.20 |
| &nbsp;&nbsp;  the configuration file | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;  the register width (the ELF class) | 1.20 | 0.70 | 1.30 |
| &nbsp;&nbsp;**session, up to the return** | 6.30 | 5.80 | 7.60 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the primary configuration | 0.00 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;**new System** | 4.50 | 4.10 | 5.70 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Memory** | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the PMA table (the member list) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        mmap the guest memory | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        check that the buffer is zero | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of Memory | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Core and new Hart** | 4.40 | 4.00 | 5.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the Core object and the CSR vector | 0.30 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the CSR table | 0.40 | 0.30 | 0.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        between the CSRs and the table | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        setupInstVec | 2.30 | 2.00 | 3.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the instruction name map | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of InstTable | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the other Hart members | 0.00 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the decode cache | 1.10 | 1.00 | 1.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of the Hart body | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the vector of harts | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the asserts of session | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configHarts | 0.70 | 0.60 | 0.80 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configMemory | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;    openUserFiles | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    hart.reset | 0.20 | 0.20 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;**aleStart** | 0.50 | 0.50 | 0.60 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the newlib test (reads the ELF) | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the ISA string | 0.00 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      load the ELF into the guest | 0.30 | 0.20 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the hart options | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the program arguments (writes the stack) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the rest of aleStart | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the tail of session | 0.10 | 0.00 | 0.20 |
| **The first slice, up to the first instruction** | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;  the slice call and the run setup | 0.00 | 0.00 | 0.20 |
| &nbsp;&nbsp;  the first three instructions | 0.40 | 0.30 | 0.50 |
| The rest of the program | 0.50 | 0.40 | 0.60 |
| The report (Retired N instructions) | 0.60 | 0.50 | 0.80 |
| The tail of the run | 0.20 | 0.10 | 0.30 |

## C++ with a 4 MB guest memory (not the application)

To the first instruction: 15.3 ms. To the exit: 16.5 ms. The whole run: 16.6 ms, of which 0.2 ms is not in any leaf phase (each phase below the 0.1 ms resolution of the clock reads 0.00).

| Phase | Median (ms) | Min | Max |
| --- | --- | --- | --- |
| Fetch the ELF file | 0.70 | 0.60 | 1.30 |
| Fetch, compile and instantiate the module | 4.10 | 3.80 | 5.60 |
| Write the ELF into MEMFS (preRun) | 0.40 | 0.30 | 0.50 |
| The Emscripten runtime, up to main | 0.80 | 0.70 | 0.90 |
| **main, up to the return** | 8.90 | 8.60 | 10.10 |
| &nbsp;&nbsp;  parseCmdLineArgs (Boost) | 1.30 | 1.20 | 1.50 |
| &nbsp;&nbsp;  expandTargets | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;  the configuration file | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;  the register width (the ELF class) | 1.10 | 0.70 | 1.60 |
| &nbsp;&nbsp;**session, up to the return** | 6.40 | 6.00 | 7.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the primary configuration | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;**new System** | 4.60 | 4.30 | 5.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Memory** | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the PMA table (the member list) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        mmap the guest memory | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        check that the buffer is zero | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of Memory | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Core and new Hart** | 4.50 | 4.00 | 5.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the Core object and the CSR vector | 0.40 | 0.20 | 0.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the CSR table | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        between the CSRs and the table | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        setupInstVec | 2.30 | 2.10 | 3.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the instruction name map | 0.10 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of InstTable | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the other Hart members | 0.00 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the decode cache | 1.00 | 0.90 | 1.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of the Hart body | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the vector of harts | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the asserts of session | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configHarts | 0.70 | 0.70 | 0.80 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configMemory | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;    openUserFiles | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    hart.reset | 0.20 | 0.20 | 0.60 |
| &nbsp;&nbsp;&nbsp;&nbsp;**aleStart** | 0.50 | 0.50 | 0.60 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the newlib test (reads the ELF) | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the ISA string | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      load the ELF into the guest | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the hart options | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the program arguments (writes the stack) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the rest of aleStart | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the tail of session | 0.10 | 0.00 | 0.10 |
| **The first slice, up to the first instruction** | 0.40 | 0.40 | 0.50 |
| &nbsp;&nbsp;  the slice call and the run setup | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;  the first three instructions | 0.40 | 0.30 | 0.50 |
| The rest of the program | 0.50 | 0.40 | 0.60 |
| The report (Retired N instructions) | 0.70 | 0.50 | 0.90 |
| The tail of the run | 0.20 | 0.10 | 0.30 |

## C++ with a 1 MiB guest memory (not the application)

To the first instruction: 15.2 ms. To the exit: 16.3 ms. The whole run: 16.4 ms, of which 0.2 ms is not in any leaf phase (each phase below the 0.1 ms resolution of the clock reads 0.00).

| Phase | Median (ms) | Min | Max |
| --- | --- | --- | --- |
| Fetch the ELF file | 0.70 | 0.60 | 1.30 |
| Fetch, compile and instantiate the module | 4.10 | 3.90 | 5.90 |
| Write the ELF into MEMFS (preRun) | 0.40 | 0.30 | 0.50 |
| The Emscripten runtime, up to main | 0.80 | 0.60 | 1.00 |
| **main, up to the return** | 8.80 | 8.40 | 10.00 |
| &nbsp;&nbsp;  parseCmdLineArgs (Boost) | 1.30 | 1.30 | 1.40 |
| &nbsp;&nbsp;  expandTargets | 0.20 | 0.20 | 0.20 |
| &nbsp;&nbsp;  the configuration file | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;  the register width (the ELF class) | 1.20 | 0.70 | 1.50 |
| &nbsp;&nbsp;**session, up to the return** | 6.20 | 5.80 | 7.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the primary configuration | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;**new System** | 4.50 | 4.20 | 5.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Memory** | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the PMA table (the member list) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        mmap the guest memory | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        check that the buffer is zero | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of Memory | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**new Core and new Hart** | 4.30 | 4.10 | 5.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the Core object and the CSR vector | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the CSR table | 0.30 | 0.30 | 0.40 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        between the CSRs and the table | 0.10 | 0.10 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        setupInstVec | 2.20 | 2.00 | 3.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the instruction name map | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of InstTable | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the other Hart members | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the decode cache | 1.10 | 1.00 | 1.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the rest of the Hart body | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;        the vector of harts | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the asserts of session | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configHarts | 0.70 | 0.60 | 0.80 |
| &nbsp;&nbsp;&nbsp;&nbsp;    configMemory | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;    openUserFiles | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    hart.reset | 0.20 | 0.20 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;**aleStart** | 0.50 | 0.50 | 0.60 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the newlib test (reads the ELF) | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the ISA string | 0.10 | 0.00 | 0.20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      load the ELF into the guest | 0.20 | 0.10 | 0.30 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the hart options | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the program arguments (writes the stack) | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;      the rest of aleStart | 0.00 | 0.00 | 0.00 |
| &nbsp;&nbsp;&nbsp;&nbsp;    the tail of session | 0.10 | 0.00 | 0.20 |
| **The first slice, up to the first instruction** | 0.40 | 0.30 | 0.50 |
| &nbsp;&nbsp;  the slice call and the run setup | 0.00 | 0.00 | 0.10 |
| &nbsp;&nbsp;  the first three instructions | 0.40 | 0.20 | 0.40 |
| The rest of the program | 0.50 | 0.40 | 0.70 |
| The report (Retired N instructions) | 0.70 | 0.60 | 0.80 |
| The tail of the run | 0.20 | 0.10 | 0.30 |


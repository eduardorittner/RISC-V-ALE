# RISC-V Assembly Learn Environment

The RISC-V Assembly Learn Environment, or ALE, is an environment designed to support the execution and testing of RISC-V programs.

This page is dedicated to providing information for instructors and developers who intend to create new plug-ins and extensions for the tool.
To use RISC-V ALE, see:

- Live version: https://eduardorittner.github.io/RISC-V-ALE/#home
- More details: https://riscv-programming.org/simulator.html

## Documentation

WIP

## Development

### Clone

The simulator core and the device extensions are git submodules, so the clone
must be recursive:

```sh
git clone --recursive https://github.com/eduardorittner/RISC-V-ALE.git
cd RISC-V-ALE
```

A full recursive clone downloads roughly 500 MB, most of it the history of the
`extensions` submodule and of the SweRV-ISS oracle. For a smaller clone that is
enough to build and run:

```sh
git clone --depth 1 --shallow-submodules --recursive \
  https://github.com/eduardorittner/RISC-V-ALE.git
```

All submodule URLs are HTTPS, so no SSH key is needed.

### Prerequisites

| Tool | Version | Purpose |
| --- | --- | --- |
| Rust | stable | builds the `riscv-rs` simulator core |
| [`wasm-pack`](https://rustwasm.github.io/wasm-pack/installer/) | latest | compiles the core to WebAssembly |
| Node.js | 22 or later | test runners and the perf harness |
| Python | 3.x | the build scripts |

Install the Node dependencies once, from the repository root:

```sh
npm ci
npx playwright install --with-deps
```

### Build

```sh
make build
```

This compiles the simulator core to `modules/pkg/`, refreshes the generated
TypeScript declarations, and regenerates the service-worker precache list.

### Test

```sh
make test
```

`make test` builds first, then runs the Rust unit tests, the Vitest unit
suite, and the Playwright integration suite, in that order.

The Rust suite compares the simulator against the SweRV-ISS oracle when the
oracle is available. To make a missing oracle a failure instead of a skip:

```sh
RISCV_RS_REQUIRE_ORACLE=1 cargo test --manifest-path crates/riscv-rs/Cargo.toml
```

### Serve

The application uses module workers and WebAssembly, so it does not run from a
`file://` URL. Serve the repository root over HTTP:

```sh
npx http-server . -p 8099 -c-1
```

Then open <http://localhost:8099>.

## License

[Apache License 2.0](./LICENSE)

### Third party 
This project includes code or (wasm-compiled) objects from the following projects:

- chipsalliance/SweRV-ISS (Now [VeeR-ISS](https://github.com/chipsalliance/VeeR-ISS)): [Apache License 2.0](./modules/LICENSE_whisper) used for testing our custom emulator
- [The LLVM Project](http://llvm.org): [Apache License 2.0](./modules/LICENSE_clang_lld), compiled to wasm
- [Font Awesome Free 5.12.0](https://fontawesome.com): [License](https://fontawesome.com/license/free ) (Icons: CC BY 4.0, Fonts: SIL OFL 1.1, Code: MIT License)
- [Material Design](https://github.com/google/material-design-icons): [Apache 2.0 License](https://github.com/google/material-design-icons/blob/master/LICENSE)
- [LZString](https://github.com/pieroxy/lz-string): [MIT License](https://github.com/pieroxy/lz-string/blob/master/LICENSE)
- [Xterm.js](https://xtermjs.org/): [MIT License](https://github.com/xtermjs/xterm.js/blob/master/LICENSE)
- [Zip.js](https://gildas-lormeau.github.io/zip.js/): [BSD 3-Clause License](https://github.com/gildas-lormeau/zip.js/blob/master/LICENSE)

# Syntax Highlighting For The Assembly Source View

NOTE: This report uses the ASD-STE100 (Simplified Technical English) writing
rules. Code identifiers, file names, metric names and command options are
technical names. They stay in their original form.

## 1. Objective

The source view of the debugger tab shows the assembly file of the program as
plain text. This report answers one question: must RISC-V ALE use a syntax
highlighting library, or must it write its own highlighter?

The report recommends a custom highlighter. Section 8 gives the reason. The
reason is not size and it is not speed. The reason is that no library on the
list highlights the example programs of this project correctly, and that two
of the three libraries with a RISC-V grammar fight the layout of the view.

The report covers the branch `optimize-whisper` at commit `bd6d16c`. Section
10 records one fact about the branch `main` that the reader must know.

All measurements in this report are from 2026-10-06.

## 2. The Code Now

### 2.1 Where The Highlighting Goes

`SourceView.render` in `modules/debugger.js` draws the lines. It makes one
`div` for each line of the file, with a gutter and a text span:

```js
const code = document.createElement("span");
code.className = "dbg-src-text";
// The file is user input. Only `textContent` keeps it text.
code.textContent = lines[index];
```

That last line is the full integration point. A highlighter replaces it with a
loop that appends one span for each token. No other part of the class changes.

### 2.2 Three Properties That Control The Choice

The view has three properties. Each one removes some of the options.

1. **The view is one `div` for each line.** It is not one block of text. The
   docstring of `SourceView` gives the reason: each line carries a breakpoint
   control and the marker of the program counter. `.dbg-src-gutter` in
   `assets/css/debugger.css` is sticky for the same reason.

   A library that returns one HTML string for a whole file does not fit this
   shape. To get the lines back, the caller must cut the string at each line
   break and open again the spans that cross the cut.

2. **The file is untrusted input, and the code says so.** `textContent` keeps
   the file as text. A tokenizer that makes DOM nodes and sets `textContent`
   on each one keeps that property. Each library in section 4 returns an HTML
   string, so the caller must use `innerHTML`. The libraries escape their
   output, but the safety then comes from the library and no longer from the
   shape of the code.

3. **The view is read-only.** The only `textarea` elements of `index.html` are
   for the standard input and output and for the configuration export. The
   user does not edit assembly in the page. An editor framework therefore has
   no second use here.

## 3. What The Project Permits

| Constraint | Effect on a library |
|---|---|
| No `package.json` and no bundler | The file must be vendored, already built |
| `index.html` loads plain scripts, `modules/` holds ES modules | The file must be an ES module or a plain script |
| Offline PWA | Each file needs a line in `urlsToCache` in `service_worker.js`, and the cache number needs an increase |
| `update_cache.py` | The list rebuild is automatic, the number increase is not |
| The "Third party" section of `README.md` | Each library needs a licence record |

A library is therefore not only its bytes. It is also a cache entry, a cache
version increase and a licence record.

## 4. The Libraries

### 4.1 Sizes

Each file was downloaded and measured. The gzip column uses `gzip -9`.

| Option | Raw | Gzip | Has RISC-V? |
|---|---|---|---|
| highlight.js ES core (`es/core.min.js`) | 20 501 | 8 187 | — |
| `highlightjs-riscvasm` grammar (source) | 5 135 | — | yes |
| highlight.js full CDN bundle | 129 254 | 43 465 | **no** |
| Prism core | 58 240 | 17 423 | **no** |
| Prism `armasm` component, for scale | 1 272 | 779 | — |
| Shiki `riscv` grammar | 7 470 | 2 005 | yes |
| Shiki Oniguruma engine, inlined WASM | 622 442 | 230 502 | — |
| CodeMirror 6 `state` | 147 400 | 34 978 | — |
| CodeMirror 6 `view` | 493 290 | 118 940 | — |
| CodeMirror 6 `language` | 102 129 | 26 656 | — |

### 4.2 highlight.js

The RISC-V grammar is not in the common bundle. It is a separate package,
`highlightjs-riscvasm`, in the `highlightjs` organisation on GitHub. The
licence is CC0-1.0.

The smallest correct combination is the ES core plus that grammar: about 8 187
bytes gzip plus about 2 000 bytes gzip. That is small.

The grammar has three defects. Section 6 gives them with the test input that
shows each one.

The package is official by organisation only. The repository has 10 commits
and zero stars. A different package with the same name on npm,
`highlightjs-riscvasm@0.1.0`, is from another author and from 2019. Do not
confuse the two.

### 4.3 Prism

Prism has no RISC-V language. The published language list does not hold one.

To use Prism, the project must write the language definition itself. That is
the same work as a custom highlighter, plus 17 423 bytes gzip of a dependency,
plus a cache entry and a licence record. The `armasm` component shows the
size of such a definition: 779 bytes gzip.

Prism therefore gives nothing that a custom highlighter does not give.

### 4.4 Shiki

Shiki has a `riscv` grammar, and its coverage is the best of the three. It
knows `.ascii`, `.byte` and `.macro`, which the highlight.js grammar does not.
Its scope names separate a pseudo-instruction from a real instruction:

```
support.function.pseudo.riscv
support.function.riscv
```

The cost is the engine. Shiki matches TextMate patterns with Oniguruma, which
is a WebAssembly module of 230 502 bytes gzip. Shiki is built to highlight at
build time, not in the browser at run time. This project has no build step.

230 502 bytes is also the wrong direction for this branch. The branch
`optimize-whisper` exists to make the WebAssembly payload smaller. The commits
`9d39793`, `4ed613d` and `9a8eff7` all remove bytes or work from
`whisper.wasm`. A second WebAssembly module, four times the size of the
savings, for the colour of 50 lines of text, is not a good trade.

### 4.5 CodeMirror 6 And Monaco

CodeMirror 6 has no RISC-V mode. Its legacy `gas` mode is for the GNU
assembler, but `mkGas` accepts three architectures only:

```js
if (arch === "x86") {
  x86();
} else if (arch === "arm" || arch === "armv6") {
```

So the project must write the RISC-V part itself, and then also carry about
180 574 bytes gzip of editor framework.

Monaco has no RISC-V language either, and it is larger again.

Both are text editors. Section 2.2 shows that the view is read-only. An editor
framework here buys an editor that nobody uses.

## 5. Speed Is Not A Reason

A synthetic file of 5 000 lines was built from `data/examples/string_reverse.s`
and highlighted 10 to 20 times.

| Highlighter | Time for 5 000 lines |
|---|---|
| A hand-written tokenizer | 1.62 ms |
| highlight.js with the RISC-V grammar | 14.30 ms |

The custom tokenizer is about 9 times as fast. The number does not matter.

The example programs are 36, 53 and 25 lines. At 50 lines the two figures are
about 0.016 ms and 0.14 ms. Both are far below one frame. **Do not choose on
speed.** Choose on correctness and on fit.

One note for a later phase: the view makes about three DOM nodes for each line
now, and a highlighter makes about eight. A file of 5 000 lines then holds
about 40 000 nodes. If such a file must ever open, the answer is to draw only
the visible lines, and not to make the highlighter faster.

## 6. Three Defects In The highlight.js Grammar

Each defect below was reproduced against `src/riscvasm.js` of
`highlightjs/highlightjs-riscvasm`.

### 6.1 It Does Not Know `.ascii`

The `DIRECTIVES` list has no `.ascii`. The input is real, from
`data/examples/hello.s`:

```
    .section .rodata
message:
    .ascii  "Hello from RISC-V ALE!\n"
    .align  2
```

The output gives `.section`, `.rodata` and `.align` the scope `meta`, and
leaves `.ascii` with no scope at all.

`.byte`, `.space` and `.skip` are also absent. The list holds `.marco`, which
is a spelling error for `.macro`.

`.ascii` is in two of the three example programs. The grammar therefore fails
on the first file that a user opens.

### 6.2 It Throws Away The Pseudo-Instruction Distinction

The grammar builds three lists, `MNEMONICS`, `PSEUDOS` and `PRIVILEGED`. Then
it joins them:

```js
const KEYWORD = MNEMONICS.concat(PSEUDOS).concat(PRIVILEGED);
```

`KEYWORD` goes to one scope, `keyword`. So `la`, `li`, `mv`, `j` and `ret` get
the same colour as `addi` and `lw`.

For RISC-V ALE this is the wrong result. The tool teaches assembly. "This
instruction is not real, the assembler expands it into one or more real
instructions" is one of the first things a RISC-V course gives. The grammar
holds the data that shows it, and then discards the data.

### 6.3 Its Label Rule Crosses Line Boundaries

The label rule starts with `^\s*`. In a multi-line buffer, `\s*` takes in the
line break before the label. The output of `hljs.highlight` on `hello.s` holds
this:

```html
<span class="hljs-symbol">
_start:</span>
```

A span that holds a line break does not fit a view that makes one `div` for
each line. To avoid it, the caller must highlight each line on its own, which
then breaks a block comment that covers more than one line.

## 7. What A Custom Highlighter Costs

The measured tokenizer is one regular expression with alternation groups,
three `Set` objects, and a loop:

```js
const TOK = /(\s+)|(#.*$)|("(?:[^"\\]|\\.)*")|(\.[A-Za-z_][\w.]*)|([A-Za-z_.$][\w.$]*:)|(-?\b(?:0x[0-9a-fA-F]+|0b[01]+|\d+)\b)|([A-Za-z_.$][\w.$]*)|(.)/g;
```

That version is about 20 lines plus the word lists. With the full RV32IMAFD
lists, count 150 to 200 lines of JavaScript and about 30 lines of CSS.

It gives four things that no library on the list gives here:

1. **It keeps `textContent`.** It makes DOM nodes and never an HTML string, so
   the safety property of section 2.2 stays in the shape of the code.
2. **It writes into the per-line structure that already exists.** No whole
   file highlighting, and no cut of an HTML string at each line break.
3. **The project owns the token classes.** A pseudo-instruction against a real
   instruction. A known directive against an unknown one. An ABI register name
   (`t0`) against a numbered name (`x5`). The last one matters because whisper
   prints the numbered form in its own output, so the two forms meet on screen.
4. **One tokenizer can serve a second pane.** A disassembly listing wants the
   same mnemonic and register rules.

The cost is that the project owns the instruction lists. That cost is small
and it is fixed. `clang_worker.js` pins the feature set to `+m +a +f +d` with
no `+c`, so the list does not grow by itself.

## 8. Recommendation

**Write a custom highlighter.**

Not because it is smaller, and not because it is faster. At 50 lines no option
is measurably either. Write it for these four reasons:

1. No library on the list highlights the example programs of this project
   correctly without a change by hand.
2. The two libraries that have a RISC-V grammar both fight the per-line
   layout, and that layout exists for the breakpoints.
3. The distinction that a learning tool most wants to show is the distinction
   that the available highlight.js grammar discards: a pseudo-instruction
   against a real instruction.
4. A library here costs a vendored file, a cache entry, a cache number
   increase and a licence record, for a result that the project must then
   correct.

The honest alternative, if the project prefers a library: take the
highlight.js ES core at 8 187 bytes gzip, vendor the `riscvasm` grammar as a
local file, and correct `.ascii`, `.macro` and the pseudo-instruction split by
hand. At that point the project owns a fork of a word list of 130 lines, plus
8 187 bytes, plus a cache entry, and it still highlights whole files and not
lines. That is more work than the tokenizer, not less.

## 9. Notes For The Person Who Writes It

1. **Tokenize one line at a time.** The view already holds the lines apart.
   This also removes the defect of section 6.3 by construction.
2. **A comment starts with `#`.** The GNU assembler for RISC-V uses `#` for a
   line comment. `/* */` covers more than one line, so the tokenizer needs one
   state bit that carries from one line to the next, or the project can accept
   that a block comment is not highlighted.
3. **Do not highlight an unknown word as an instruction.** A word that is in
   no list is a symbol. A wrong colour on a symbol teaches the wrong thing.
4. **Mark an unknown directive.** A word that starts with `.` and is in no
   list is probably a spelling error by the user. A separate class for it is
   free, and it is a real help to a student.
5. **Keep the token classes out of the Bootstrap namespace.** The existing
   classes use the prefix `dbg-`. Use `dbg-tok-` or a similar prefix.
6. **Do not colour the gutter from the tokenizer.** The gutter holds the
   breakpoint control and the marker of the program counter. Those come from
   the session state, not from the text.

## 10. Out Of Scope: The Debugger On The Branch `main`

This report covers `optimize-whisper` only, but the reader must know one fact.

`modules/debugger.js` does not exist at the merge base of the two branches,
`3ce049c`. Each branch then built one:

* `origin/main` has a file of 26 491 bytes, from about 10 commits.
* `optimize-whisper` has a file of 7 626 bytes, from `bc36a4b` and `bd6d16c`.

They are independent. They will conflict.

The file on `main` already holds a custom RISC-V highlighter, `highlightAsm`.
It serves the disassembly pane. So the project already made this build-or-buy
decision one time, and it made it the same way that section 8 recommends.

`highlightAsm` cannot be reused for the source view as it is written. It
chains `String.prototype.replace` over already escaped HTML, so the number
rule matches the digits inside an HTML entity:

```
input:   addi a0, a0, 1 # don't
output:  ... # don&#<span class="asm-imm">039</span>;t
```

That text draws as `don&#039;t`. The defect is harmless in a disassembly
listing, which holds no apostrophe. It is not harmless in a source file.

When the two branches meet, the correct end state is one tokenizer that makes
DOM nodes, used by the source view and by the disassembly pane. That work
needs its own report.

## 11. How To Repeat The Measurements

```sh
# Sizes
curl -sL <url> | wc -c
curl -sL <url> | gzip -9 | wc -c

# The grammar under test
curl -sL https://raw.githubusercontent.com/highlightjs/highlightjs-riscvasm/main/src/riscvasm.js
```

The speed figures used Node v26.7.0 on darwin 25.2.0, with a file of 5 000
lines built by repetition of `data/examples/string_reverse.s`, and with
`performance.now` around 10 passes for highlight.js and 20 passes for the
tokenizer.

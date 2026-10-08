/*jshint esversion: 9 */

/**
 * A syntax highlighter for RISC-V assembly.
 *
 * The module makes DOM nodes and it never makes an HTML string. The file that
 * it reads is user input, so each piece of text goes in a node through
 * `textContent`. The safety property stays in the shape of the code, and it
 * does not come from the escape rules of a library.
 *
 * The module reads one line at a time, because the source view holds one
 * `div` for each line. Only a block comment covers more than one line, and
 * the state object carries that one bit from a line to the line after it.
 *
 * The instruction lists hold RV32IMAFD with Zicsr and Zifencei, which is the
 * set that `clang_worker.js` gives to the assembler (`+m +a +f +d`, and no
 * `+c`). A word that is in no list is a symbol, and it keeps the colour of
 * plain text: a wrong colour on a symbol teaches the wrong thing.
 */

/* ─── The CSS classes ────────────────────────────────────────────────────── */

/**
 * The class of each kind of token. The prefix `dbg-tok-` keeps the names out
 * of the namespace of Bootstrap. A token with no class is plain text, which
 * is a symbol, an operator or a separator.
 */
const CLASS_COMMENT = "dbg-tok-comment";
const CLASS_TEXT = "dbg-tok-text";
const CLASS_NUMBER = "dbg-tok-number";
const CLASS_LABEL = "dbg-tok-label";
const CLASS_INSTRUCTION = "dbg-tok-instruction";
const CLASS_PSEUDO = "dbg-tok-pseudo";
const CLASS_REGISTER = "dbg-tok-register";
const CLASS_REGISTER_NUMBER = "dbg-tok-register-number";
const CLASS_DIRECTIVE = "dbg-tok-directive";
const CLASS_DIRECTIVE_UNKNOWN = "dbg-tok-directive-unknown";
const CLASS_MODIFIER = "dbg-tok-modifier";

/* ─── The word lists ─────────────────────────────────────────────────────── */

/**
 * The instructions that the processor runs. The assembler puts one word in
 * memory for each one of them.
 *
 * @type {Set<string>}
 */
const REAL_INSTRUCTIONS = new Set([
  // RV32I
  "lui", "auipc", "jal", "jalr",
  "beq", "bne", "blt", "bge", "bltu", "bgeu",
  "lb", "lh", "lw", "lbu", "lhu", "sb", "sh", "sw",
  "addi", "slti", "sltiu", "xori", "ori", "andi", "slli", "srli", "srai",
  "add", "sub", "sll", "slt", "sltu", "xor", "srl", "sra", "or", "and",
  "fence", "fence.i", "ecall", "ebreak", "pause",
  // Zicsr
  "csrrw", "csrrs", "csrrc", "csrrwi", "csrrsi", "csrrci",
  // M
  "mul", "mulh", "mulhsu", "mulhu", "div", "divu", "rem", "remu",
  // A. The order suffixes `.aq`, `.rl` and `.aqrl` come off before the test.
  "lr.w", "sc.w", "amoswap.w", "amoadd.w", "amoxor.w", "amoand.w", "amoor.w",
  "amomin.w", "amomax.w", "amominu.w", "amomaxu.w",
  // F
  "flw", "fsw",
  "fmadd.s", "fmsub.s", "fnmsub.s", "fnmadd.s",
  "fadd.s", "fsub.s", "fmul.s", "fdiv.s", "fsqrt.s",
  "fsgnj.s", "fsgnjn.s", "fsgnjx.s", "fmin.s", "fmax.s",
  "fcvt.w.s", "fcvt.wu.s", "fcvt.s.w", "fcvt.s.wu",
  "fmv.x.w", "fmv.w.x", "feq.s", "flt.s", "fle.s", "fclass.s",
  // D
  "fld", "fsd",
  "fmadd.d", "fmsub.d", "fnmsub.d", "fnmadd.d",
  "fadd.d", "fsub.d", "fmul.d", "fdiv.d", "fsqrt.d",
  "fsgnj.d", "fsgnjn.d", "fsgnjx.d", "fmin.d", "fmax.d",
  "fcvt.s.d", "fcvt.d.s", "fcvt.w.d", "fcvt.wu.d", "fcvt.d.w", "fcvt.d.wu",
  "feq.d", "flt.d", "fle.d", "fclass.d",
  // Privileged
  "mret", "sret", "uret", "dret", "wfi", "sfence.vma"
]);

/**
 * The instructions that the processor does not have. The assembler expands
 * each one into one or more real instructions.
 *
 * The source view gives this set its own colour, because "this instruction is
 * not real" is one of the first things that a course on assembly teaches.
 *
 * @type {Set<string>}
 */
const PSEUDO_INSTRUCTIONS = new Set([
  "nop", "li", "la", "lla", "lga", "mv", "not", "neg",
  "seqz", "snez", "sltz", "sgtz",
  "beqz", "bnez", "blez", "bgez", "bltz", "bgtz",
  "bgt", "ble", "bgtu", "bleu",
  "j", "jr", "ret", "call", "tail",
  "csrr", "csrw", "csrs", "csrc", "csrwi", "csrsi", "csrci",
  "rdinstret", "rdinstreth", "rdcycle", "rdcycleh", "rdtime", "rdtimeh",
  "frcsr", "fscsr", "frrm", "fsrm", "fsrmi", "frflags", "fsflags", "fsflagsi",
  "fmv.s", "fabs.s", "fneg.s", "fmv.d", "fabs.d", "fneg.d"
]);

/**
 * The directives of the assembler. A word that starts with a point, that is
 * in the first position of a statement and that is not in this set, is
 * probably a spelling error. The view marks it, which is a help to a student.
 *
 * @type {Set<string>}
 */
const DIRECTIVES = new Set([
  ".2byte", ".4byte", ".8byte",
  ".align", ".ascii", ".asciiz", ".asciz", ".attribute",
  ".balign", ".bss", ".byte",
  ".comm", ".data", ".double", ".dword",
  ".else", ".elseif", ".end", ".endif", ".endm", ".endr", ".equ", ".err",
  ".file", ".fill", ".float",
  ".global", ".globl", ".half", ".hidden",
  ".ident", ".if", ".ifdef", ".ifndef", ".incbin", ".include", ".insn",
  ".internal",
  ".lcomm", ".loc", ".local",
  ".macro",
  ".option", ".org",
  ".p2align", ".popsection", ".previous", ".protected", ".pushsection",
  ".quad", ".rept",
  ".section", ".set", ".size", ".skip", ".sleb128", ".space", ".string",
  ".struct", ".subsection",
  ".text", ".type",
  ".uleb128", ".weak", ".word", ".zero"
]);

/**
 * The prefix of the call frame information directives. A debug build makes
 * many of them and they all have the same shape, so one test on the prefix
 * takes the place of 30 names in the set above.
 */
const CFI_PREFIX = ".cfi_";

/**
 * The names that the ABI gives to the registers.
 * @type {Set<string>}
 */
const ABI_REGISTERS = new Set(["zero", "ra", "sp", "gp", "tp", "fp"]);

/**
 * The names that give the number of the register. Whisper prints this form in
 * its own output, so the two forms of one register meet on the screen.
 * @type {Set<string>}
 */
const NUMBERED_REGISTERS = new Set();

for (let i = 0; i <= 6; i++) ABI_REGISTERS.add("t" + i);
for (let i = 0; i <= 7; i++) ABI_REGISTERS.add("a" + i);
for (let i = 0; i <= 7; i++) ABI_REGISTERS.add("fa" + i);
for (let i = 0; i <= 11; i++) ABI_REGISTERS.add("s" + i);
for (let i = 0; i <= 11; i++) ABI_REGISTERS.add("ft" + i);
for (let i = 0; i <= 11; i++) ABI_REGISTERS.add("fs" + i);
for (let i = 0; i <= 31; i++) NUMBERED_REGISTERS.add("x" + i);
for (let i = 0; i <= 31; i++) NUMBERED_REGISTERS.add("f" + i);

/* ─── The tokenizer ──────────────────────────────────────────────────────── */

/**
 * One token of one line.
 *
 * @typedef {Object} AsmToken
 * @property {string} text the characters of the token
 * @property {?string} css_class the CSS class, or null for plain text
 */

/**
 * The state that goes from one line to the line after it.
 *
 * @typedef {Object} AsmState
 * @property {boolean} in_block_comment true in the middle of a block comment
 */

/**
 * The pattern of one token. The order of the parts is the order of the tests:
 * a label comes before a directive, because `.L1:` is a label and not a
 * directive, and a directive comes before a word, because a word can also
 * start with a point.
 *
 * The last part takes one character, so that each position of the line gives
 * a match and the loop always moves forward.
 */
const TOKEN = new RegExp([
  /(?<space>\s+)/,
  /(?<line_comment>#[^\n]*|\/\/[^\n]*)/,
  /(?<block_open>\/\*)/,
  /(?<text>"(?:[^"\\]|\\.)*"?|'(?:\\.|[^'\\])'?)/,
  /(?<label>[A-Za-z_.$][\w.$]*:|[0-9]+:)/,
  /(?<dotted>\.[A-Za-z_][\w.$]*)/,
  /(?<modifier>%[A-Za-z_]\w*)/,
  /(?<number>-?(?:0[xX][0-9a-fA-F]+|0[bB][01]+|[0-9]+))/,
  /(?<word>[A-Za-z_.$][\w.$]*)/,
  /(?<other>[\s\S])/
].map(part => part.source).join("|"), "g");

/** The order suffix of an atomic instruction, which the test removes. */
const ORDER_SUFFIX = /\.(?:aq|rl|aqrl)$/;

/** The text that closes a block comment. */
const BLOCK_END = "*/";

/**
 * Give a new state for a new file.
 *
 * @returns {AsmState}
 */
export function new_asm_state() {
  return {in_block_comment: false};
}

/**
 * The class of a word in the first position of a statement.
 *
 * @param {string} word
 * @returns {?string} null for a word that is in no list, which is a symbol
 */
function mnemonic_class(word) {
  const name = word.toLowerCase().replace(ORDER_SUFFIX, "");
  if (PSEUDO_INSTRUCTIONS.has(name)) return CLASS_PSEUDO;
  if (REAL_INSTRUCTIONS.has(name)) return CLASS_INSTRUCTION;
  return null;
}

/**
 * The class of a word in the operand position.
 *
 * @param {string} word
 * @returns {?string} null for a word that is not a register, which is a symbol
 */
function operand_class(word) {
  const name = word.toLowerCase();
  if (ABI_REGISTERS.has(name)) return CLASS_REGISTER;
  if (NUMBERED_REGISTERS.has(name)) return CLASS_REGISTER_NUMBER;
  return null;
}

/**
 * Add `text` to `tokens` with the class `css_class`.
 *
 * Two pieces of plain text that touch become one token. A space and the comma
 * after it then make one text node and not two, which keeps the number of
 * nodes of the view near to the number before the highlighter.
 *
 * @param {AsmToken[]} tokens
 * @param {string} text
 * @param {?string} css_class
 */
function add(tokens, text, css_class) {
  const last = tokens.length === 0 ? null : tokens[tokens.length - 1];
  if (css_class === null && last !== null && last.css_class === null) {
    last.text += text;
    return;
  }
  tokens.push({text: text, css_class: css_class});
}

/**
 * Cut one line into tokens.
 *
 * The function reads `state` and writes it, so the caller must give the same
 * object to each line of one file, and a new object for a new file.
 *
 * @param {string} line one line of the file, with no line break
 * @param {AsmState} state the state after the line before this one
 * @returns {AsmToken[]}
 */
export function tokenize_asm_line(line, state) {
  const tokens = [];
  let position = 0;

  // The end of a block comment that another line opened.
  if (state.in_block_comment) {
    const end = line.indexOf(BLOCK_END);
    if (end === -1) {
      if (line !== "") add(tokens, line, CLASS_COMMENT);
      return tokens;
    }
    add(tokens, line.slice(0, end + BLOCK_END.length), CLASS_COMMENT);
    state.in_block_comment = false;
    position = end + BLOCK_END.length;
  }

  // True while no instruction and no directive came on this line yet. Only in
  // that position is a word a mnemonic. In every other position a word is an
  // operand, so `add` in `la t0, add` stays a symbol.
  let at_statement_start = true;
  TOKEN.lastIndex = position;
  let match;
  while ((match = TOKEN.exec(line)) !== null) {
    const part = match.groups;
    const text = match[0];

    if (part.space !== undefined) {
      add(tokens, text, null);
      continue;
    }
    if (part.line_comment !== undefined) {
      add(tokens, text, CLASS_COMMENT);
      continue;
    }
    if (part.block_open !== undefined) {
      const end = line.indexOf(BLOCK_END, match.index + text.length);
      if (end === -1) {
        add(tokens, line.slice(match.index), CLASS_COMMENT);
        state.in_block_comment = true;
        break;
      }
      add(tokens, line.slice(match.index, end + BLOCK_END.length), CLASS_COMMENT);
      TOKEN.lastIndex = end + BLOCK_END.length;
      continue;
    }
    if (part.label !== undefined) {
      // A label does not end the first position: an instruction can come
      // after it on the same line.
      add(tokens, text, CLASS_LABEL);
      continue;
    }

    if (part.text !== undefined) {
      add(tokens, text, CLASS_TEXT);
    } else if (part.dotted !== undefined) {
      // In the operand position a word with a point is the name of a section
      // or of a symbol, as `.rodata` in `.section .rodata`, and not a
      // directive.
      if (!at_statement_start) {
        add(tokens, text, null);
      } else {
        const name = text.toLowerCase();
        const known = DIRECTIVES.has(name) || name.startsWith(CFI_PREFIX);
        add(tokens, text, known ? CLASS_DIRECTIVE : CLASS_DIRECTIVE_UNKNOWN);
      }
    } else if (part.modifier !== undefined) {
      add(tokens, text, CLASS_MODIFIER);
    } else if (part.number !== undefined) {
      add(tokens, text, CLASS_NUMBER);
    } else if (part.word !== undefined) {
      add(tokens, text,
          at_statement_start ? mnemonic_class(text) : operand_class(text));
    } else {
      // A semicolon ends a statement, so the word after it is a mnemonic.
      add(tokens, text, null);
      if (text === ";") {
        at_statement_start = true;
        continue;
      }
    }
    at_statement_start = false;
  }
  return tokens;
}

/**
 * Draw one line of assembly in `element`.
 *
 * @param {HTMLElement} element the element that takes the nodes
 * @param {string} line one line of the file, with no line break
 * @param {AsmState} state the state after the line before this one
 */
export function highlight_asm_line(element, line, state) {
  for (const token of tokenize_asm_line(line, state)) {
    if (token.css_class === null) {
      element.appendChild(document.createTextNode(token.text));
      continue;
    }
    const span = document.createElement("span");
    span.className = token.css_class;
    // The file is user input. Only `textContent` keeps it text.
    span.textContent = token.text;
    element.appendChild(span);
  }
}

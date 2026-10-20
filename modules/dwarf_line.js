/*jshint esversion: 9 */

/**
 * The map between a line of an assembly file and the address of its
 * instruction.
 *
 * The debugger needs both directions: a breakpoint on a line needs the
 * address, and the program counter of a stop needs the line.
 *
 * The map comes from the program itself. The assembler of RISC-V ALE does not
 * take `-g` (it answers `unknown argument`), so `instrument_source` writes the
 * `.file` and `.loc` directives into a copy of the source. The assembler then
 * builds a DWARF line table of its own, the linker puts the final addresses in
 * it, and `read_line_table` reads it out of the ELF file.
 */

/** The number that the injected `.file` directive gives to the source file. */
const FILE_INDEX = 1;

/** A line that opens a section, and the name of that section. */
const SECTION_PATTERN = /^\s*\.(section\s+("?)([.\w,@%-]+)\2|text|data|rodata|bss)\b/;

/** A line that already carries line information of its own. */
const HAS_DEBUG_INFO = /^\s*\.(file|loc)\b/m;

/**
 * Write `.file` and `.loc` directives into a copy of an assembly file, so that
 * the assembler builds a line table for it.
 *
 * A `.loc` directive goes in front of each line of a text section, on the same
 * line and before a `;`, which is the separator of two statements. The copy
 * therefore has the line numbers of the file, and the assembler names a line
 * of the file in a message about an error. The `.file` directive goes in front
 * of the first line for the same reason.
 *
 * The assembler writes a row of the line table for each directive, and the
 * rows of a run of empty lines and comments all carry the address of the
 * instruction that comes after them. The last row of an address is therefore
 * the row of its instruction, and `read_line_table` keeps that one.
 *
 * Only a text section gets the directives. A `.loc` has no meaning for the
 * bytes of a data section, and the debugger stops at instructions only.
 *
 * @param {string} text the contents of the assembly file
 * @param {string} name the file name, which goes in the `.file` directive
 * @returns {?string} the copy, or null when the file carries its own `.file`
 *   or `.loc` directives, which the directives of this function would break
 */
export function instrument_source(text, name){
  if(HAS_DEBUG_INFO.test(text)) return null;
  const lines = text.split("\n");
  // The name goes in a C string. A quotation mark or a backslash in a file
  // name would end it early.
  const quoted = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const out = [];
  let in_text = true;   // An assembly file starts in .text.
  for(let index = 0; index < lines.length; index++){
    const line = lines[index];
    const section = SECTION_PATTERN.exec(line);
    if(section){
      const target = section[3] || section[1];
      in_text = target === "text" || target === ".text" || target.startsWith(".text.");
    }
    let head = index === 0? `.file ${FILE_INDEX} "${quoted}"; ` : "";
    if(in_text) head += `.loc ${FILE_INDEX} ${index + 1} 0; `;
    out.push(head + line);
  }
  return out.join("\n");
}

/**
 * A reader of the little-endian numbers of DWARF.
 */
class Cursor {
  /** @param {Uint8Array} bytes */
  constructor(bytes, offset = 0){
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.at = offset;
  }

  get done(){ return this.at >= this.bytes.length; }

  u8(){ return this.bytes[this.at++]; }
  i8(){ const v = this.view.getInt8(this.at); this.at += 1; return v; }
  u16(){ const v = this.view.getUint16(this.at, true); this.at += 2; return v; }
  u32(){ const v = this.view.getUint32(this.at, true); this.at += 4; return v; }

  /** An unsigned number of a variable length. */
  uleb(){
    let result = 0, shift = 0, byte;
    do {
      byte = this.bytes[this.at++];
      result += (byte & 0x7f) * Math.pow(2, shift);
      shift += 7;
    } while(byte & 0x80);
    return result;
  }

  /** A signed number of a variable length. */
  sleb(){
    let result = 0, shift = 0, byte;
    do {
      byte = this.bytes[this.at++];
      result += (byte & 0x7f) * Math.pow(2, shift);
      shift += 7;
    } while(byte & 0x80);
    if(byte & 0x40) result -= Math.pow(2, shift);
    return result;
  }

  /** An address of `size` bytes. */
  address(size){
    let value = 0;
    for(let i = 0; i < size; i++) value += this.bytes[this.at++] * Math.pow(2, 8*i);
    return value;
  }

  /** A C string. */
  text(){
    const start = this.at;
    while(this.bytes[this.at] !== 0) this.at++;
    const value = new TextDecoder().decode(this.bytes.subarray(start, this.at));
    this.at++;
    return value;
  }
}

/**
 * The sections of a 32 bit little-endian ELF file.
 *
 * @param {Uint8Array} bytes
 * @returns {Map<string, Uint8Array>} the contents of each section, by name
 */
function elf_sections(bytes){
  const sections = new Map();
  if(bytes.length < 0x34) return sections;
  if(!(bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46)){
    return sections;   // Not an ELF file.
  }
  if(bytes[4] !== 1 || bytes[5] !== 1) return sections;  // Not 32 bit little-endian.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sh_off = view.getUint32(0x20, true);
  const sh_size = view.getUint16(0x2E, true);
  const sh_num = view.getUint16(0x30, true);
  const sh_strndx = view.getUint16(0x32, true);
  if(sh_off === 0 || sh_num === 0) return sections;
  const names_off = view.getUint32(sh_off + sh_strndx*sh_size + 0x10, true);
  for(let i = 0; i < sh_num; i++){
    const base = sh_off + i*sh_size;
    const name_at = names_off + view.getUint32(base, true);
    let end = name_at;
    while(bytes[end] !== 0) end++;
    const name = new TextDecoder().decode(bytes.subarray(name_at, end));
    const type = view.getUint32(base + 0x04, true);
    const offset = view.getUint32(base + 0x10, true);
    const size = view.getUint32(base + 0x14, true);
    const SHT_NOBITS = 8;
    if(type === SHT_NOBITS) continue;
    sections.set(name, bytes.subarray(offset, offset + size));
  }
  return sections;
}

/**
 * Read one unit of a DWARF line program and add its rows to `rows`.
 *
 * @param {Cursor} cursor at the first byte of the unit
 * @param {Array<{address: number, file: string, line: number, end: boolean}>} rows
 * @returns {boolean} false when the unit is one that this reader cannot take
 */
function read_unit(cursor, rows){
  const start = cursor.at;
  const unit_length = cursor.u32();
  if(unit_length === 0xffffffff) return false;   // 64 bit DWARF.
  const unit_end = cursor.at + unit_length;
  const version = cursor.u16();
  if(version < 2 || version > 4){
    cursor.at = unit_end;      // DWARF 5 has another header. Skip the unit.
    return true;
  }
  const header_length = cursor.u32();
  const program_start = cursor.at + header_length;
  const min_inst_length = cursor.u8();
  if(version >= 4) cursor.u8();                  // max operations per instruction
  const default_is_stmt = cursor.u8();
  const line_base = cursor.i8();
  const line_range = cursor.u8();
  const opcode_base = cursor.u8();
  const standard_lengths = [0];
  for(let i = 1; i < opcode_base; i++) standard_lengths.push(cursor.u8());

  while(cursor.text() !== "");                   // The include directories.
  const files = [null];                          // Index 0 is not a file.
  for(;;){
    const name = cursor.text();
    if(name === "") break;
    cursor.uleb(); cursor.uleb(); cursor.uleb(); // directory, time, length
    files.push(name);
  }

  cursor.at = program_start;
  let address = 0, file = 1, line = 1;
  const emit = (end) => {
    rows.push({address, file: files[file] || "", line, end: !!end});
  };
  const reset = () => { address = 0; file = 1; line = 1; };

  while(cursor.at < unit_end){
    const opcode = cursor.u8();
    if(opcode >= opcode_base){
      const adjusted = opcode - opcode_base;
      address += min_inst_length * Math.floor(adjusted / line_range);
      line += line_base + (adjusted % line_range);
      emit(false);
      continue;
    }
    switch(opcode){
      case 0: {                                  // An extended opcode.
        const length = cursor.uleb();
        const next = cursor.at + length;
        const sub = cursor.u8();
        if(sub === 1){                           // DW_LNE_end_sequence
          emit(true);
          reset();
        }else if(sub === 2){                     // DW_LNE_set_address
          address = cursor.address(length - 1);
        }
        cursor.at = next;
        break;
      }
      case 1: emit(false); break;                // DW_LNS_copy
      case 2: address += min_inst_length * cursor.uleb(); break;
      case 3: line += cursor.sleb(); break;
      case 4: file = cursor.uleb(); break;
      case 5: cursor.uleb(); break;              // column
      case 6: break;                             // negate is_stmt
      case 7: break;                             // basic block
      case 8:                                    // DW_LNS_const_add_pc
        address += min_inst_length * Math.floor((255 - opcode_base) / line_range);
        break;
      case 9: address += cursor.u16(); break;    // DW_LNS_fixed_advance_pc
      default:
        for(let i = 0; i < standard_lengths[opcode]; i++) cursor.uleb();
        break;
    }
  }
  cursor.at = unit_end;
  void default_is_stmt;
  void start;
  return true;
}

/**
 * The line table of a linked ELF file.
 *
 * The assembler writes one row for each `.loc` directive, and a run of empty
 * lines and comments before an instruction therefore leaves several rows at
 * the address of that instruction. The row of the instruction is the last of
 * them, so a row that comes later at the same address replaces the one before
 * it.
 *
 * A row holds for every address from its own to the address of the next row.
 * A line that becomes more than one instruction, such as `li` with a large
 * number, has one row and two addresses, and `line_of` answers for both.
 *
 * @param {Uint8Array} elf the contents of the ELF file
 * @returns {{
 *   entries: Array<{address: number, file: string, line: number, end: boolean}>,
 *   line_to_address: Map<string, Map<number, number>>,
 *   line_of: function(number): ?{file: string, line: number},
 *   rows: number
 * }}
 */
export function read_line_table(elf){
  const rows = [];
  const sections = elf_sections(elf);
  const debug_line = sections.get(".debug_line");
  if(debug_line && debug_line.length > 0){
    const cursor = new Cursor(debug_line);
    while(!cursor.done){
      const before = cursor.at;
      if(!read_unit(cursor, rows)) break;
      if(cursor.at <= before) break;             // A unit of length zero.
    }
  }

  // One row for each address: the last one, which is the row of the
  // instruction. An end-of-sequence row counts only where it stands alone,
  // because it is the address after the last instruction.
  const by_address = new Map();
  for(const row of rows){
    if(row.end && by_address.has(row.address)) continue;
    by_address.set(row.address, row);
  }
  const entries = [...by_address.values()].sort((a, b) => a.address - b.address);

  const line_to_address = new Map();
  for(const row of entries){
    if(row.end) continue;
    if(!line_to_address.has(row.file)) line_to_address.set(row.file, new Map());
    const lines = line_to_address.get(row.file);
    // A line with more than one address keeps the first one, which is where a
    // breakpoint on that line belongs.
    if(!lines.has(row.line) || lines.get(row.line) > row.address){
      lines.set(row.line, row.address);
    }
  }

  /**
   * The line that holds `address`, or null when the address is outside the
   * program.
   *
   * @param {number} address
   */
  function line_of(address){
    let low = 0, high = entries.length - 1, found = -1;
    while(low <= high){
      const middle = (low + high) >> 1;
      if(entries[middle].address <= address){
        found = middle;
        low = middle + 1;
      }else{
        high = middle - 1;
      }
    }
    if(found < 0) return null;
    const row = entries[found];
    if(row.end) return null;
    return {file: row.file, line: row.line};
  }

  return {entries, line_to_address, line_of, rows: rows.length};
}

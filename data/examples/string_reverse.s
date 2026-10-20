# string_reverse.s -- Turn a string around in memory, then write it out.
#
# The program changes bytes and not words, so the memory pane marks one byte
# at a time.
#
# Try this: put a breakpoint on "swap_loop" and type "t0" in the address box
# of the memory pane, which puts the text at the top of the pane. Press run
# again and again. Two bytes trade places on each pass, and the pane marks
# them in the hex column and in the text column.

# The text is in .data and not in .rodata, because the program writes to it.
    .section .data
text:
    .ascii  "!ELA V-CSIR"
text_end:
    .ascii  "\n"
line_end:

# The length is a word in memory and not an immediate. The assembler keeps the
# difference of two labels relocatable until it lays the section out, so "li"
# cannot take it, but ".word" can.
    .align  2
write_len:
    .word   line_end - text

    .section .text
    .globl _start

_start:
    la      t0, text            # left index
    la      t1, text_end
    addi    t1, t1, -1          # right index, the last letter

swap_loop:
    bge     t0, t1, swap_done
    lbu     t2, 0(t0)
    lbu     t3, 0(t1)
    sb      t3, 0(t0)
    sb      t2, 0(t1)
    addi    t0, t0, 1
    addi    t1, t1, -1
    j       swap_loop

swap_done:
    li      a0, 1               # fd = 1, the standard output
    la      a1, text
    la      t4, write_len
    lw      a2, 0(t4)           # the text and the newline after it
    li      a7, 64
    ecall

    li      a0, 0
    li      a7, 93
    ecall

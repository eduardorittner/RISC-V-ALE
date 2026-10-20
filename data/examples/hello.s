# hello.s -- Write a string to the standard output.
#
# The program shows the two syscalls that every example here uses:
#   a7 = 64  write(fd, buffer, length)
#   a7 = 93  exit(code)
#
# Try this: put a breakpoint on the "ecall" of the write and look at a0, a1
# and a2 in the register pane. a1 holds the address of the text, so type "a1"
# in the address box of the memory pane and read the string in its text
# column.

    .section .rodata
message:
    .ascii  "Hello from RISC-V ALE!\n"
message_end:

# The length is a word in memory and not an immediate. The assembler keeps the
# difference of two labels relocatable until it lays the section out, so "li"
# cannot take it, but ".word" can.
    .align  2
message_len:
    .word   message_end - message

    .section .text
    .globl _start

_start:
    li      a0, 1               # fd = 1, the standard output
    la      a1, message         # buffer
    la      t0, message_len
    lw      a2, 0(t0)           # length
    li      a7, 64              # write
    ecall

    li      a0, 0               # exit code
    li      a7, 93              # exit
    ecall

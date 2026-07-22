.globl _start

.section .text

_start:
    li a0, 1              # fd = 1 (stdout)
    la a1, msg            # buffer
    li a2, 20             # length
    li a7, 64             # syscall: write
    ecall

    li a0, 0              # exit code 0
    li a7, 93             # syscall: exit
    ecall

.section .rodata
msg:
    .asciz "Hello, World!\n"

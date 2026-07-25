.globl _start

.section .text

_start:
    li t0, 0              # counter = 0
    li t1, 100            # total iterations = 100

print_loop:
    bge t0, t1, print_done

    # Issue write syscall (fd=1, buf=msg, len=15, sys=64)
    li a0, 1
    la a1, msg
    li a2, 15
    li a7, 64
    ecall

    addi t0, t0, 1
    j print_loop

print_done:
    li a0, 0              # exit code 0
    li a7, 93             # syscall: exit
    ecall

.section .rodata
msg:
    .asciz "Line of output\n"

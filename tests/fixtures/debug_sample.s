.globl _start
_start:
    li x10, 10
    li x11, 20
    add x12, x10, x11
    sw x12, 0(sp)
    jal ra, sub_func
loop:
    addi x10, x10, 1
    li x13, 15
    blt x10, x13, loop
    li a7, 93
    li a0, 0
    ecall

sub_func:
    addi x10, x10, 2
    ret

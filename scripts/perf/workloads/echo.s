.globl _start

.section .text

_start:
    # Read a line from stdin
    li a0, 0              # fd = 0 (stdin)
    la a1, input_buf
    li a2, 256
    li a7, 63             # syscall: read
    ecall

    # a0 = number of bytes read
    mv t0, a0             # save count

    # Find the newline (if any) and replace with null for clean output
    la t1, input_buf
    li t2, 0
find_nl:
    bge t2, t0, write_out
    add t3, t1, t2
    lbu t4, 0(t3)
    li t5, 10             # newline
    beq t4, t5, found_nl
    addi t2, t2, 1
    j find_nl

found_nl:
    # t2 = index of newline; write up to and including it
    addi t0, t2, 1

write_out:
    # Write the read data to stdout
    li a0, 1              # fd = 1 (stdout)
    la a1, input_buf
    mv a2, t0             # length
    li a7, 64             # syscall: write
    ecall

    # Exit
    li a0, 0
    li a7, 93             # syscall: exit
    ecall

.section .bss
input_buf:
    .skip 256

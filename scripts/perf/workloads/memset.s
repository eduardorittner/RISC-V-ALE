.globl _start

.section .text

_start:
    # Fill a 4KB region (1024 words) with 0xAB
    la t0, buf            # start of buffer
    li t1, 0xABABABAB     # fill pattern (4 bytes)
    li t2, 0              # offset = 0
    li t3, 4096           # total bytes

fill_loop:
    bge t2, t3, fill_done
    add t4, t0, t2
    sw t1, 0(t4)          # store word
    addi t2, t2, 4
    j fill_loop

fill_done:
    # Verify the fill (read back and check)
    la t0, buf
    li t2, 0
    li t5, 0              # error count

verify_loop:
    bge t2, t3, verify_done
    add t4, t0, t2
    lw t6, 0(t4)
    bne t6, t1, verify_err
    j verify_next

verify_err:
    addi t5, t5, 1

verify_next:
    addi t2, t2, 4
    j verify_loop

verify_done:
    # Print result: "OK\n" if no errors, "ERR\n" otherwise
    la a1, msg_ok
    li a2, 3
    beqz t5, print_ok
    la a1, msg_err
    li a2, 4

print_ok:
    li a0, 1
    li a7, 64
    ecall

    li a0, 0
    li a7, 93
    ecall

.section .rodata
msg_ok:
    .asciz "OK\n"
msg_err:
    .asciz "ERR\n"

.section .bss
buf:
    .skip 4096

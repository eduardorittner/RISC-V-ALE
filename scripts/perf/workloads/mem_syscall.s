.globl _start

.section .text

_start:
    li s0, 0              # s0 = pass counter = 0
    li s1, 300            # s1 = total passes count (300 passes)
    li s2, 65536          # s2 = buffer size in bytes (64 KB = 16384 words)

pass_loop:
    bge s0, s1, all_done

    # -------------------------------------------------------------
    # 1. Memory Write Phase: Fill buf_a with pattern (16384 words)
    # -------------------------------------------------------------
    la t0, buf_a
    li t1, 0              # byte offset = 0
    li t2, 0x12345678
    add t2, t2, s0        # pattern depends on pass number

fill_a:
    bge t1, s2, fill_a_done
    add t3, t0, t1
    sw t2, 0(t3)          # store word (memory write)
    addi t2, t2, 17       # mutate pattern
    addi t1, t1, 4
    j fill_a

fill_a_done:

    # -------------------------------------------------------------
    # 2. Memory Read + Write Phase: Copy & transform buf_a -> buf_b
    # -------------------------------------------------------------
    la t0, buf_a
    la t1, buf_b
    li t2, 0              # byte offset = 0

transform_loop:
    bge t2, s2, transform_done
    add t3, t0, t2
    lw t4, 0(t3)          # load word from buf_a (memory read)
    xori t4, t4, 0x55     # transform value
    add t4, t4, s0        # add pass index
    add t5, t1, t2
    sw t4, 0(t5)          # store word to buf_b (memory write)
    addi t2, t2, 4
    j transform_loop

transform_done:

    # -------------------------------------------------------------
    # 3. Memory Read + Checksum Phase: Read back buf_b & accumulate
    # -------------------------------------------------------------
    la t1, buf_b
    li t2, 0              # byte offset = 0
    li t6, 0              # pass checksum accumulator

checksum_loop:
    bge t2, s2, checksum_done
    add t5, t1, t2
    lw t4, 0(t5)          # load word from buf_b (memory read)
    add t6, t6, t4        # accumulate checksum
    addi t2, t2, 4
    j checksum_loop

checksum_done:

    # -------------------------------------------------------------
    # 4. Syscall Write Phase: Issue write syscall after each pass
    # -------------------------------------------------------------
    # Format "Pass XXX\n" where XXX is 3-digit decimal number (000..299)
    la a1, pass_msg
    li t1, 100
    div t5, s0, t1        # hundreds digit = s0 / 100
    rem t6, s0, t1        # remainder = s0 % 100
    li t1, 10
    div t3, t6, t1        # tens digit = remainder / 10
    rem t6, t6, t1        # ones digit = remainder % 10

    addi t5, t5, 48       # ASCII for hundreds
    addi t3, t3, 48       # ASCII for tens
    addi t6, t6, 48       # ASCII for ones

    sb t5, 5(a1)          # update hundreds at index 5
    sb t3, 6(a1)          # update tens at index 6
    sb t6, 7(a1)          # update ones at index 7

    # Syscall 64 (write): fd=1, buf=pass_msg, len=9
    li a0, 1
    la a1, pass_msg
    li a2, 9
    li a7, 64
    ecall

    addi s0, s0, 1
    j pass_loop

all_done:
    # Print final "OK\n" message via write syscall
    li a0, 1
    la a1, ok_msg
    li a2, 3
    li a7, 64
    ecall

    # Syscall 93 (exit): status=0
    li a0, 0
    li a7, 93
    ecall

.section .rodata
pass_msg:
    .asciz "Pass 000\n"
ok_msg:
    .asciz "OK\n"

.section .bss
.align 2
buf_a:
    .skip 65536
buf_b:
    .skip 65536

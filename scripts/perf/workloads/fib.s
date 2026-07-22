.globl _start

.section .text

_start:
    # Read N from stdin
    li a0, 0              # fd = 0 (stdin)
    la a1, input_buf
    li a2, 16
    li a7, 63             # syscall: read
    ecall

    # Parse N (single or double digit)
    la t0, input_buf
    lbu t1, 0(t0)
    addi t1, t1, -48
    li t2, 0
    li t3, 10

    lbu t4, 1(t0)
    addi t5, t4, -48
    bltz t5, fib_single
    mul t2, t2, t3
    add t2, t2, t1
    mul t2, t2, t3
    add t2, t2, t5
    j fib_start

fib_single:
    mv t2, t1

fib_start:
    # Compute Nth Fibonacci (iterative)
    # fib(0) = 0, fib(1) = 1
    li t0, 0              # prev = 0 (fib(0))
    li t1, 1              # curr = 1 (fib(1))
    li t3, 1              # i = 1

    blez t2, fib_done_zero

fib_loop:
    bge t3, t2, fib_done
    add t4, t0, t1        # next = prev + curr
    mv t0, t1             # prev = curr
    mv t1, t4             # curr = next
    addi t3, t3, 1
    j fib_loop

fib_done_zero:
    li t1, 0

fib_done:
    # t1 = result, convert to decimal string
    mv t0, t1
    la a1, out_buf
    li t3, 0
    li t4, 10

    beqz t0, fib_print_zero

fib_extract:
    beqz t0, fib_digits_done
    rem t5, t0, t4
    div t0, t0, t4
    addi t5, t5, 48
    add t6, a1, t3
    sb t5, 0(t6)
    addi t3, t3, 1
    j fib_extract

fib_digits_done:
    li t4, 0
    addi t5, t3, -1
fib_rev:
    bge t4, t5, fib_rev_done
    add t6, a1, t4
    add t7, a1, t5
    lbu t0, 0(t6)
    lbu t2, 0(t7)
    sb t2, 0(t6)
    sb t0, 0(t7)
    addi t4, t4, 1
    addi t5, t5, -1
    j fib_rev

fib_rev_done:
    j fib_print

fib_print_zero:
    li t0, 48
    sb t0, 0(a1)
    li t3, 1

fib_print:
    add t0, a1, t3
    li t1, 10
    sb t1, 0(t0)
    addi t3, t3, 1

    li a0, 1
    mv a2, t3
    li a7, 64
    ecall

    li a0, 0
    li a7, 93
    ecall

.section .bss
input_buf:
    .skip 32
out_buf:
    .skip 32

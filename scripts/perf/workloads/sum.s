.globl _start

.section .text

_start:
    # Read N from stdin
    li a0, 0              # fd = 0 (stdin)
    la a1, input_buf      # buffer
    li a2, 16             # max length
    li a7, 63             # syscall: read
    ecall

    # Parse N from ASCII (simple single/double digit parser)
    la t0, input_buf
    lbu t1, 0(t0)         # first digit
    addi t1, t1, -48      # ASCII to int ('0' = 48)
    li t2, 0              # N = 0
    li t3, 10             # base 10

    # Check if second char is a digit
    lbu t4, 1(t0)
    addi t5, t4, -48
    bltz t5, single_digit  # not a digit (e.g. newline)
    # Two-digit number
    mul t2, t2, t3
    add t2, t2, t1
    mul t2, t2, t3
    add t2, t2, t5
    j start_sum

single_digit:
    mv t2, t1

start_sum:
    # Sum 1..N
    li t0, 0              # sum = 0
    li t1, 1              # i = 1

sum_loop:
    bgt t1, t2, sum_done
    add t0, t0, t1
    addi t1, t1, 1
    j sum_loop

sum_done:
    # Convert sum to string and print
    la a1, out_buf
    li t3, 0              # digit count

    # Handle 0 case
    beqz t0, print_zero

    # Extract digits (reverse order)
    li t4, 10
extract_loop:
    beqz t0, digits_done
    rem t5, t0, t4        # t5 = t0 % 10
    div t0, t0, t4        # t0 = t0 / 10
    addi t5, t5, 48       # to ASCII
    add t6, a1, t3
    sb t5, 0(t6)
    addi t3, t3, 1
    j extract_loop

digits_done:
    # Reverse digits in place using s0/s1 (save/restore)
    addi sp, sp, -8
    sw s0, 0(sp)
    sw s1, 4(sp)

    li s0, 0              # left index
    addi s1, t3, -1       # right index
reverse_loop:
    bge s0, s1, reverse_done
    add t4, a1, s0
    add t5, a1, s1
    lbu t0, 0(t4)
    lbu t2, 0(t5)
    sb t2, 0(t4)
    sb t0, 0(t5)
    addi s0, s0, 1
    addi s1, s1, -1
    j reverse_loop

reverse_done:
    lw s0, 0(sp)
    lw s1, 4(sp)
    addi sp, sp, 8
    j print_result

print_zero:
    li t0, 48
    sb t0, 0(a1)
    li t3, 1

print_result:
    # Add newline
    add t0, a1, t3
    li t1, 10
    sb t1, 0(t0)
    addi t3, t3, 1

    # Write to stdout
    li a0, 1              # fd = stdout
    mv a2, t3             # length
    li a7, 64             # syscall: write
    ecall

    # Exit
    li a0, 0
    li a7, 93             # syscall: exit
    ecall

.section .bss
input_buf:
    .skip 32
out_buf:
    .skip 32

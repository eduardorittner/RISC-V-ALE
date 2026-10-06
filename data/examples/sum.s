# sum.s -- Add the numbers 1 to 10 in a loop.
#
# The program uses registers only, so every step is easy to follow.
#
# Try this: put a breakpoint on "add_loop" and press run again and again. The
# register pane marks s1 (the total) and s0 (the counter) each time they
# change.

    .section .text
    .globl _start

_start:
    li      s0, 1               # counter
    li      s1, 0               # total
    li      s2, 10              # last number

add_loop:
    add     s1, s1, s0          # total = total + counter
    addi    s0, s0, 1           # counter = counter + 1
    ble     s0, s2, add_loop    # loop while counter <= 10

    # The total is 55. Give it back as the exit code.
    mv      a0, s1
    li      a7, 93
    ecall

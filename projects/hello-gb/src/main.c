#include <gb/gb.h>
#include <stdio.h>

void main(void) {
    DISPLAY_ON;
    printf("\n\n HELLO, GAME BOY!\n\n GBDK PORTABLE DEV");

    while (1) {
        vsync();
    }
}

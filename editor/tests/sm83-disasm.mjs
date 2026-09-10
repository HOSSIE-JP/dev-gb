// Instruction layout: https://gbdev.io/gb-opcodes/optables/ (SM83, not Z80).
// Local analysis helper; never guesses code/data boundaries. Callers supply a
// CPU-observed instruction address, or explicitly request a disassembly window.
export function disassemble(read, pc) {
    const op = read(pc),
        x = op >> 6,
        y = (op >> 3) & 7,
        z = op & 7,
        p = y >> 1,
        q = y & 1;
    const r = ["b", "c", "d", "e", "h", "l", "[hl]", "a"],
        rp = ["bc", "de", "hl", "sp"],
        rp2 = ["bc", "de", "hl", "af"],
        cc = ["nz", "z", "nc", "c"];
    const alu = [
        "add a,",
        "adc a,",
        "sub ",
        "sbc a,",
        "and ",
        "xor ",
        "or ",
        "cp ",
    ];
    let length = 1,
        text;
    const hex = (n, w = 2) => "$" + n.toString(16).padStart(w, "0");
    const imm = () => {
        length = 2;
        return hex(read(pc + 1));
    };
    const word = () => {
        length = 3;
        return hex(read(pc + 1) | (read(pc + 2) << 8), 4);
    };
    const rel = () => {
        length = 2;
        const d = (read(pc + 1) << 24) >> 24;
        return hex((pc + 2 + d) & 65535, 4);
    };
    if (x === 0) {
        if (z === 0)
            text =
                y === 0
                    ? "nop"
                    : y === 1
                      ? `ld [${word()}],sp`
                      : y === 2
                        ? ((length = 2), "stop")
                        : y === 3
                          ? `jr ${rel()}`
                          : `jr ${cc[y - 4]},${rel()}`;
        if (z === 1) text = q ? `add hl,${rp[p]}` : `ld ${rp[p]},${word()}`;
        if (z === 2) {
            const m = ["[bc]", "[de]", "[hl+]", "[hl-]"][p];
            text = q ? `ld a,${m}` : `ld ${m},a`;
        }
        if (z === 3) text = `${q ? "dec" : "inc"} ${rp[p]}`;
        if (z === 4 || z === 5) text = `${z === 4 ? "inc" : "dec"} ${r[y]}`;
        if (z === 6) text = `ld ${r[y]},${imm()}`;
        if (z === 7)
            text = ["rlca", "rrca", "rla", "rra", "daa", "cpl", "scf", "ccf"][
                y
            ];
    } else if (x === 1) text = op === 0x76 ? "halt" : `ld ${r[y]},${r[z]}`;
    else if (x === 2) text = alu[y] + r[z];
    else {
        if (z === 0)
            text =
                y < 4
                    ? `ret ${cc[y]}`
                    : y === 4
                      ? `ldh [${imm()}],a`
                      : y === 5
                        ? `add sp,${imm()}`
                        : y === 6
                          ? `ldh a,[${imm()}]`
                          : `ld hl,sp+${imm()}`;
        if (z === 1)
            text = q
                ? ["ret", "reti", "jp hl", "ld sp,hl"][p]
                : `pop ${rp2[p]}`;
        if (z === 2)
            text =
                y < 4
                    ? `jp ${cc[y]},${word()}`
                    : y === 4
                      ? "ldh [c],a"
                      : y === 5
                        ? `ld [${word()}],a`
                        : y === 6
                          ? "ldh a,[c]"
                          : `ld a,[${word()}]`;
        if (z === 3) {
            if (y === 0) text = `jp ${word()}`;
            else if (y === 1) {
                length = 2;
                const cb = read(pc + 1),
                    cx = cb >> 6,
                    cy = (cb >> 3) & 7,
                    cz = cb & 7;
                text =
                    cx === 0
                        ? [
                              "rlc",
                              "rrc",
                              "rl",
                              "rr",
                              "sla",
                              "sra",
                              "swap",
                              "srl",
                          ][cy] +
                          " " +
                          r[cz]
                        : ["", "bit", "res", "set"][cx] +
                          " " +
                          cy +
                          "," +
                          r[cz];
            } else if (y === 6) text = "di";
            else if (y === 7) text = "ei";
        }
        if (z === 4 && y < 4) text = `call ${cc[y]},${word()}`;
        if (z === 5)
            text = q
                ? p === 0
                    ? `call ${word()}`
                    : undefined
                : `push ${rp2[p]}`;
        if (z === 6) text = alu[y] + imm();
        if (z === 7) text = `rst ${hex(y * 8)}`;
    }
    return {
        pc,
        length,
        bytes: Array.from({ length }, (_, i) => read(pc + i)),
        text: text ?? `illegal ${hex(op)}`,
    };
}

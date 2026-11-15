#!/usr/bin/env python3
"""Educoder lab10: LOOK + I/O time — apply patches, build, capture step2 output."""
from pathlib import Path
import re
import subprocess
import os

BASE = Path("/home/CQUCS/ucore-loongarch32-lab10-noanswer")
STEP2 = Path("/data/workspace/myshixun/step2/tishi.txt")

LOOK = r"""#ifdef LAB10_EX1
    while (1) {
        if (direction_look == 1) {
            current = disk_head_look->next;
        } else {
            current = disk_head_look->prev;
        }

        if (current->block_num == -1) {
            direction_look = 1 - direction_look;
            if (direction_look == 1) {
                current = disk_head_look->next;
            } else {
                current = disk_head_look->prev;
            }
            if (current->block_num == -1) {
                break;
            }
        }

        while (current->block_num != -1) {
            traversed_blocks[count++] = current->block_num;
            kprintf("Serving block: %d\n", current->block_num);

            struct bio *next_req = (direction_look == 1) ? current->next : current->prev;

            current->prev->next = current->next;
            current->next->prev = current->prev;

            disk_head_look->block_num = current->block_num;

            if (current->iob.io_base != NULL) {
                kfree(current->iob.io_base);
            }
            kfree(current);

            current = next_req;
        }

        direction_look = 1 - direction_look;
    }
    *size = count;
#endif"""

TRACK_FN = r"""static int calculate_track_to_track_time(int current_block, int next_block) {
#ifdef LAB10_EX2
    int current_track = current_block / SPT;
    int next_track = next_block / SPT;
    return ABS(current_track - next_track) * TRACK_SEEK_TIME;
#endif
}"""

SECTOR_FN = r"""static int calculate_sector_to_sector_time(int current_block, int next_block) {
#ifdef LAB10_EX2
    int d = ABS((next_block % SPT) - (current_block % SPT));
    if (d > SPT / 2) {
        d = SPT - d;
    }
    return d * SECTOR_SEEK_TIME;
#endif
}"""

MEASURE_FN = r"""static int measure_time(int* traversed_blocks, int size, int begin_pos, int direction) {
#ifdef LAB10_EX2
    int total = 0;
    int current = begin_pos;
    (void)direction;
    for (int i = 0; i < size; i++) {
        int next = traversed_blocks[i];
        total += calculate_track_to_track_time(current, next);
        total += calculate_sector_to_sector_time(current, next);
        total += TIME_DATA_BLOCK_TRANSFER;
        current = next;
    }
    return total;
#endif
}"""


def patch_block(text, start_marker, end_marker, body, is_regex=False):
    if is_regex:
        pat = re.compile(start_marker, re.S)
        if not pat.search(text):
            raise SystemExit(f"missing pattern {start_marker[:40]}")
        return pat.sub(body, text, count=1)
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit(f"missing {start_marker}")
    end = text.find(end_marker, start)
    if end < 0:
        raise SystemExit(f"missing {end_marker} after {start_marker}")
    end += len(end_marker)
    return text[:start] + body + text[end:]


def patch_io_scheduler():
    p = BASE / "kern/iotest/io_scheduler.c"
    text = p.read_text()
    text = patch_block(text, "#ifdef LAB10_EX1", "#endif", LOOK)
    p.write_text(text)
    print("io_scheduler.c OK")


def patch_bio():
    p = BASE / "kern/iotest/bio_request_test.c"
    text = p.read_text()
    for pat, repl in [
        (
            r"static int calculate_track_to_track_time\(int current_block, int next_block\) \{.*?#endif\n\}",
            TRACK_FN,
        ),
        (
            r"static int calculate_sector_to_sector_time\(int current_block, int next_block\) \{.*?#endif\n\}",
            SECTOR_FN,
        ),
        (
            r"static int measure_time\(int\* traversed_blocks, int size, int begin_pos, int direction\) \{.*?#endif\n\}",
            MEASURE_FN,
        ),
    ]:
        text = patch_block(text, pat, "", repl, is_regex=True)
    p.write_text(text)
    print("bio_request_test.c OK")


def patch_makefile():
    p = BASE / "Makefile"
    text = p.read_text()
    text = re.sub(
        r"LAB10\s*:=\s*-DLAB10_EX1\s*(#-DLAB10_EX2)?",
        "LAB10\t:= -DLAB10_EX1 -DLAB10_EX2",
        text,
    )
    if "-accel tcg,tb-size=8" not in text:
        text = text.replace(
            "QEMUOPTS:= -M ls3a5k32",
            "QEMUOPTS:= -accel tcg,tb-size=8 -M ls3a5k32",
        )
    p.write_text(text)
    print("Makefile OK", "LAB10_EX2" in text and "tb-size=8" in text)


def build():
    os.chdir(BASE)
    subprocess.run(["make", "clean"], check=False)
    r = subprocess.run(["make", "-j2"], capture_output=True, text=True)
    print("make exit", r.returncode)
    if r.returncode != 0:
        print(r.stdout[-2000:])
        print(r.stderr[-2000:])
        raise SystemExit("make failed")


def run_qemu_capture():
    STEP2.parent.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["QEMU_AUDIO_DRV"] = "none"
    cmd = [
        "timeout",
        "20",
        "qemu-system-loongarch32",
        "-accel",
        "tcg,tb-size=8",
        "-M",
        "ls3a5k32",
        "-m",
        "32",
        "-nographic",
        "-kernel",
        str(BASE / "obj/ucore-kernel-initrd"),
    ]
    with open(STEP2, "w") as out:
        r = subprocess.run(cmd, stdout=out, stderr=subprocess.STDOUT, env=env, cwd=BASE)
    print("qemu exit", r.returncode, "bytes", STEP2.stat().st_size)
    txt = STEP2.read_text(errors="replace")
    for line in txt.splitlines():
        if "iotest check" in line or line.strip().startswith("time ="):
            print(line)
    if "iotest check pass" not in txt or "time = 1321" not in txt:
        raise SystemExit("unexpected output")


def main():
    patch_io_scheduler()
    patch_bio()
    patch_makefile()
    build()
    run_qemu_capture()
    print("DONE")


if __name__ == "__main__":
    main()

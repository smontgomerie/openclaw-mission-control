#!/usr/bin/env python3
"""Install idempotent speaker observation/overlay hooks into workspace pipelines."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

START = "# BEGIN mission-control-speaker-hooks"
END = "# END mission-control-speaker-hooks"


def install_hook(path: Path, needle: str, block: str) -> bool:
    content = path.read_text(encoding="utf-8")
    if START in content:
        return False
    if needle not in content:
        raise RuntimeError(f"Hook location not found in {path}")
    backup = path.with_suffix(path.suffix + ".pre-speaker-hooks.bak")
    if not backup.exists():
        shutil.copy2(path, backup)
    path.write_text(content.replace(needle, f"{START}\n{block}\n{END}\n\n{needle}", 1), encoding="utf-8")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--transcriptions-root", required=True)
    args = parser.parse_args()
    root = Path(args.transcriptions_root).expanduser().resolve()
    process_block = '''if [[ -f "./speaker_observations.py" ]]; then
        if ! "$PYTHON_BIN" ./speaker_observations.py \\
            --helper "$SPEAKER_HELPER" \\
            --registry-dir "$PWD" \\
            --audio "$process_file" \\
            --transcript "$transcript_json" \\
            --output "$processed_dir/speaker-observations.json"; then
            echo "  [WARN] Speaker observation extraction failed"
        fi
    fi'''
    reannotate_block = '''  if [[ -f "$TRANS_ROOT/apply_speaker_annotations.py" && -f "$proc_dir/speaker-annotations.json" ]]; then
    "$PYTHON_BIN" "$TRANS_ROOT/apply_speaker_annotations.py" \\
      --transcript "$proc_dir/transcript.json" \\
      --annotations "$proc_dir/speaker-annotations.json" \\
      --text-output "$proc_dir/transcript.txt"
  fi'''
    install_hook(root / "process_wav_files.sh", '    date > "$done_file"', process_block)
    install_hook(
        root / "tools" / "reannotate_all.sh",
        "done\n\necho \"reannotate_all complete.\"",
        reannotate_block,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

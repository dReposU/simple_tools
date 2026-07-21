#!/usr/bin/env python3
"""Reference lister: renumber references and update citations.

Behavior:
- Finds a heading whose text matches `reference_heading` (case-insensitive).
- Collects the reference block below that heading until the next heading or EOF.
- Partitions entries into labeled (numeric) and added/unlabeled (alphabetic or empty).
- Orders added/unlabeled entries alphabetically by entry content and places them first.
- Keeps numeric-labeled entries in their current block order and appends them after.
- Renumbers entries sequentially and updates in-text citations of the form _[label]_ across the whole document.

Usage:
    python reference_lister.py input.md output.md --heading "ThisHeadingForReference"

The main function accepts a `reference_heading` parameter so other callers can reuse it.
"""
import argparse
import re
from typing import List, Tuple, Dict


ENTRY_RE = re.compile(r"^\s*\[([^\]]*)\]\s*(.*\S)\s*$")
CITATION_RE = re.compile(r"_\[([^\]]+)\]_")
HEADING_RE = re.compile(r"^#{1,6}\s*(.*)$")


def parse_references(lines: List[str], start_idx: int) -> Tuple[int, List[Tuple[str, str, int]]]:
    """Collect reference entries starting at start_idx (first line after heading).

    Returns (end_idx, entries) where entries is list of (label, content, original_line_index).
    """
    entries = []
    i = start_idx
    while i < len(lines):
        line = lines[i]
        # stop at next heading
        if HEADING_RE.match(line):
            break
        m = ENTRY_RE.match(line)
        if m:
            label = m.group(1).strip()
            content = m.group(2).strip()
            entries.append((label, content, i))
        i += 1
    return i, entries


def renumber_entries(entries: List[Tuple[str, str, int]]) -> Tuple[List[str], Dict[str, int]]:
    """Renumber entries and return new_lines and mapping old_label->new_number.

    Strategy:
    - Added/unlabeled entries (label non-digit or empty) are sorted alphabetically by content and placed first.
    - Numeric-labeled entries keep their block order and are placed after.
    """
    alpha = []
    numeric = []
    for label, content, _ in entries:
        if label.isdigit():
            numeric.append((label, content))

    # sort added/unlabeled alphabetically by content
    alpha_sorted = sorted(alpha, key=lambda x: x[1].lower())

    new_lines = []
    mapping: Dict[str, int] = {}
    counter = 1

    for label, content in alpha_sorted:
        new_lines.append(f"[{counter}] {content}")
        if label != "":
            mapping[label] = counter
        counter += 1

    for label, content in numeric:
        new_lines.append(f"[{counter}] {content}")
        if label != "":
            mapping[label] = counter
        counter += 1

    return new_lines, mapping


def update_citations(text: str, mapping: Dict[str, int]) -> str:
    def repl(m):
        key = m.group(1)
        if key in mapping:
            return f"_[{mapping[key]}]_"
        return m.group(0)

    return CITATION_RE.sub(repl, text)


def process_file(input_path: str, output_path: str, reference_heading: str = "References") -> None:
    with open(input_path, "r", encoding="utf-8") as f:
        lines = f.read().splitlines()

    # find heading
    heading_idx = None
    for idx, line in enumerate(lines):
        m = HEADING_RE.match(line)
        if m:
            title = m.group(1).strip()
            if title.lower() == reference_heading.lower():
                heading_idx = idx
                break

    if heading_idx is None:
        raise ValueError(f"Reference heading '{reference_heading}' not found in {input_path}")

    # parse references block
    start_idx = heading_idx + 1
    end_idx, entries = parse_references(lines, start_idx)

    new_ref_lines, mapping = renumber_entries(entries)

    # Build new document text with updated citation tokens across whole doc
    full_text = "\n".join(lines)
    updated_text = update_citations(full_text, mapping)
    updated_lines = updated_text.splitlines()

    # Replace reference block in updated_lines between start_idx and end_idx with new_ref_lines
    out_lines = updated_lines[:start_idx] + new_ref_lines + updated_lines[end_idx:]

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(out_lines) + "\n")


def main():
    parser = argparse.ArgumentParser(description="Renumber Markdown references and update citations")
    parser.add_argument("input", help="Input markdown file")
    parser.add_argument("output", help="Output markdown file")
    parser.add_argument("--heading", default="References", help="Reference heading text (default: References)")
    args = parser.parse_args()
    process_file(args.input, args.output, args.heading)


if __name__ == "__main__":
    main()

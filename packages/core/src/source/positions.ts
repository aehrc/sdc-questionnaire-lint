// Lines and columns of offsets into a text, given where each line starts (FshDocument.lineStarts).
// Both are one-based, and columns count UTF-16 code units, as source locations do
// (report-format.md § Findings and locations).

// The line an offset is on.
export function lineAt(lineStarts: readonly number[], offset: number): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((lineStarts[middle] ?? 0) <= offset) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}

export function positionAt(
  lineStarts: readonly number[],
  offset: number,
): { line: number; column: number } {
  const line = lineAt(lineStarts, offset);
  return { line, column: offset - (lineStarts[line - 1] ?? 0) + 1 };
}

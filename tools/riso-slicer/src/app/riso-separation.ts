/**
 * Splits an RGB image into riso ink layers.
 *
 * Inks are treated as subtractive filters: a pixel's absorbance
 * (-ln of each channel) is modelled as a sum of ink absorbances weighted by
 * coverage. The least-squares coverages come from the pseudo-inverse of the
 * 3×N ink absorbance matrix, which is computed once per ink set here and
 * applied per pixel in the shader.
 */

const floor = 0.02;

export function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

export function absorbance(rgb: readonly number[]): [number, number, number] {
  return [0, 1, 2].map((channel) => -Math.log(Math.max(floor, rgb[channel] ?? 1))) as [number, number, number];
}

function invert(matrix: number[][]): number[][] | null {
  const size = matrix.length;
  const work = matrix.map((row, index) => [...row, ...Array.from({ length: size }, (_, column) => (column === index ? 1 : 0))]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(work[row]![column]!) > Math.abs(work[pivot]![column]!)) pivot = row;
    }
    if (Math.abs(work[pivot]![column]!) < 1e-9) return null;
    [work[column], work[pivot]] = [work[pivot]!, work[column]!];
    const scale = work[column]![column]!;
    work[column] = work[column]!.map((value) => value / scale);
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = work[row]![column]!;
      work[row] = work[row]!.map((value, index) => value - factor * work[column]![index]!);
    }
  }
  return work.map((row) => row.slice(size));
}

/**
 * Returns a row-major 3×3 matrix whose first `inks.length` rows map a pixel's
 * absorbance to each ink's coverage. Unused rows are zero. Near-duplicate inks
 * get a small ridge term so the solve stays stable instead of exploding.
 */
export function inkSeparationMatrix(inks: readonly string[]): number[] {
  const columns = inks.map((ink) => absorbance(hexToRgb(ink)));
  const count = columns.length;
  const gram = Array.from({ length: count }, (_, row) =>
    Array.from({ length: count }, (_, column) =>
      columns[row]!.reduce((sum, value, channel) => sum + value * columns[column]![channel]!, 0) + (row === column ? 1e-3 : 0),
    ),
  );
  const inverse = invert(gram) ?? gram.map((row, index) => row.map((_, column) => (index === column ? 1 / Math.max(1e-3, row[index]!) : 0)));
  const result = new Array<number>(9).fill(0);
  for (let ink = 0; ink < count; ink += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      let value = 0;
      for (let k = 0; k < count; k += 1) value += inverse[ink]![k]! * columns[k]![channel]!;
      result[ink * 3 + channel] = value;
    }
  }
  return result;
}

export function separatePixel(rgb: readonly number[], matrix: readonly number[], inkCount: number): number[] {
  const a = absorbance(rgb);
  return Array.from({ length: inkCount }, (_, ink) =>
    Math.min(1, Math.max(0, matrix[ink * 3]! * a[0] + matrix[ink * 3 + 1]! * a[1] + matrix[ink * 3 + 2]! * a[2])),
  );
}

/** Paper-white Beer–Lambert mix of the given ink coverages; the shader composites the same way. */
export function printInks(coverage: readonly number[], inks: readonly string[]): [number, number, number] {
  const out: [number, number, number] = [1, 1, 1];
  coverage.forEach((amount, index) => {
    const ink = hexToRgb(inks[index]!);
    for (let channel = 0; channel < 3; channel += 1) out[channel]! *= Math.max(floor, ink[channel]!) ** amount;
  });
  return out;
}

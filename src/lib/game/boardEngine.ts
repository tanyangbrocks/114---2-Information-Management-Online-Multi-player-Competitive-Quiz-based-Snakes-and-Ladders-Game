/**
 * 10x10 蛇梯棋：手扶梯（向上）、電鰻（向下）。
 * 數字 1 在左下角，之字形向上至 100。
 */
export const ESCALATORS: ReadonlyArray<readonly [number, number]> = [
  [3, 22],
  [36, 55],
  [67, 88],
  [7, 34],
  [81, 99]
];

export const EELS: ReadonlyArray<readonly [number, number]> = [
  [26, 5],
  [58, 39],
  [93, 72],
  [48, 17],
  [98, 83]
];

const jumps = new Map<number, number>();

for (const [from, to] of ESCALATORS) jumps.set(from, to);
for (const [from, to] of EELS) jumps.set(from, to);

export function getJumpTarget(cell: number): number | null {
  const to = jumps.get(cell);
  return to === undefined ? null : to;
}

/** 超過 100 時以「反彈」折返，直到落在 1–100。 */
export function bounceOverHundred(pos: number): number {
  let p = pos;
  let guard = 0;
  while (p > 100 && guard < 50) {
    p = 100 - (p - 100);
    guard += 1;
  }
  return Math.min(100, Math.max(1, p));
}

export function applyConnectors(start: number, ignoreEel: boolean = false): { position: number; path: number[] } {
  const path: number[] = [start];
  let current = start;
  let guard = 0;
  while (guard < 30) {
    const next = getJumpTarget(current);
    if (next === null) break;
    
    // 如果忽略電鰻，且這是一個電鰻的起點，就不掉落
    if (ignoreEel && EELS.some(([from]) => from === current)) {
      break;
    }
    
    current = next;
    path.push(current);
    guard += 1;
  }
  return { position: current, path };
}

export type MoveResult = {
  position: number;
  starsGained: number;
  path: number[];
};

export type MoveModifiers = {
  spades?: number;
  clubs?: number;
  ignoreEel?: boolean;
};

/**
 * 從 pos 前進 steps 格，加上黑桃(spades)減去梅花(clubs)，套用反彈、手扶梯／電鰻；若最終落在 100 則星星+1並回到 1。
 */
export function moveBySteps(pos: number, baseSteps: number, modifiers: MoveModifiers = {}): MoveResult {
  const s = modifiers.spades ?? 0;
  const c = modifiers.clubs ?? 0;
  const netSteps = baseSteps + s - c;
  
  let p = bounceOverHundred(pos + netSteps);
  // 防止後退到 1 以下
  if (p < 1) p = 1;
  
  const path: number[] = [p];
  const chained = applyConnectors(p, modifiers.ignoreEel);
  p = chained.position;
  path.push(...chained.path.slice(1));

  let starsGained = 0;
  if (p === 100) {
    starsGained = 1;
    p = 1;
    path.push(100, 1);
  }

  return { position: p, starsGained, path };
}

/** 產生棋盤顯示順序：索引 0 = 最上列（100 附近），符合「由上往下看」的 UI。 */
export function buildZigzagGrid(): number[][] {
  const rows: number[][] = [];
  for (let r = 9; r >= 0; r -= 1) {
    const base = r * 10;
    const leftToRight = r % 2 === 0;
    const row: number[] = [];
    for (let c = 0; c < 10; c += 1) {
      const offset = leftToRight ? c : 9 - c;
      row.push(base + offset + 1);
    }
    rows.push(row);
  }
  return rows;
}

export function cellKind(cell: number): "escalator" | "eel" | "plain" {
  if (ESCALATORS.some(([from]) => from === cell)) return "escalator";
  if (EELS.some(([from]) => from === cell)) return "eel";
  return "plain";
}

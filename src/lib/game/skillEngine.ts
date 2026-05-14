import type { GameCard, SkillActionType, Suit } from "@/types/game";

export type AvailableSkill = {
  actionType: SkillActionType;
  requiresTarget: boolean;
  costDescription: string;
};

// 取得玩家目前尚未被消耗的卡牌
export function getAvailableCards(cards: GameCard[]): GameCard[] {
  return cards.filter((c) => !c.is_used);
}

// 計算每種花色的數量
export function countSuits(cards: GameCard[]): Record<Suit, number> {
  const counts: Record<Suit, number> = { S: 0, C: 0, D: 0, H: 0 };
  for (const card of cards) {
    if (counts[card.suit] !== undefined) {
      counts[card.suit]++;
    }
  }
  return counts;
}

// 判斷是否滿足消耗條件 (包含菱形轉化：發動需消耗 2 張以上卡片時，可將 1 張菱形當作任一花色)
export function canAfford(
  counts: Record<Suit, number>,
  costS: number,
  costC: number,
  costH: number,
  costD: number
): boolean {
  let neededS = Math.max(0, costS - counts.S);
  let neededC = Math.max(0, costC - counts.C);
  let neededH = Math.max(0, costH - counts.H);
  let neededD = Math.max(0, costD - counts.D);

  const totalCost = costS + costC + costH + costD;
  const missingSuits = neededS + neededC + neededH;

  // 如果根本不需要替代，且菱形也夠，就直接 true
  if (missingSuits === 0 && neededD === 0) return true;

  // 如果需要的總卡數 >= 2，且有多餘的菱形，可以使用 1 張菱形代替 1 張其他花色
  if (totalCost >= 2) {
    const availableDForSub = Math.max(0, counts.D - costD);
    if (availableDForSub >= 1 && missingSuits === 1) {
      return true; // 用 1 張菱形補足了缺的那張
    }
  }

  return false;
}

// U-1 (消耗 3 同花色)： 傳送至最近梯子（可用菱形轉化）
export function canAffordU1(counts: Record<Suit, number>): boolean {
  // S, C, H 任一種達到 3 張，或者 2張 + 1張菱形
  // D 達到 3 張也可以
  if (counts.S >= 3 || counts.C >= 3 || counts.H >= 3 || counts.D >= 3) return true;
  if (counts.D >= 1) {
    if (counts.S >= 2 || counts.C >= 2 || counts.H >= 2) return true;
  }
  return false;
}

// U-2 (消耗 4 種各一)： 指定一隊伍與自身調換位置（可用 2 菱形 + 2 不同花色配對）
export function canAffordU2(counts: Record<Suit, number>): boolean {
  if (counts.S >= 1 && counts.C >= 1 && counts.H >= 1 && counts.D >= 1) return true;
  
  // 如果有多出菱形，可以用來代替缺少的花色。
  // 目標：S=1, C=1, H=1, D=1 (但 D 可以當萬用牌)
  // 計算 S, C, H 缺幾張
  const missingS = counts.S === 0 ? 1 : 0;
  const missingC = counts.C === 0 ? 1 : 0;
  const missingH = counts.H === 0 ? 1 : 0;
  const totalMissing = missingS + missingC + missingH;

  // 規則說「可用 2 菱形 + 2 不同花色配對」，意思是如果缺2種，要有至少2張菱形 (其中一張是原本需要的D，一張是替代品。等等，如果缺2種，加上本來的D，需要3張D？)
  // 其實簡化邏輯：我們需要 4 張牌。
  // 我們有的 S, C, H 各取最多 1 張，算作 uniqueSuits。
  const uniqueSuits = (counts.S > 0 ? 1 : 0) + (counts.C > 0 ? 1 : 0) + (counts.H > 0 ? 1 : 0);
  // 我們還缺 4 - uniqueSuits 張。這些全部用 D 來補。
  // 所以需要 D >= 4 - uniqueSuits。
  // 但規則說「每次轉化僅限 1 張」！！
  // 提示："發動需消耗 2 張以上卡片時，可將 1 張菱形當作任一花色。每次轉化僅限 1 張。"
  // 如果只能轉化 1 張，那 U-2 (消耗 4 種各一) 只能缺 1 種，然後用 D 補。
  // 所以 S, C, H 只能缺 1 種。
  if (totalMissing <= 1) {
    // 缺的用 1 張 D 補，再加上原本就需要 1 張 D，所以總共需要 2 張 D。
    // 如果 totalMissing 是 0，只需要 1 張 D。
    const requiredD = 1 + totalMissing; 
    if (counts.D >= requiredD) return true;
  }
  return false;
}

export function calculateAvailableSkills(cards: GameCard[]): AvailableSkill[] {
  const availableCards = getAvailableCards(cards);
  const counts = countSuits(availableCards);
  const skills: AvailableSkill[] = [];
  const totalCards = availableCards.length;

  // S-1: 消耗 1S, 指定對象
  if (canAfford(counts, 1, 0, 0, 0)) {
    skills.push({ actionType: "S-1", requiresTarget: true, costDescription: "1S" });
  }
  // S-2: 消耗 2S
  if (canAfford(counts, 2, 0, 0, 0)) {
    skills.push({ actionType: "S-2", requiresTarget: false, costDescription: "2S" });
  }
  // C-1: 消耗 1C
  if (canAfford(counts, 0, 1, 0, 0)) {
    skills.push({ actionType: "C-1", requiresTarget: false, costDescription: "1C" });
  }
  // C-2: 消耗 2C, 指定對象
  if (canAfford(counts, 0, 2, 0, 0)) {
    skills.push({ actionType: "C-2", requiresTarget: true, costDescription: "2C" });
  }
  // H-1: 消耗 1H
  if (canAfford(counts, 0, 0, 1, 0)) {
    skills.push({ actionType: "H-1", requiresTarget: false, costDescription: "1H" });
  }
  // U-1: 消耗 3 同花色
  if (canAffordU1(counts)) {
    skills.push({ actionType: "U-1", requiresTarget: false, costDescription: "3 同色" });
  }
  // U-2: 消耗 4 種各一, 指定對象
  if (canAffordU2(counts)) {
    skills.push({ actionType: "U-2", requiresTarget: true, costDescription: "4 異色" });
  }
  // U-3: 消耗所有手牌 (至少要有 1 張牌？規則沒說。假設 >= 1 即可)
  if (totalCards > 0) {
    skills.push({ actionType: "U-3", requiresTarget: false, costDescription: "全手牌" });
  }

  return skills;
}

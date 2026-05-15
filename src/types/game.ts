export type QuizChoice = "A" | "B" | "C" | "D";

export type GamePhase = "lobby" | "question" | "reveal" | "skill" | "settle" | "between_rounds" | "finished";

export type Suit = "S" | "C" | "D" | "H";

export type RoundConfig = { answer: QuizChoice; question_text?: string };

export type GameCard = {
  id: string;
  name: string;
  points: number;
  effect: string;
  slot: 1 | 2;
  round: number;
  suit: Suit;
  is_used?: boolean; // 用於標記卡牌是否被消耗
};

export type SkillActionType = "S-1" | "S-2" | "C-1" | "C-2" | "H-1" | "U-1" | "U-2" | "U-3" | "D-1" | "D-2" | "D-COUNTER" | "H-COUNTER" | "PASS";

export type SkillAction = {
  id: string; // uuid
  game_id: string;
  round: number;
  player_id: string;
  action_type: SkillActionType;
  target_player_id?: string;
  consumed_cards: string[]; // 卡牌 ID 陣列
  metadata?: Record<string, unknown>;
  created_at: string;
  status: "pending" | "resolved" | "cancelled" | "waiting_counter" | "waiting_choice" | "ready";
};

export type GameRow = {
  id: string;
  invite_code: string;
  host_secret: string;
  round_count: number;
  rounds_config: RoundConfig[];
  current_round: number;
  phase: GamePhase;
  question_epoch: number;
  created_at: string;
  updated_at: string;
};

export type PlayerRow = {
  id: string;
  game_id: string;
  name: string;
  position: number;
  stars: number;
  cards: GameCard[];
  answers: Record<string, QuizChoice>;
  predicted_steps: number;
  passive_modifiers: number;
  created_at: string;
  updated_at: string;
};

export type RankedPlayer = {
  id: string;
  name: string;
  stars: number;
  position: number;
};

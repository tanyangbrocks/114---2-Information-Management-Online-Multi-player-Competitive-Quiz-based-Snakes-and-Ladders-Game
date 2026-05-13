export type QuizChoice = "A" | "B" | "C" | "D";

export type GamePhase = "lobby" | "question" | "between_rounds" | "finished";

export type RoundConfig = { answer: QuizChoice };

export type GameCard = {
  id: string;
  name: string;
  points: number;
  effect: string;
  slot: 1 | 2;
  round: number;
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
  created_at: string;
  updated_at: string;
};

export type RankedPlayer = {
  id: string;
  name: string;
  stars: number;
  position: number;
};

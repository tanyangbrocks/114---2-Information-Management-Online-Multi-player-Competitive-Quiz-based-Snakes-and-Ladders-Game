import type { GameCard, GameRow, GamePhase, PlayerRow, QuizChoice, RoundConfig } from "@/types/game";

function coercePhase(p: unknown): GamePhase {
  if (p === "lobby" || p === "question" || p === "between_rounds" || p === "finished") return p;
  return "lobby";
}

function isQuizChoice(v: unknown): v is QuizChoice {
  return v === "A" || v === "B" || v === "C" || v === "D";
}

export function parseRoundsConfig(raw: unknown): RoundConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const answer = (item as { answer?: unknown }).answer;
    return { answer: isQuizChoice(answer) ? answer : "A" };
  });
}

export function parseCards(raw: unknown): GameCard[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => {
      const o = c as Record<string, unknown>;
      const slotValue = (o.slot === 1 || o.slot === 2 ? o.slot : 1) as 1 | 2;
      const points = typeof o.points === "number" ? o.points : 0;
      const round = typeof o.round === "number" ? o.round : 0;
      return {
        id: typeof o.id === "string" ? o.id : `card_${Math.random().toString(16).slice(2)}`,
        name: typeof o.name === "string" ? o.name : "卡片",
        points,
        effect: typeof o.effect === "string" ? o.effect : "",
        slot: slotValue, // 確保這裡有用掉 slotValue,
        round
      };
    })
    .filter((c) => c.points > 0);
}

export function parseAnswers(raw: unknown): Record<string, QuizChoice> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, QuizChoice> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isQuizChoice(v)) out[k] = v;
  }
  return out;
}

export function mapGameRow(row: Record<string, unknown>): GameRow {
  return {
    id: String(row.id),
    invite_code: String(row.invite_code),
    host_secret: String(row.host_secret),
    round_count: Number(row.round_count),
    rounds_config: parseRoundsConfig(row.rounds_config),
    current_round: Number(row.current_round),
    phase: coercePhase(row.phase),
    question_epoch: Number(row.question_epoch),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

export function mapPlayerRow(row: Record<string, unknown>): PlayerRow {
  return {
    id: String(row.id),
    game_id: String(row.game_id),
    name: String(row.name),
    position: Number(row.position),
    stars: Number(row.stars),
    cards: parseCards(row.cards),
    answers: parseAnswers(row.answers),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

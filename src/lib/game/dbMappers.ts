import type { GameCard, GameRow, GamePhase, PlayerRow, QuizChoice, RoundConfig, Suit } from "@/types/game";

function coercePhase(p: unknown): GamePhase {
  if (p === "lobby" || p === "question" || p === "reveal" || p === "skill" || p === "settle" || p === "between_rounds" || p === "finished") return p;
  return "lobby";
}

function isQuizChoice(v: unknown): v is QuizChoice {
  return v === "A" || v === "B" || v === "C" || v === "D";
}

function isSuit(v: unknown): v is Suit {
  return v === "S" || v === "C" || v === "D" || v === "H";
}

export function parseRoundsConfig(raw: unknown): RoundConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const o = item as { answer?: unknown; question_text?: unknown };
    return { 
      answer: isQuizChoice(o.answer) ? o.answer : "A",
      question_text: typeof o.question_text === "string" ? o.question_text : ""
    };
  });
}

export function parseCards(raw: unknown): GameCard[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c: Record<string, unknown>) => ({
      id: String(c.id || ""),
      name: String(c.name || "未知名卡牌"),
      points: Number(c.points || 0),
      effect: String(c.effect || ""),
      slot: Number(c.slot || 1) as 1 | 2,
      round: Number(c.round || 0),
      suit: isSuit(c.suit) ? c.suit : "S",
      is_used: Boolean(c.is_used)
    }));
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
    updated_at: String(row.updated_at),
    hide_host_qr: row.hide_host_qr !== undefined ? Boolean(row.hide_host_qr) : false
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
    predicted_steps: Number(row.predicted_steps || 0),
    passive_modifiers: Number(row.passive_modifiers || 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

"use client";

import { BoardGrid } from "@/components/BoardGrid";
import { QuizModal } from "@/components/QuizModal";
import { useCardDraw } from "@/hooks/useCardDraw";
import { useGameRealtime } from "@/hooks/useGameRealtime";
import { rankPlayers } from "@/lib/game/ranking";
import { createClient } from "@/lib/supabase/browser";
import { usePlayerSessionStore } from "@/store/playerSessionStore";
import type { QuizChoice } from "@/types/game";
import { Loader2, Sparkles, User } from "lucide-react";
import { useEffect, useMemo, useState, use } from "react";
import { moveBySteps } from "@/lib/game/boardEngine";


type Props = {
  params: Promise<{ code: string }>;
};

export function PlayClient({ params }: Props) {
  const { code } = use(params);
  const supabase = useMemo(() => createClient(), []);
  const [gameId, setGameId] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [joinName, setJoinName] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [answerBusy, setAnswerBusy] = useState(false);

  const { drawForSlot } = useCardDraw();

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("games")
      .select("id")
      .eq("invite_code", code)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setLookupError(error.message);
        else if (!data?.id) setLookupError("找不到此邀請碼");
        else setGameId(String(data.id));
      });
    return () => {
      cancelled = true;
    };
  }, [code, supabase]);

  const { game, players, status, error, reload, sendSignal } = useGameRealtime(gameId);
  const playerId = usePlayerSessionStore((s) => (gameId ? s.playerByGame[gameId] : undefined));
  const setPlayerId = usePlayerSessionStore((s) => s.setPlayerId);

  const self = useMemo(() => players.find((p) => p.id === playerId), [players, playerId]);

  // 移除了手動建立頻道的邏輯，改用 Hook 提供的 sendSignal

  const joinGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gameId || !joinName.trim()) return;
    setJoinBusy(true);
    setJoinError(null);
    try {
      const { data, error: insErr } = await supabase
        .from("players")
        .insert({
          game_id: gameId,
          name: joinName.trim(),
          position: 1,
          stars: 0,
          cards: [],
          answers: {}
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      if (!data?.id) throw new Error("加入失敗");
      setPlayerId(gameId, String(data.id));
      await reload();
      await sendSignal();
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "加入失敗");
    } finally {
      setJoinBusy(false);
    }
  };

  const handleAnswer = async (choice: QuizChoice) => {
    if (!game || !self) return;
    if (game.phase !== "question") return;
    const roundKey = String(game.current_round);
    if (self.answers[roundKey]) return;

    const cfg = game.rounds_config[game.current_round - 1];
    if (!cfg) return;

    setAnswerBusy(true);
    try {
      const isCorrect = cfg.answer === choice;
      
      // 1. 答題後間距 0.5s
      await new Promise((r) => setTimeout(r, 500));
      
      const card = drawForSlot(isCorrect ? 2 : 1, game.current_round);
      
      // 2. 抽卡後間距 0.5s
      await new Promise((r) => setTimeout(r, 500));
      
      const move = moveBySteps(self.position, card.points);
      const newStars = self.stars + move.starsGained;
      const newCards = [...self.cards, card];
      const newAnswers = { ...self.answers, [roundKey]: choice };

      const { error: upErr } = await supabase
        .from("players")
        .update({
          position: move.position,
          stars: newStars,
          cards: newCards,
          answers: newAnswers
        })
        .eq("id", self.id);
      if (upErr) throw upErr;
      await reload();
      await sendSignal();
    } catch (err) {
      alert(err instanceof Error ? err.message : "送出失敗");
    } finally {
      setAnswerBusy(false);
    }
  };

  if (lookupError) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <p className="text-rose-600">{lookupError}</p>
      </main>
    );
  }

  if (!gameId || status === "loading" || status === "idle") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-slate-600">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error || !game) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <p className="text-rose-600">{error ?? "無法載入場次"}</p>
      </main>
    );
  }

  if (!playerId || !self) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-slate-900">
            <User className="h-6 w-6 text-sky-600" />
            <div>
              <p className="text-xs uppercase tracking-wide text-sky-700">Player</p>
              <h1 className="text-xl font-semibold">加入場次 {code}</h1>
            </div>
          </div>
          <form className="space-y-4" onSubmit={joinGame}>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-800">顯示名稱</span>
              <input
                required
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 outline-none ring-sky-200 focus:ring-2"
                placeholder="輸入姓名"
              />
            </label>
            {joinError && <p className="text-sm text-rose-600">{joinError}</p>}
            <button
              type="submit"
              disabled={joinBusy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
            >
              {joinBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              進入遊戲
            </button>
          </form>
        </div>
      </main>
    );
  }

  const roundKey = String(game.current_round);
  const needsAnswer = game.phase === "question" && game.current_round > 0 && !self.answers[roundKey];
  const podium = rankPlayers(players);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 lg:flex-row lg:items-start">
      <section className="flex-1 space-y-4">
        <header className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-sky-700">你的狀態</p>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-slate-900">
            <div>
              <p className="text-xs text-slate-500">姓名</p>
              <p className="text-lg font-semibold">{self.name}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">棋盤位置</p>
              <p className="text-lg font-semibold">{self.position}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">星星</p>
              <p className="text-lg font-semibold text-amber-700">{self.stars}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">場次狀態</p>
              <p className="text-sm font-medium text-slate-800">
                回合 {game.current_round}/{game.round_count} · {game.phase === "finished" ? "已結束" : "進行中"}
              </p>
            </div>
          </div>
        </header>
        {game.phase === "finished" && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">前三名</p>
            <ol className="mt-2 grid gap-2 sm:grid-cols-3">
              {podium.map((p, idx) => (
                <li key={p.id} className="rounded-xl border border-amber-100 bg-white px-3 py-2 text-sm text-slate-900">
                  <span className="text-xs text-amber-800">第 {idx + 1} 名</span>
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xs text-slate-600">
                    星星 {p.stars} · 位置 {p.position}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        )}
        <BoardGrid players={players} selfId={self.id} />
      </section>
      <aside className="w-full max-w-sm space-y-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm lg:sticky lg:top-6">
        <h2 className="text-sm font-semibold text-slate-900">我的卡片</h2>
        {self.cards.length === 0 ? (
          <p className="text-sm text-slate-600">尚無卡片，等待主辦方出題並作答。</p>
        ) : (
          <ul className="space-y-2 text-sm text-slate-800">
            {[...self.cards].reverse().map((c) => (
              <li key={c.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <p className="font-semibold">{c.name}</p>
                <p className="text-xs text-slate-500">回合 {c.round}</p>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <QuizModal open={Boolean(needsAnswer)} round={game.current_round} busy={answerBusy} onPick={handleAnswer} />
    </main>
  );
}

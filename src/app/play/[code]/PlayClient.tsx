"use client";

import { BoardGrid } from "@/components/BoardGrid";
import { useCardDraw } from "@/hooks/useCardDraw";
import { useGameRealtime } from "@/hooks/useGameRealtime";
import { rankPlayers } from "@/lib/game/ranking";
import { createClient } from "@/lib/supabase/browser";
import { usePlayerSessionStore } from "@/store/playerSessionStore";
import type { QuizChoice } from "@/types/game";
import { Loader2, Sparkles, User, Radio, SkipForward } from "lucide-react";
import { useEffect, useMemo, useRef, useState, use } from "react";
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

  const { game, players, status, error, reload, sendSignal, sendMoveDone } = useGameRealtime(gameId);
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

    setAnswerBusy(true);
    try {
      const newAnswers = { ...self.answers, [roundKey]: choice };
      const { error: upErr } = await supabase
        .from("players")
        .update({ answers: newAnswers })
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

  // 處理抽卡邏輯 (當主辦方進入 reveal 階段)
  useEffect(() => {
    if (game?.phase === "reveal" && self && gameId) {
      const alreadyDrawn = self.cards.some((c) => c.round === game.current_round);
      if (!alreadyDrawn) {
        const roundKey = String(game.current_round);
        const choice = self.answers[roundKey];
        if (!choice) return; // 沒答題就沒卡

        const cfg = game.rounds_config[game.current_round - 1];
        if (!cfg) return;

        const isCorrect = cfg.answer === choice;
        const card = drawForSlot(isCorrect ? 2 : 1, game.current_round);
        const newCards = [...self.cards, card];

        void supabase
          .from("players")
          .update({ cards: newCards })
          .eq("id", self.id)
          .then(() => {
            void reload();
            void sendSignal();
          });
      }
    }
  }, [game?.phase, game?.current_round, game?.rounds_config, self, gameId, drawForSlot, reload, sendSignal, supabase]);

  // 用 ref 記錄「已結算的回合編號」，防止 settle useEffect 因 self 改變而無限觸發
  const settledRoundRef = useRef<number>(-1);

  // 記錄玩家「已完成移動的回合編號」，移動完畢後立即關閉等待 modal
  const [movedRound, setMovedRound] = useState<number>(-1);

  // 處理移動邏輯 (當主辦方進入 settle 階段)
  useEffect(() => {
    if (game?.phase === "settle" && self && gameId) {
      // 如果這個回合已經結算過，直接跳過
      if (settledRoundRef.current === game.current_round) return;

      const card = self.cards.find((c) => c.round === game.current_round);
      if (!card) return;

      // 先標記為「已結算」，防止重複執行
      settledRoundRef.current = game.current_round;

      const move = moveBySteps(self.position, card.points);
      const newStars = self.stars + move.starsGained;
      const roundNum = game.current_round;

      // 用 async IIFE 確保正確的執行順序：先更新DB → 等 reload 完成 → 再關閉 modal
      void (async () => {
        const { error: upErr } = await supabase
          .from("players")
          .update({ position: move.position, stars: newStars })
          .eq("id", self.id);
        if (upErr) return;
        // 先 reload，確保 players state 已包含最新位置
        await reload();
        // 再關閉 modal：此時 boardPlayers 會更新到已含新位置的 players
        setMovedRound(roundNum);
        // 廣播移動完成訊息給主辦方
        void sendMoveDone(self.id, self.name, move.position);
        void sendSignal();
      })();
    }
  }, [game?.phase, game?.current_round, self, gameId, reload, sendSignal, sendMoveDone, supabase]);

  // boardPlayers 只在棋盤可見時才更新，確保動畫在玩家看到棋盤後才播放
  const [boardPlayers, setBoardPlayers] = useState(players);

  // 結算移動完成後（movedRound 改變），此時 players 已包含新位置，觸發棋盤更新與動畫
  useEffect(() => {
    setBoardPlayers(players);
  }, [movedRound]); // eslint-disable-line react-hooks/exhaustive-deps

  // 在非遮蓋階段（回合間、大廳、結束）也即時同步棋盤顯示
  useEffect(() => {
    const phase = game?.phase;
    if (phase === "between_rounds" || phase === "lobby" || phase === "finished") {
      setBoardPlayers(players);
    }
  }, [game?.phase, players]);

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
  // 是否需要答題：在題目階段且還沒答
  const needsAnswer = game.phase === "question" && !self.answers[roundKey];
  // 是否已答題但在等公布：在題目階段且已答
  const isWaitingReveal = game.phase === "question" && !!self.answers[roundKey];
  // 是否正在看抽卡結果：在公布階段
  const isShowingReveal = game.phase === "reveal";
  // 是否在等待結算：在結算階段且玩家尚未移動完畢
  const isWaitingSettle = game.phase === "settle" && movedRound !== game.current_round;
  const podium = rankPlayers(players);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 lg:flex-row lg:items-start">
      <section className="flex-1 space-y-4">
        {/* 主要狀態提示視窗 */}
        {(needsAnswer || isWaitingReveal || isShowingReveal || isWaitingSettle) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-2xl">
              {needsAnswer && (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                      <Radio className="h-6 w-6" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-900">第 {game.current_round} 回合：請作答</h2>
                    <p className="mt-1 text-sm text-slate-500">請在手機上選擇您的答案</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {(["A", "B", "C", "D"] as QuizChoice[]).map((choice) => (
                      <button
                        key={choice}
                        onClick={() => handleAnswer(choice)}
                        disabled={answerBusy}
                        className="flex h-16 items-center justify-center rounded-2xl border-2 border-slate-100 bg-slate-50 text-2xl font-black text-slate-400 transition-all hover:border-sky-500 hover:bg-sky-50 hover:text-sky-600 active:scale-95 disabled:opacity-50"
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isWaitingReveal && (
                <div className="py-6 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-amber-500">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">已送出答案！</h2>
                  <p className="mt-2 text-slate-500">請等待主辦方公布正確答案...</p>
                </div>
              )}

              {isShowingReveal && (
                <div className="text-center">
                  {self.cards.find((c) => c.round === game.current_round) ? (
                    <div className="space-y-4">
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <Sparkles className="h-8 w-8" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-slate-900">答案已公布！</h2>
                        <p className="text-sm text-slate-500">你獲得了以下卡片：</p>
                      </div>
                      <div className="rounded-2xl border-2 border-emerald-100 bg-emerald-50 p-4">
                        <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">
                          {self.cards.find((c) => c.round === game.current_round)?.name}
                        </p>
                        <p className="mt-1 text-2xl font-black text-emerald-700">
                          +{self.cards.find((c) => c.round === game.current_round)?.points} 點
                        </p>
                      </div>
                      <p className="text-sm text-slate-400">等待主辦方發起結算...</p>
                    </div>
                  ) : (
                    <div className="py-10">
                      <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-300" />
                      <p className="mt-4 text-slate-400">正在生成卡片...</p>
                    </div>
                  )}
                </div>
              )}

              {isWaitingSettle && (
                <div className="py-6 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-indigo-500">
                    <SkipForward className="h-8 w-8 animate-pulse" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">準備移動中</h2>
                  <p className="mt-2 text-slate-500">所有玩家將同時開始滑行...</p>
                </div>
              )}
            </div>
          </div>
        )}

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
        <BoardGrid players={boardPlayers} selfId={self.id} />
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
    </main>
  );
}

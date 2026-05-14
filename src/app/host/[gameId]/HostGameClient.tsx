"use client";

import { HostPlayerTable } from "@/components/HostPlayerTable";
import { QRInvitePanel } from "@/components/QRInvitePanel";
import { createClient } from "@/lib/supabase/browser";
import { rankPlayers } from "@/lib/game/ranking";
import { useGameRealtime } from "@/hooks/useGameRealtime";
import { resolveSkillsAndStartSettle } from "@/app/actions/resolveSkills";
import { useMemo, useState, useEffect, useRef, use } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Radio, SkipForward, Trophy, Sparkles } from "lucide-react";

type Props = {
  params: Promise<{ gameId: string }>;
};

export function HostGameClient({ params }: Props) {
  const { gameId } = use(params);
  const searchParams = useSearchParams();
  const hostSecret = searchParams.get("hostSecret") ?? "";

  const { game, players, status, error, reload, sendSignal } = useGameRealtime(gameId);
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState<"send" | "next" | null>(null);

  // 在進入 settle 時快照各玩家的舊位置，用於後續比對是否已移動
  const settleBaselineRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (game?.phase === "settle") {
      // 進入 settle 時，若快照為空則建立
      if (settleBaselineRef.current.size === 0) {
        const baseline = new Map<string, number>();
        players.forEach((p) => baseline.set(p.id, p.position));
        settleBaselineRef.current = baseline;
      }
    } else {
      // 離開 settle 時清空快照
      settleBaselineRef.current = new Map();
    }
  }, [game?.phase, players]);

  // 判斷玩家是否已完成移動
  const isPlayerMoved = (p: typeof players[number]) => {
    if (!game || game.phase !== "settle") return false;
    const card = p.cards.find((c) => c.round === game.current_round);
    if (!card) return false;
    if (card.points === 0) return true; // 移動0格，位置不變但已結算
    const baseline = settleBaselineRef.current.get(p.id);
    return baseline !== undefined && p.position !== baseline;
  };


  const authorized = game && hostSecret && game.host_secret === hostSecret;
  const inviteUrl =
    typeof window !== "undefined" && game ? `${window.location.origin}/play/${game.invite_code}` : "";

  // 移除了手動建立頻道的邏輯，改用 Hook 提供的 sendSignal

  const sendQuestion = async () => {
    if (!game) return;
    setBusy("send");
    try {
      const epoch = game.question_epoch + 1;
      const { error: upErr } = await supabase
        .from("games")
        .update({
          phase: "question",
          question_epoch: epoch
        })
        .eq("id", game.id);
      if (upErr) throw upErr;
      await reload();
      await sendSignal();
    } catch (e) {
      alert(e instanceof Error ? e.message : "發送失敗");
    } finally {
      setBusy(null);
    }
  };

  const startGame = async () => {
    if (!game) return;
    setBusy("next");
    try {
      const { error: upErr } = await supabase
        .from("games")
        .update({ phase: "between_rounds", current_round: 1 })
        .eq("id", game.id);
      if (upErr) throw upErr;
      await reload();
      await sendSignal();
    } catch (e) {
      alert(e instanceof Error ? e.message : "啟動失敗");
    } finally {
      setBusy(null);
    }
  };

  const revealAnswer = async () => {
    if (!game) return;
    setBusy("send");
    try {
      const { error: upErr } = await supabase.from("games").update({ phase: "reveal" }).eq("id", game.id);
      if (upErr) throw upErr;
      await reload();
      await sendSignal();
    } catch (e) {
      alert(e instanceof Error ? e.message : "公布失敗");
    } finally {
      setBusy(null);
    }
  };

  const enterSkillPhase = async () => {
    if (!game) return;
    setBusy("next");
    try {
      const { error: upErr } = await supabase.from("games").update({ phase: "skill" }).eq("id", game.id);
      if (upErr) throw upErr;
      await reload();
      await sendSignal();
    } catch (e) {
      alert(e instanceof Error ? e.message : "進入技能發動失敗");
    } finally {
      setBusy(null);
    }
  };

  const settleMoves = async () => {
    if (!game) return;
    setBusy("next");
    try {
      const res = await resolveSkillsAndStartSettle(game.id, game.current_round);
      if (res.waitingForCounter) {
        alert(`正在等待玩家 ${res.targetName} 決定是否消耗菱形反制技能...`);
      }
      await reload();
      await sendSignal();
    } catch (e) {
      alert(e instanceof Error ? e.message : "結算失敗");
    } finally {
      setBusy(null);
    }
  };

  const advanceRound = async () => {
    if (!game) return;
    setBusy("next");
    try {
      const finished = game.current_round >= game.round_count;
      const nextPhase = finished ? "finished" : "between_rounds";
      const nextRound = finished ? game.current_round : game.current_round + 1;

      const { error: upErr } = await supabase
        .from("games")
        .update({
          phase: nextPhase,
          current_round: nextRound
        })
        .eq("id", game.id);

      if (upErr) throw upErr;
      await reload();
      await sendSignal();
    } catch (e) {
      alert(e instanceof Error ? e.message : "更新失敗");
    } finally {
      setBusy(null);
    }
  };

  if (status === "loading" || status === "idle") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-600">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error || !game) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-rose-600">{error ?? "找不到場次"}</p>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold text-slate-900">無法驗證主辦身分</h1>
        <p className="mt-2 text-slate-600">請使用建立場次後產生的網址（包含 hostSecret 參數）。</p>
      </main>
    );
  }

  const top = rankPlayers(players);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Host Console</p>
          <h1 className="text-2xl font-semibold text-slate-900">主辦後臺</h1>
          <p className="text-sm text-slate-600">即時監看多名玩家，並透過 Supabase Realtime 同步狀態。</p>
        </div>
        {game.phase === "lobby" ? (
          <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-6 text-center shadow-sm">
            <h3 className="mb-4 text-sm font-medium text-sky-900">人員到齊後，點擊下方按鈕開始第一回合</h3>
            <button
              onClick={startGame}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-sky-200 transition-all hover:bg-sky-700 active:scale-95 disabled:opacity-50"
            >
              {busy === "next" ? <Loader2 className="h-4 w-4 animate-spin" /> : "開始遊戲"}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-4">
            {game.phase === "between_rounds" && (
              <button
                onClick={sendQuestion}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-sky-200 transition-all hover:bg-sky-700 active:scale-95"
              >
                {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
                發送答題指令
              </button>
            )}
            {game.phase === "question" && (
              <button
                onClick={revealAnswer}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-amber-200 transition-all hover:bg-amber-700 active:scale-95"
              >
                {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                公布答案
              </button>
            )}
            {game.phase === "reveal" && (
              <button
                onClick={enterSkillPhase}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-purple-200 transition-all hover:bg-purple-700 active:scale-95"
              >
                {busy === "next" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                進入技能發動階段
              </button>
            )}
            {game.phase === "skill" && (
              <button
                onClick={settleMoves}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-700 active:scale-95"
              >
                {busy === "next" ? <Loader2 className="h-4 w-4 animate-spin" /> : <SkipForward className="h-4 w-4" />}
                結算移動
              </button>
            )}
            {game.phase === "settle" && (
              <button
                onClick={advanceRound}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-sky-600 px-6 py-3 text-sm font-bold text-sky-600 transition-all hover:bg-sky-50 active:scale-95"
              >
                {busy === "next" ? <Loader2 className="h-4 w-4 animate-spin" /> : <SkipForward className="h-4 w-4" />}
                進入下一階段
              </button>
            )}
          </div>
        )}
      </header>

      <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
        <QRInvitePanel inviteUrl={inviteUrl} inviteCode={game.invite_code} />
        <HostPlayerTable game={game} players={players} />
      </div>

      {/* settle 階段：顯示各玩家移動確認狀態 */}
      {game.phase === "settle" && (
        <section className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-indigo-900">移動確認狀態</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {players.map((p) => {
              const done = isPlayerMoved(p);
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                    done
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 bg-white text-slate-500"
                  }`}
                >
                  <span className="text-base">{done ? "✓" : "⏳"}</span>
                  <div>
                    <p className="font-semibold leading-tight">{p.name}</p>
                    <p className="text-xs opacity-70">
                      {done ? `位置: ${p.position}` : "等待移動..."}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-indigo-600">
            {players.filter(isPlayerMoved).length} / {players.length} 人已完成移動
          </p>
        </section>
      )}
      {game.phase === "finished" && (
        <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50/80 p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-amber-900">
            <Trophy className="h-6 w-6" />
            <div>
              <p className="text-xs uppercase tracking-wide text-amber-800">結算</p>
              <h2 className="text-xl font-semibold">最終排名（前三名）</h2>
              <p className="text-sm text-amber-900/80">排序規則：星星數優先，其次目前棋盤位置（數字較大者在前）。</p>
            </div>
          </div>
          <ol className="grid gap-3 sm:grid-cols-3">
            {top.map((p, idx) => (
              <li key={p.id} className="rounded-xl border border-amber-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-xs text-amber-800">第 {idx + 1} 名</p>
                <p className="text-lg font-semibold text-slate-900">{p.name}</p>
                <p className="text-sm text-slate-700">星星 {p.stars}</p>
                <p className="text-sm text-slate-700">位置 {p.position}</p>
              </li>
            ))}
            {top.length === 0 && <p className="text-sm text-amber-900">尚無玩家資料。</p>}
          </ol>
        </section>
      )}
    </main>
  );
}

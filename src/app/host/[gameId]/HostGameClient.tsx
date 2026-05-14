"use client";

import { HostPlayerTable } from "@/components/HostPlayerTable";
import { QRInvitePanel } from "@/components/QRInvitePanel";
import { createClient } from "@/lib/supabase/browser";
import { rankPlayers } from "@/lib/game/ranking";
import { useGameRealtime } from "@/hooks/useGameRealtime";
import { useMemo, useState, use } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Radio, SkipForward, Trophy } from "lucide-react";

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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void sendQuestion()}
            disabled={busy !== null || game.phase === "finished"}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed"
          >
            {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
            發送答題指令
          </button>
          <button
            type="button"
            onClick={() => void advanceRound()}
            disabled={busy !== null || game.phase !== "question"}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:border-sky-300 disabled:cursor-not-allowed"
          >
            {busy === "next" ? <Loader2 className="h-4 w-4 animate-spin" /> : <SkipForward className="h-4 w-4" />}
            進入下個回合
          </button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
        <QRInvitePanel inviteUrl={inviteUrl} inviteCode={game.invite_code} />
        <HostPlayerTable game={game} players={players} />
      </div>

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

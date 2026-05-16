"use client";

import { useGameRealtime } from "@/hooks/useGameRealtime";
import { use } from "react";
import { Loader2 } from "lucide-react";
import { QRInvitePanel } from "@/components/QRInvitePanel";
import { BoardGrid } from "@/components/BoardGrid";
import { ScreenPlayerList } from "@/components/ScreenPlayerList";
import { MotionWrapper } from "@/components/MotionWrapper";
import { rankPlayers } from "@/lib/game/ranking";

type Props = {
  params: Promise<{ gameId: string }>;
};

export function ScreenClient({ params }: Props) {
  const { gameId } = use(params);
  const { game, players, skillActions, status, error } = useGameRealtime(gameId);

  if (status === "loading" || status === "idle") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-milky-beige/20">
        <Loader2 className="h-16 w-16 animate-spin text-milky-brown/40" />
      </div>
    );
  }

  if (error || !game) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-milky-beige/20">
        <div className="pudding-card bg-milky-white">
          <p className="text-milky-brown font-bold text-xl">{error ?? "找不到場次"}</p>
        </div>
      </main>
    );
  }

  const hostUrl = typeof window !== "undefined" ? `${window.location.origin}/host/${game.id}?hostSecret=${game.host_secret}` : "";
  const playerUrl = typeof window !== "undefined" ? `${window.location.origin}/play/${game.invite_code}` : "";

  // 已移除獨立的 question 分支，改為在主佈局中動態切換內容

  return (
    <main className="min-h-screen bg-[#FDFBF7] p-4 lg:p-8 flex flex-col page-fade-in overflow-hidden">
      <header className="mb-6 flex items-center justify-between bg-white/60 backdrop-blur-md px-8 py-4 rounded-3xl border border-milky-beige/50 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="bg-milky-brown text-white font-black text-2xl h-12 w-12 flex items-center justify-center rounded-2xl shadow-lg">
            S
          </div>
          <div>
            <h1 className="text-2xl font-black text-milky-brown tracking-tighter">冒險大螢幕</h1>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-milky-brown/40">Snakes & Ladders</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="bg-milky-beige/20 px-6 py-2 rounded-full border border-milky-beige/50 text-sm font-black text-milky-brown/60 uppercase tracking-widest">
            {game.phase === "lobby" && "等待玩家加入"}
            {game.phase === "question" && "玩家答題中"}
            {game.phase === "reveal" && "公布題目答案"}
            {game.phase === "skill" && "技能施放中"}
            {game.phase === "settle" && "移動結算中"}
            {game.phase === "between_rounds" && "準備下回合"}
            {game.phase === "finished" && "冒險結束"}
          </div>
          <div className="bg-milky-apricot text-white px-6 py-2 rounded-full shadow-md text-sm font-black tracking-wider">
            ROUND {game.current_round} / {game.round_count}
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row gap-6 lg:gap-8 h-full min-h-0">
        <div className="flex-1 flex flex-col items-center justify-center relative min-h-[500px] lg:min-h-0 bg-white/40 rounded-[3rem] border-2 border-milky-beige/40 shadow-inner overflow-hidden p-8">
          {game.phase === "lobby" ? (
            <div className="w-full max-w-4xl">
              <QRInvitePanel inviteUrl={playerUrl} inviteCode={game.invite_code} hostUrl={hostUrl} />
            </div>
          ) : game.phase === "finished" ? (
            <MotionWrapper type="bounce" className="text-center w-full max-w-3xl">
              <h2 className="text-6xl font-black text-milky-brown mb-12 tracking-tighter">冒險傳奇排名</h2>
              <div className="grid gap-6">
                {rankPlayers(players).slice(0, 5).map((p, idx) => (
                  <div key={p.id} className="pudding-card bg-white flex items-center p-6 text-2xl font-black text-milky-brown relative overflow-hidden shadow-lg border-2 border-milky-beige/20">
                    <div className={`absolute left-0 top-0 bottom-0 w-4 ${idx === 0 ? 'bg-milky-apricot' : idx === 1 ? 'bg-milky-accent' : 'bg-milky-beige'}`} />
                    <span className="w-20 text-center text-milky-brown/40 font-bold">#{idx + 1}</span>
                    <span className="flex-1 text-left ml-4 truncate">{p.name}</span>
                    <span className="text-milky-accent px-8">★ {p.stars}</span>
                    <span className="w-32 text-right">{p.position} 格</span>
                  </div>
                ))}
              </div>
            </MotionWrapper>
          ) : (game.phase === "question" || game.phase === "reveal") ? (
            <div className="w-full h-full flex items-center justify-center">
              <img 
                src={`https://tbggzrtajphtwrsyqxpg.supabase.co/storage/v1/object/public/media/media/picture/question/r${game.current_round}_${game.phase === "question" ? "question" : "answer"}.png`} 
                alt={`Round ${game.current_round} ${game.phase === "question" ? "Question" : "Answer"}`}
                className="h-full max-h-[800px] w-auto object-contain mx-auto shadow-2xl rounded-3xl"
              />
            </div>
          ) : (
            <div className="w-full max-w-[800px] aspect-square flex items-center justify-center">
               <BoardGrid
                  players={players}
                  selfId=""
                  phase={game.phase}
                  currentRound={game.current_round}
               />
            </div>
          )}
        </div>
        
        <div className="w-full lg:w-[350px] xl:w-[400px] flex-shrink-0 lg:h-[calc(100vh-140px)] overflow-y-auto custom-scrollbar lg:pr-2">
          <ScreenPlayerList game={game} players={players} skillActions={skillActions} />
        </div>
      </div>
    </main>
  );
}

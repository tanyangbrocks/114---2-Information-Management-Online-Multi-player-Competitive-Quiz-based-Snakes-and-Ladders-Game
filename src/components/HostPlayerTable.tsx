"use client";

import type { GameRow, PlayerRow, QuizChoice, SkillAction } from "@/types/game";

type Props = {
  game: GameRow;
  players: PlayerRow[];
  skillActions: SkillAction[];
  isArbitrating: boolean;
};

export function HostPlayerTable({ game, players, skillActions, isArbitrating }: Props) {
  const rounds = Array.from({ length: game.round_count }, (_, i) => i + 1);

  return (
    <div className="overflow-hidden rounded-3xl border border-milky-beige/50 bg-milky-white/50 p-0 shadow-lg">
      <div className="flex items-center justify-between border-b border-milky-beige/50 px-6 py-4 bg-milky-white/30">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-milky-brown/40">REAL-TIME DATA</p>
          <h2 className="text-xl font-black text-milky-brown">玩家戰況</h2>
        </div>
        <span className="rounded-full bg-milky-apricot px-4 py-1 text-xs font-black text-milky-brown shadow-sm">
          ROUND {game.current_round} / {game.round_count}
        </span>
      </div>
      <div className="max-h-[520px] overflow-auto custom-scrollbar">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 bg-milky-beige/40 text-[10px] font-black uppercase tracking-widest text-milky-brown/50 backdrop-blur-md">
            <tr>
              <th className="px-6 py-3">玩家</th>
              <th className="px-6 py-3 text-center">狀態</th>
              {rounds.map((r) => (
                <th key={r} className="px-2 py-3">
                  R{r}
                </th>
              ))}
              <th className="px-6 py-3">卡片</th>
              <th className="px-6 py-3">位置</th>
              <th className="px-6 py-4 text-center">被動加成</th>
              <th className="px-6 py-4 text-center">預計步數</th>
              <th className="px-6 py-4 text-center">星星</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const sCount = p.cards.filter(c => c.suit === 'S' && !c.is_used).length;
              const cCount = p.cards.filter(c => c.suit === 'C' && !c.is_used).length;
              const mod = sCount - cCount;
              const roundCard = p.cards.find(c => c.round === game.current_round);
              const pred = Math.max(0, (roundCard?.points || 0) + mod);

              const roundKey = String(game.current_round);
              const hasAnswered = !!p.answers[roundKey];
              const hasSelectedSkill = skillActions.some(a => a.player_id === p.id && a.round === game.current_round);

              let statusText = "等待中";
              let statusColor = "text-milky-brown/40";

              if (game.phase === "question") {
                statusText = hasAnswered ? "等待公布答案" : "答題中";
                statusColor = hasAnswered ? "text-milky-accent" : "text-milky-brown animate-pulse";
              } else if (game.phase === "reveal") {
                statusText = "拿到卡牌 (預覽中)";
                statusColor = "text-milky-brown";
              } else if (game.phase === "skill") {
                if (isArbitrating) {
                  statusText = "技能處理中";
                  statusColor = "text-milky-accent animate-pulse";
                } else {
                  statusText = hasSelectedSkill ? "技能選擇完畢" : "技能選擇中";
                  statusColor = hasSelectedSkill ? "text-milky-accent" : "text-milky-brown animate-pulse";
                }
              } else if (game.phase === "settle") {
                statusText = "移動中";
                statusColor = "text-milky-accent animate-bounce";
              } else if (game.phase === "between_rounds") {
                statusText = "準備下回合";
                statusColor = "text-milky-brown/60";
              }

              return (
                <tr key={p.id} className="border-t border-milky-beige/20 hover:bg-milky-apricot/5 transition-colors">
                  <td className="px-6 py-4 font-black text-milky-brown">{p.name}</td>
                  <td className="px-6 py-4">
                    <div className={`text-center font-black text-[10px] uppercase tracking-tighter ${statusColor}`}>
                      {statusText}
                    </div>
                  </td>
                  {rounds.map((r) => {
                    const ans = p.answers[String(r)] as QuizChoice | undefined;
                    return (
                      <td key={r} className="px-2 py-4 font-mono text-xs font-bold text-milky-brown/60">
                        {ans ?? "—"}
                      </td>
                    );
                  })}
                  <td className="px-6 py-4 text-xs font-medium text-milky-brown/70">
                    {p.cards.length === 0 ? (
                      "—"
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {p.cards.slice(-5).map((c) => {
                          const suitMap: Record<string, string> = { S: 'h', C: 'ch', D: 'hu', H: 'st' };
                          return (
                            <div key={c.id} className="relative group w-8 h-12 shadow-sm rounded-md overflow-hidden border border-milky-beige/30">
                              <img src={`https://tbggzrtajphtwrsyqxpg.supabase.co/storage/v1/object/public/media/media/picture/card/card_${suitMap[c.suit]}_${c.points}.png`} alt={c.suit} className="w-full h-full object-cover" />
                              {c.is_used && <div className="absolute inset-0 bg-black/40" />}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 font-black text-milky-brown">{p.position}</td>
                  <td className="px-6 py-4">
                    <div className={`text-center font-black text-milky-brown`}>
                      {mod > 0 ? `+${mod}` : mod}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-center font-black text-milky-accent">
                      {pred} 步
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-center font-black text-milky-accent">
                      ★ {p.stars}
                    </div>
                  </td>
                </tr>
              );
            })}
            {players.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-sm text-slate-500" colSpan={4 + rounds.length}>
                  尚無玩家加入，請分享邀請連結或 QR Code。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

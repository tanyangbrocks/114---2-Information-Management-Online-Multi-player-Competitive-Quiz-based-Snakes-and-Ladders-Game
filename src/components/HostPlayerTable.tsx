"use client";

import type { GameRow, PlayerRow, QuizChoice } from "@/types/game";

type Props = {
  game: GameRow;
  players: PlayerRow[];
};

export function HostPlayerTable({ game, players }: Props) {
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
            {players.map((p) => (
              <tr key={p.id} className="border-t border-milky-beige/20 hover:bg-milky-apricot/5 transition-colors">
                <td className="px-6 py-4 font-black text-milky-brown">{p.name}</td>
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
                      {p.cards.slice(-3).map((c) => (
                        <span key={c.id} className="bg-milky-beige/50 px-2 py-0.5 rounded-full text-[10px] font-bold">
                           {c.suit}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 font-black text-milky-brown">{p.position}</td>
                <td className="px-6 py-4">
                  <div className={`text-center font-black ${(p.passive_modifiers || 0) >= 0 ? 'text-milky-brown' : 'text-rose-400'}`}>
                    {(p.passive_modifiers || 0) > 0 ? `+${p.passive_modifiers}` : (p.passive_modifiers || 0)}
                  </div>
                </td>
                <td className="px-6 py-4">
                   <div className="text-center font-black text-milky-accent">
                      {p.predicted_steps || 0} 步
                   </div>
                </td>
                <td className="px-6 py-4">
                   <div className="text-center font-black text-milky-accent">
                      ★ {p.stars}
                   </div>
                </td>
              </tr>
            ))}
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

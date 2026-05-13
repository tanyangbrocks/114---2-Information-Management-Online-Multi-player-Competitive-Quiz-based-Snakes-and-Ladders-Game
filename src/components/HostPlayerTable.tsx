"use client";

import type { GameRow, PlayerRow, QuizChoice } from "@/types/game";

type Props = {
  game: GameRow;
  players: PlayerRow[];
};

export function HostPlayerTable({ game, players }: Props) {
  const rounds = Array.from({ length: game.round_count }, (_, i) => i + 1);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">即時資料</p>
          <h2 className="text-lg font-semibold text-slate-900">玩家戰況</h2>
        </div>
        <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800">
          回合 {game.current_round}/{game.round_count} · {game.phase}
        </span>
      </div>
      <div className="max-h-[520px] overflow-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">玩家</th>
              {rounds.map((r) => (
                <th key={r} className="px-2 py-2">
                  R{r}
                </th>
              ))}
              <th className="px-3 py-2">卡片</th>
              <th className="px-3 py-2">位置</th>
              <th className="px-3 py-2">星星</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id} className="border-t border-slate-100 odd:bg-white even:bg-slate-50/60">
                <td className="px-3 py-2 font-semibold text-slate-900">{p.name}</td>
                {rounds.map((r) => {
                  const ans = p.answers[String(r)] as QuizChoice | undefined;
                  return (
                    <td key={r} className="px-2 py-2 font-mono text-xs text-slate-800">
                      {ans ?? "—"}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-xs text-slate-700">
                  {p.cards.length === 0 ? (
                    "—"
                  ) : (
                    <ul className="space-y-1">
                      {p.cards.slice(-4).map((c) => (
                        <li key={c.id} className="whitespace-nowrap">
                          {c.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-sm text-slate-900">{p.position}</td>
                <td className="px-3 py-2 font-mono text-sm text-amber-700">{p.stars}</td>
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

"use client";

import { useSnakeLadderBoard } from "@/hooks/useSnakeLadderBoard";
import type { PlayerRow } from "@/types/game";
import { cn } from "@/lib/cn";

const PLAYER_PALETTE = ["#0ea5e9", "#6366f1", "#f97316", "#22c55e", "#e11d48", "#a855f7"];

type Props = {
  players: PlayerRow[];
  selfId?: string | null;
};

export function BoardGrid({ players, selfId }: Props) {
  const { buildZigzagGrid, cellKind } = useSnakeLadderBoard();
  const grid = buildZigzagGrid();

  const occupants = new Map<number, PlayerRow[]>();
  for (const p of players) {
    const list = occupants.get(p.position) ?? [];
    list.push(p);
    occupants.set(p.position, list);
  }

  return (
    <div className="w-full max-w-xl">
      <div className="grid grid-cols-10 gap-1 sm:gap-1.5">
        {grid.flatMap((row) =>
          row.map((cell) => {
            const kind = cellKind(cell);
            const here = occupants.get(cell) ?? [];
            return (
              <div
                key={cell}
                className={cn(
                  "relative flex aspect-square flex-col items-center justify-center rounded-md border text-[10px] font-semibold sm:text-xs",
                  kind === "escalator" && "border-emerald-400 bg-emerald-50 text-emerald-900",
                  kind === "eel" && "border-rose-400 bg-rose-50 text-rose-900",
                  kind === "plain" && "border-slate-200 bg-white text-slate-800"
                )}
              >
                <span>{cell}</span>
                {here.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                    {here.map((p, idx) => {
                      const color = PLAYER_PALETTE[idx % PLAYER_PALETTE.length]!;
                      const isSelf = p.id === selfId;
                      return (
                        <span
                          key={p.id}
                          title={p.name}
                          className={cn(
                            "h-2 w-2 rounded-full ring-1 ring-white",
                            isSelf && "ring-2 ring-amber-400 ring-offset-1"
                          )}
                          style={{ backgroundColor: color }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-amber-400" /> 自己的棋子
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> 手扶梯（向上）
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-rose-500" /> 電鰻（向下）
        </span>
      </div>
    </div>
  );
}

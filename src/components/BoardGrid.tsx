"use client";

import { useSnakeLadderBoard } from "@/hooks/useSnakeLadderBoard";
import type { PlayerRow } from "@/types/game";
import { cn } from "@/lib/cn";
import { useEffect, useState, useMemo } from "react";
import { ESCALATORS, EELS } from "@/lib/game/boardEngine";

const PLAYER_PALETTE = ["#0ea5e9", "#6366f1", "#f97316", "#22c55e", "#e11d48", "#a855f7"];

type Props = {
  players: PlayerRow[];
  selfId?: string | null;
};

/** 計算格子在 10x10 棋盤上的百分比座標 (x, y) */
function getCellCoords(n: number) {
  const r = Math.floor((n - 1) / 10);
  const c = (n - 1) % 10;
  const x = r % 2 === 0 ? c : 9 - c;
  const y = 9 - r;
  return { x: x * 10, y: y * 10 };
}

export function BoardGrid({ players, selfId }: Props) {
  const { buildZigzagGrid, cellKind } = useSnakeLadderBoard();
  const grid = buildZigzagGrid();

  // 取得所有跳轉點的對應關係，方便 UI 標註
  const jumps = useMemo(() => {
    const m = new Map<number, number>();
    for (const [from, to] of ESCALATORS) m.set(from, to);
    for (const [from, to] of EELS) m.set(from, to);
    return m;
  }, []);

  return (
    <div className="relative w-full max-w-xl select-none">
      {/* 棋盤底層 */}
      <div className="grid grid-cols-10 gap-1 sm:gap-1.5">
        {grid.flatMap((row) =>
          row.map((cell) => {
            const kind = cellKind(cell);
            const target = jumps.get(cell);
            return (
              <div
                key={cell}
                className={cn(
                  "relative flex aspect-square flex-col items-center justify-center rounded-md border text-[10px] font-semibold sm:text-xs transition-colors",
                  kind === "escalator" && "border-emerald-400 bg-emerald-50 text-emerald-900",
                  kind === "eel" && "border-rose-400 bg-rose-50 text-rose-900",
                  kind === "plain" && "border-slate-200 bg-white text-slate-800"
                )}
              >
                <span className="opacity-40">{cell}</span>
                {target && (
                  <span className="absolute bottom-0 right-0 p-0.5 text-[8px] opacity-60">
                    {kind === "escalator" ? "▲" : "▼"}
                    {target}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 玩家棋子層 (絕對定位以進行動畫) */}
      <div className="absolute inset-0 pointer-events-none p-0.5 sm:p-0.75">
        {players.map((p, idx) => (
          <PlayerToken
            key={p.id}
            player={p}
            color={PLAYER_PALETTE[idx % PLAYER_PALETTE.length]!}
            isSelf={p.id === selfId}
          />
        ))}
      </div>

      {/* 圖例 */}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full ring-2 ring-amber-400 ring-offset-1 bg-sky-500" /> 自己的棋子
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-md border border-emerald-400 bg-emerald-50" /> 升天電梯 (向上)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-md border border-rose-400 bg-rose-50" /> 電鰻 (向下)
        </span>
      </div>
    </div>
  );
}

function PlayerToken({ player, color, isSelf }: { player: PlayerRow; color: string; isSelf: boolean }) {
  // 動畫位置狀態
  const [displayPos, setDisplayPos] = useState(player.position);
  const [isJumping, setIsJumping] = useState(false);

  useEffect(() => {
    if (player.position !== displayPos) {
      // 檢查是否為跳轉目標 (升天電梯或電鰻)
      const ladderFrom = ESCALATORS.find(([_, to]) => to === player.position)?.[0];
      const eelFrom = EELS.find(([_, to]) => to === player.position)?.[0];
      const triggerPoint = ladderFrom || eelFrom;

      if (triggerPoint && triggerPoint !== displayPos) {
        // 分段動畫：先滑到觸發點 (1s)，再滑到終點 (再 1s)
        setIsJumping(true);
        setDisplayPos(triggerPoint);
        const timer = setTimeout(() => {
          setDisplayPos(player.position);
          setIsJumping(false);
        }, 1000);
        return () => clearTimeout(timer);
      } else {
        // 一般移動：直接滑到終點 (1s)
        setDisplayPos(player.position);
      }
    }
  }, [player.position]);

  const coords = getCellCoords(displayPos);

  return (
    <div
      className="absolute h-[10%] w-[10%] flex items-center justify-center transition-all duration-1000 ease-in-out"
      style={{
        left: `${coords.x}%`,
        top: `${coords.y}%`,
        zIndex: isSelf ? 20 : 10,
      }}
    >
      <div
        className={cn(
          "h-3 w-3 sm:h-4 sm:w-4 rounded-full border-2 border-white shadow-md transition-transform",
          isSelf && "ring-2 ring-amber-400 ring-offset-1 scale-110",
          isJumping && "scale-125" // 跳轉時稍微放大
        )}
        style={{ backgroundColor: color }}
      />
    </div>
  );
}

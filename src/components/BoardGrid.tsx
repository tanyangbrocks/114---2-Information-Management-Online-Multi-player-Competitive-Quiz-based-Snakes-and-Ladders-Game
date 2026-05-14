"use client";

import { useSnakeLadderBoard } from "@/hooks/useSnakeLadderBoard";
import type { PlayerRow } from "@/types/game";
import { cn } from "@/lib/cn";
import { useEffect, useMemo, useState, useRef } from "react";
import { ESCALATORS, EELS } from "@/lib/game/boardEngine";
import { motion, useAnimation } from "framer-motion";

const PLAYER_PALETTE = ["#0ea5e9", "#6366f1", "#f97316", "#22c55e", "#e11d48", "#a855f7"];

/** 計算格子在 10x10 棋盤上的百分比座標 (x, y)，回傳值為 0-100 */
function getCellCoords(n: number) {
  const r = Math.floor((n - 1) / 10);
  const c = (n - 1) % 10;
  const x = r % 2 === 0 ? c : 9 - c;
  const y = 9 - r;
  // 回傳中心點座標
  return { x: x * 10 + 5, y: y * 10 + 5 };
}

export function BoardGrid({ players, selfId }: Props) {
  const { buildZigzagGrid, cellKind } = useSnakeLadderBoard();
  const grid = buildZigzagGrid();

  const connectors = useMemo(() => {
    return [
      ...ESCALATORS.map(([from, to]) => ({ from, to, type: "escalator" as const })),
      ...EELS.map(([from, to]) => ({ from, to, type: "eel" as const }))
    ];
  }, []);

  return (
    <div className="relative w-full max-w-xl select-none aspect-square">
      {/* 棋盤底層 */}
      <div className="grid grid-cols-10 gap-1 sm:gap-1.5 h-full w-full">
        {grid.flatMap((row) =>
          row.map((cell) => {
            const kind = cellKind(cell);
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
                <span className="opacity-30">{cell}</span>
                {/* 標註起點與終點色塊 */}
                {connectors.some(c => c.from === cell) && (
                  <div className={cn(
                    "absolute top-1 right-1 h-1.5 w-1.5 rounded-full",
                    cellKind(cell) === "escalator" ? "bg-emerald-500" : "bg-rose-500"
                  )} />
                )}
                {connectors.some(c => c.to === cell) && (
                  <div className={cn(
                    "absolute bottom-1 left-1 h-1.5 w-1.5 rounded-full opacity-50",
                    connectors.find(c => c.to === cell)?.type === "escalator" ? "bg-emerald-400" : "bg-rose-400"
                  )} />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* SVG 連接線層 */}
      <svg className="absolute inset-0 pointer-events-none h-full w-full overflow-visible" viewBox="0 0 100 100">
        {connectors.map((conn, i) => {
          const start = getCellCoords(conn.from);
          const end = getCellCoords(conn.to);
          const isEscalator = conn.type === "escalator";
          return (
            <line
              key={i}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              stroke={isEscalator ? "#10b981" : "#f43f5e"}
              strokeWidth="1"
              strokeDasharray={isEscalator ? "0" : "2 1"}
              className="opacity-40"
            />
          );
        })}
      </svg>

      {/* 玩家棋子層 */}
      <div className="absolute inset-0 pointer-events-none">
        {players.map((p, idx) => (
          <PlayerToken
            key={p.id}
            player={p}
            color={PLAYER_PALETTE[idx % PLAYER_PALETTE.length]!}
            isSelf={p.id === selfId}
          />
        ))}
      </div>
    </div>
  );
}

function PlayerToken({ player, color, isSelf }: { player: PlayerRow; color: string; isSelf: boolean }) {
  const controls = useAnimation();
  const lastPosRef = useRef(player.position);

  useEffect(() => {
    async function animateMovement() {
      if (player.position === lastPosRef.current) return;
      
      const from = lastPosRef.current;
      const to = player.position;
      
      // 1. 找出是否包含跳轉點（最後一個點）
      const connector = [...ESCALATORS, ...EELS].find(([_, t]) => t === to);
      const intermediateTo = connector ? connector[0] : to;

      // 2. 規劃格子路徑 (Grid Path)
      // 簡化邏輯：如果是前進，路徑就是 [from...intermediateTo]
      const path: number[] = [];
      if (intermediateTo > from) {
        for (let i = from + 1; i <= intermediateTo; i++) path.push(i);
      } else if (intermediateTo < from) {
        for (let i = from - 1; i >= intermediateTo; i--) path.push(i);
      }

      // 3. 執行格子移動 (總共 1s)
      if (path.length > 0) {
        const durationPerStep = 1 / path.length;
        for (const step of path) {
          const coords = getCellCoords(step);
          await controls.start({
            left: `${coords.x}%`,
            top: `${coords.y}%`,
            transition: { duration: durationPerStep, ease: "linear" }
          });
        }
      }

      // 4. 執行跳轉移動 (總共 1s)
      if (connector) {
        const finalCoords = getCellCoords(to);
        await controls.start({
          left: `${finalCoords.x}%`,
          top: `${finalCoords.y}%`,
          scale: [1, 1.3, 1],
          transition: { duration: 1, ease: "easeInOut" }
        });
      }

      lastPosRef.current = to;
    }

    void animateMovement();
  }, [player.position, controls]);

  const initialCoords = useMemo(() => getCellCoords(player.position), []);

  return (
    <motion.div
      animate={controls}
      initial={{
        left: `${initialCoords.x}%`,
        top: `${initialCoords.y}%`,
        x: "-50%",
        y: "-50%"
      }}
      className="absolute h-[10%] w-[10%] flex items-center justify-center"
      style={{ zIndex: isSelf ? 20 : 10 }}
    >
      <div
        className={cn(
          "h-3 w-3 sm:h-4 sm:w-4 rounded-full border-2 border-white shadow-lg",
          isSelf && "ring-2 ring-amber-400 ring-offset-1"
        )}
        style={{ backgroundColor: color }}
      />
    </motion.div>
  );
}

type Props = {
  players: PlayerRow[];
  selfId?: string | null;
};

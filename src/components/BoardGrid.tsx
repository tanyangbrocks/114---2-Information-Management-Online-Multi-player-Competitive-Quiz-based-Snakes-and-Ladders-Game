"use client";

import { useSnakeLadderBoard } from "@/hooks/useSnakeLadderBoard";
import type { PlayerRow } from "@/types/game";
import { cn } from "@/lib/cn";
import { useEffect, useMemo, useRef } from "react";
import { ESCALATORS, EELS } from "@/lib/game/boardEngine";
import { motion, useAnimation } from "framer-motion";



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
  const { buildZigzagGrid } = useSnakeLadderBoard();
  const grid = buildZigzagGrid();



  return (
    <div className="relative w-full max-w-xl select-none aspect-square">
      {/* 棋盤底層 */}
      <div className="grid grid-cols-10 gap-1 sm:gap-1.5 h-full w-full">
        {grid.flatMap((row) =>
          row.map((cell) => {
            return (
              <div
                key={cell}
                className="relative flex h-full w-full items-center justify-center rounded-xl border-2 border-milky-beige/50 bg-white/40"
              >
                <span className="text-[10px] font-black text-milky-brown/20 absolute top-1 left-1.5">
                  {cell}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* SVG 連接線層 */}
      <svg className="absolute inset-0 pointer-events-none h-full w-full overflow-visible" viewBox="0 0 100 100">
        {ESCALATORS.map(([start, end], idx) => {
          const s = getCellCoords(start);
          const e = getCellCoords(end);
          return (
            <path
              key={`ladder-${idx}`}
              d={`M ${s.x} ${s.y} L ${e.x} ${e.y}`}
              stroke="#FBCEB1"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="4 2"
              fill="none"
              className="opacity-60"
            />
          );
        })}
        {EELS.map(([start, end], idx) => {
          const s = getCellCoords(start);
          const e = getCellCoords(end);
          return (
            <path
              key={`eel-${idx}`}
              d={`M ${s.x} ${s.y} L ${e.x} ${e.y}`}
              stroke="#A1887F"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
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
            isSelf={p.id === selfId}
            index={idx}
          />
        ))}
      </div>
    </div>
  );
}

function PlayerToken({ player, isSelf, index }: { player: PlayerRow; isSelf: boolean; index: number }) {
  const controls = useAnimation();
  const lastPosRef = useRef(player.position);

  useEffect(() => {
    async function animateMovement() {
      if (player.position === lastPosRef.current) return;
      
      const from = lastPosRef.current;
      const to = player.position;
      
      const connector = [...ESCALATORS, ...EELS].find(([_, t]) => t === to);
      const intermediateTo = connector ? connector[0] : to;

      const path: number[] = [];
      if (intermediateTo > from) {
        for (let i = from + 1; i <= intermediateTo; i++) path.push(i);
      } else if (intermediateTo < from) {
        for (let i = from - 1; i >= intermediateTo; i--) path.push(i);
      }

      if (path.length > 0) {
        const durationPerStep = Math.min(0.2, 1 / path.length);
        for (const step of path) {
          const coords = getCellCoords(step);
          await controls.start({
            left: `${coords.x}%`,
            top: `${coords.y}%`,
            transition: { duration: durationPerStep, ease: "linear" }
          });
        }
      }

      if (connector) {
        const finalCoords = getCellCoords(to);
        await controls.start({
          left: `${finalCoords.x}%`,
          top: `${finalCoords.y}%`,
          scale: [1, 1.3, 1],
          transition: { duration: 0.8, ease: "easeInOut" }
        });
      }

      lastPosRef.current = to;
    }

    void animateMovement();
  }, [player.position, controls]);

  const initialPos = useRef(player.position);
  const initialCoords = useMemo(() => getCellCoords(initialPos.current), []);

  return (
    <motion.div
      animate={controls}
      initial={{
        left: `${initialCoords.x}%`,
        top: `${initialCoords.y}%`,
        x: `calc(-50% + ${((index % 3) - 1) * 8}px)`,
        y: `calc(-50% + ${(Math.floor(index / 3) - 1) * 8}px)`
      }}
      className="absolute h-[10%] w-[10%] flex items-center justify-center"
      style={{ zIndex: isSelf ? 20 : 10 }}
    >
      <div
        className={cn(
          "h-4 w-4 sm:h-5 sm:w-5 rounded-full border-2 border-white shadow-lg transition-transform",
          isSelf ? "bg-[#5D4037] ring-4 ring-[#FBCEB1]/50 scale-125" : "bg-[#FBCEB1]"
        )}
      >
        {isSelf && (
           <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-1 w-1 bg-white rounded-full animate-ping" />
           </div>
        )}
      </div>
    </motion.div>
  );
}

type Props = {
  players: PlayerRow[];
  selfId?: string | null;
};

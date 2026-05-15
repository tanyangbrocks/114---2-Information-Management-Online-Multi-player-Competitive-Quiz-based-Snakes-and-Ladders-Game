"use client";

import { useSnakeLadderBoard } from "@/hooks/useSnakeLadderBoard";
import type { PlayerRow } from "@/types/game";
import { cn } from "@/lib/cn";
import { useEffect, useMemo, useRef } from "react";
import { ESCALATORS, EELS, bounceOverHundred, applyConnectors } from "@/lib/game/boardEngine";
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

export function BoardGrid({ players, selfId, onPlayerClick, targetablePlayerIds = [], phase }: Props) {
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
            onClick={() => onPlayerClick?.(p.id)}
            isTargetable={targetablePlayerIds.includes(p.id)}
            phase={phase}
          />
        ))}
      </div>
    </div>
  );
}

function PlayerToken({ 
  player, 
  isSelf, 
  index, 
  onClick, 
  isTargetable,
  phase
}: { 
  player: PlayerRow; 
  isSelf: boolean; 
  index: number;
  onClick?: () => void;
  isTargetable?: boolean;
  phase?: string;
}) {
  const controls = useAnimation();
  // 紀錄上一個確實渲染過的位置
  const lastPosRef = useRef(player.position);

  useEffect(() => {
    // 只有在準備階段、題目階段、或回合間隙，才安靜地同步位置起點
    // 這樣在 reveal 或 skill 階段產生的位移，就會在 settle 時被動畫呈現
    if (phase === "lobby" || phase === "question" || phase === "between_rounds") {
      lastPosRef.current = player.position;
      const coords = getCellCoords(player.position);
      controls.set({
        left: `${coords.x}%`,
        top: `${coords.y}%`
      });
    }
  }, [phase, player.position, controls]);

  useEffect(() => {
    // 當進入 settle 或 skill 階段，且位置與上次紀錄不同，則啟動動畫
    if ((phase === "settle" || phase === "skill") && player.position !== lastPosRef.current) {
      void animateMovement();
    }

    async function animateMovement() {
      const from = lastPosRef.current;
      const to = player.position;
      
      // 1. 計算「走步」路徑
      const steps = player.predicted_steps || 0;
      const steppingPath: number[] = [];
      
      if (steps !== 0) {
        const direction = steps > 0 ? 1 : -1;
        const absSteps = Math.abs(steps);
        for (let i = 1; i <= absSteps; i++) {
          steppingPath.push(bounceOverHundred(from + i * direction));
        }
      }

      // 2. 計算「傳送」路徑
      const landingSpot = steppingPath.length > 0 ? steppingPath[steppingPath.length - 1] : from;
      const { path: connectorPath } = applyConnectors(landingSpot);
      
      // 3. 組合完整路徑
      const finalPath = [...steppingPath];
      for (let i = 1; i < connectorPath.length; i++) {
        finalPath.push(connectorPath[i]);
      }
      
      if (to === 1 && finalPath[finalPath.length - 1] !== 1) {
        if (finalPath[finalPath.length - 1] !== 100) finalPath.push(100);
        finalPath.push(1);
      } else if (finalPath.length === 0 || finalPath[finalPath.length - 1] !== to) {
        finalPath.push(to);
      }

      // 執行移動動畫
      const steppingCount = steppingPath.length;
      const durationPerStep = steppingCount > 0 ? 1 / steppingCount : 0.2;

      for (let i = 0; i < finalPath.length; i++) {
        const cell = finalPath[i];
        const coords = getCellCoords(cell);
        const isConnector = i >= steppingCount;
        const duration = isConnector ? 1.0 : durationPerStep;
        
        await controls.start({
          left: `${coords.x}%`,
          top: `${coords.y}%`,
          transition: { 
            duration: duration, 
            ease: isConnector ? "easeInOut" : "linear" 
          }
        });
      }

      lastPosRef.current = to;
    }
  }, [player.position, phase, controls, player.predicted_steps]);

  // 初始渲染位置
  // 初始渲染位置：在結算階段鎖定在移動前的位置，避免因資料更新導致瞬移
  const initialCoords = useMemo(() => {
    const pos = (phase === "settle" && lastPosRef.current !== player.position) 
      ? lastPosRef.current 
      : player.position;
    return getCellCoords(pos);
  }, [player.position, phase]);
  
  const offsetX = (index % 3 - 1) * 8;
  const offsetY = (Math.floor(index / 3) - 1) * 8;

  return (
    <motion.div
      animate={controls}
      initial={{
        left: `${initialCoords.x}%`,
        top: `${initialCoords.y}%`
      }}
      className={cn(
        "absolute h-[10%] w-[10%] flex items-center justify-center",
        isTargetable ? "pointer-events-auto cursor-pointer scale-110 z-[60]" : "pointer-events-none"
      )}
      style={{ 
        zIndex: isSelf ? 50 : 10 + index,
        x: `calc(-50% + ${offsetX}px)`,
        y: `calc(-50% + ${offsetY}px)`
      }}
      onClick={onClick}
    >
      <div
        className={cn(
          "h-5 w-5 sm:h-6 sm:w-6 rounded-full border-2 border-white shadow-xl transition-transform",
          isSelf ? "bg-milky-brown ring-4 ring-white/50 scale-125 z-50" : "bg-white",
          isTargetable && "ring-4 ring-milky-accent animate-pulse bg-milky-accent/20"
        )}
      >
        {isSelf && (
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-white px-2 py-0.5 rounded-md shadow-lg border border-milky-beige">
            <p className="text-[8px] font-black text-milky-brown whitespace-nowrap">ME</p>
          </div>
        )}
        {isTargetable && (
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-milky-accent text-white px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap text-[8px] font-black animate-bounce">
            TARGET
          </div>
        )}
      </div>
    </motion.div>
  );
}

type Props = {
  players: PlayerRow[];
  selfId?: string | null;
  onPlayerClick?: (playerId: string) => void;
  targetablePlayerIds?: string[];
  phase?: string;
};

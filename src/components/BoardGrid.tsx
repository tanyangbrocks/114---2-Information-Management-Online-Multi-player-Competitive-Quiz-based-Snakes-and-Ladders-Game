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

type Props = {
  players: PlayerRow[];
  selfId: string;
  onPlayerClick?: (playerId: string) => void;
  targetablePlayerIds?: string[];
  phase: string;
  currentRound: number;
  manualTarget?: number | null;
  onMoveComplete?: () => void;
};

export function BoardGrid({ players, selfId, onPlayerClick, targetablePlayerIds = [], phase, currentRound, manualTarget, onMoveComplete }: Props) {
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
            currentRound={currentRound}
            manualTarget={p.id === selfId ? manualTarget : null}
            onMoveComplete={onMoveComplete}
          />
        ))}
      </div>
    </div>
  );
}

const TOKEN_COLORS = [
  "#FF6B6B", // 珊瑚紅
  "#4ECDC4", // 薄荷綠
  "#45B7D1", // 冰晶藍
  "#96CEB4", // 灰綠
  "#FFEEAD", // 奶油黃
  "#D4A5A5", // 藕粉
  "#9B59B6", // 紫羅蘭
  "#F1C40F", // 明黃
  "#E67E22", // 亮橘
  "#2ECC71", // 寶石綠
  "#3498DB", // 湛藍
  "#E74C3C", // 朱紅
];

function PlayerToken({ 
  player, 
  isSelf, 
  index, 
  onClick, 
  isTargetable,
  phase,
  currentRound,
  manualTarget,
  onMoveComplete
}: { 
  player: PlayerRow; 
  isSelf: boolean; 
  index: number;
  onClick?: () => void;
  isTargetable?: boolean;
  phase?: string;
  currentRound: number;
  manualTarget?: number | null;
  onMoveComplete?: () => void;
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

  const isMovingRef = useRef(false);
  const processedPosRef = useRef<{ round: number; pos: number } | null>(null);

  useEffect(() => {
    // 當進入 settle 或 skill 階段，且 (位置與上次紀錄不同 或 有手動目標)，且當前不在動畫中
    const isAlreadyProcessed = processedPosRef.current?.round === currentRound && processedPosRef.current?.pos === player.position;
    const hasNewPos = player.position !== lastPosRef.current;
    const hasManual = manualTarget !== null && manualTarget !== undefined && manualTarget !== lastPosRef.current;

    if ((phase === "settle" || phase === "skill") && (hasNewPos || hasManual) && !isMovingRef.current && !isAlreadyProcessed) {
      if (phase === "settle") {
        processedPosRef.current = { round: currentRound, pos: player.position };
      }
      void animateMovement(hasManual ? manualTarget : player.position);
    }

    async function animateMovement(targetPos: number) {
      isMovingRef.current = true;
      const from = lastPosRef.current;
      const to = targetPos;

      // [視覺防震]：在動畫開始前，強迫將棋子鎖定在「視覺出發點」，防止延遲造成的瞬移
      const startCoords = getCellCoords(from);
      controls.set({
        left: `${startCoords.x}%`,
        top: `${startCoords.y}%`
      });
      
      const steppingPath: number[] = [];
      const connectorPaths: number[][] = [];
      
      let p = from;
      const maxSteps = 50; 
      let count = 0;

      // 模擬從起點到終點的全路徑
      const direction = to > from ? 1 : -1;
      while (p !== to && count < maxSteps) {
        count++;
        const next = bounceOverHundred(p + direction);
        steppingPath.push(next);
        p = next;

        // 只有當「這格機關的終點」剛好就是我們的「最終目的地」時，才在這裡中斷走步並轉入傳送
        const { position } = applyConnectors(p);
        if (position === to && p !== to) {
          connectorPaths.push(applyConnectors(p).path);
          p = position;
          break;
        }
      }

      // 執行「走步」動畫：總共 1 秒
      if (steppingPath.length > 0) {
        const durationPerStep = 1 / steppingPath.length;
        for (const cell of steppingPath) {
          const coords = getCellCoords(cell);
          await controls.start({
            left: `${coords.x}%`,
            top: `${coords.y}%`,
            transition: { duration: durationPerStep, ease: "linear" }
          });
        }
      }

      // 執行「傳送」動畫：總共 1 秒 (不論有多少段)
      if (connectorPaths.length > 0) {
        const totalSegments = connectorPaths.reduce((acc, path) => acc + (path.length - 1), 0);
        const durationPerSegment = 1 / totalSegments;
        for (const path of connectorPaths) {
          for (let i = 1; i < path.length; i++) {
            const coords = getCellCoords(path[i]);
            await controls.start({
              left: `${coords.x}%`,
              top: `${coords.y}%`,
              transition: { duration: durationPerSegment, ease: "easeInOut" }
            });
          }
        }
      }

      lastPosRef.current = to;
      isMovingRef.current = false;
      onMoveComplete?.();
    }
  }, [phase, player.position, manualTarget, controls, onMoveComplete, currentRound]);

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
          isSelf ? "ring-4 ring-white/50 scale-125 z-50" : "ring-1 ring-black/10",
          isTargetable && "ring-4 ring-milky-accent animate-pulse"
        )}
        style={{
          backgroundColor: isTargetable ? undefined : TOKEN_COLORS[index % TOKEN_COLORS.length]
        }}
      >
        {isSelf && (
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-white px-2 py-0.5 rounded-md shadow-lg border border-milky-beige z-[70]">
            <p className="text-[8px] font-black text-milky-brown whitespace-nowrap">
              {player.name.startsWith("[Bot] ") ? player.name.replace("[Bot] ", "").substring(0, 2) : player.name.substring(0, 2)}
            </p>
          </div>
        )}
        {isTargetable && (
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-milky-accent text-white px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap text-[8px] font-black animate-bounce z-[70]">
            TARGET
          </div>
        )}
        {!isSelf && !isTargetable && (
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-white/80 px-1.5 py-0.5 rounded shadow text-[7px] font-bold text-milky-brown whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
            {player.name.startsWith("[Bot] ") ? player.name.replace("[Bot] ", "").substring(0, 2) : player.name.substring(0, 2)}
          </div>
        )}
      </div>
    </motion.div>
  );
}



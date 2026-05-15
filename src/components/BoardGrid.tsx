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
  /** 動畫出發點：在 reveal 時快照的自身位置，讓 settle 時能從正確位置播動畫 */
  animateFromPos?: number | null;
};

export function BoardGrid({
  players,
  selfId,
  onPlayerClick,
  targetablePlayerIds = [],
  phase,
  currentRound,
  manualTarget,
  onMoveComplete,
  animateFromPos,
}: Props) {
  const { buildZigzagGrid } = useSnakeLadderBoard();
  const grid = buildZigzagGrid();

  return (
    <div className="relative w-full max-w-xl select-none aspect-square">
      {/* 棋盤底層 */}
      <div className="grid grid-cols-10 gap-1 sm:gap-1.5 h-full w-full">
        {grid.flatMap((row) =>
          row.map((cell) => (
            <div
              key={cell}
              className="relative flex h-full w-full items-center justify-center rounded-xl border-2 border-milky-beige/50 bg-white/40"
            >
              <span className="text-[10px] font-black text-milky-brown/20 absolute top-1 left-1.5">
                {cell}
              </span>
            </div>
          ))
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
            animateFromPos={p.id === selfId ? animateFromPos : null}
          />
        ))}
      </div>
    </div>
  );
}

const TOKEN_COLORS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEEAD",
  "#D4A5A5", "#9B59B6", "#F1C40F", "#E67E22", "#2ECC71",
  "#3498DB", "#E74C3C",
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
  onMoveComplete,
  animateFromPos,
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
  animateFromPos?: number | null;
}) {
  const controls = useAnimation();
  const lastPosRef = useRef(player.position);

  // 在準備/題目/回合間隙，靜默更新棋子位置為最新值
  useEffect(() => {
    if (phase === "lobby" || phase === "question" || phase === "between_rounds") {
      lastPosRef.current = player.position;
      const coords = getCellCoords(player.position);
      controls.set({ left: `${coords.x}%`, top: `${coords.y}%` });
    }
  }, [phase, player.position, controls]);

  const isMovingRef = useRef(false);
  // 紀錄「這回合的這個目標位置」是否已播過動畫，避免 effect 重複觸發
  const processedRef = useRef<{ round: number; pos: number } | null>(null);

  useEffect(() => {
    const isAlreadyProcessed =
      processedRef.current?.round === currentRound &&
      processedRef.current?.pos === player.position;

    // 核心修復：優先使用外部傳入的 animateFromPos 作為出發點
    // 這保證即使組件在 reveal 期間重新掛載，也能從正確位置播動畫
    const fromPos =
      animateFromPos != null && animateFromPos !== player.position
        ? animateFromPos
        : lastPosRef.current;

    const hasNewPos = player.position !== fromPos;
    const hasManual =
      manualTarget != null && manualTarget !== fromPos;

    if (
      (phase === "settle" || phase === "skill") &&
      !isAlreadyProcessed &&
      !isMovingRef.current
    ) {
      if (hasNewPos || hasManual) {
        if (phase === "settle") {
          processedRef.current = { round: currentRound, pos: player.position };
        }
        // 在播動畫前，把 lastPosRef 對齊實際出發點
        lastPosRef.current = fromPos;
        void animateMovement(hasManual ? manualTarget! : player.position);
      } else if (phase === "settle") {
        // 結算階段位置沒有改變，也應該標記為已處理，並直接觸發完成回調
        processedRef.current = { round: currentRound, pos: player.position };
        onMoveComplete?.();
      }
    }

    async function animateMovement(targetPos: number) {
      isMovingRef.current = true;
      const from = lastPosRef.current;
      const to = targetPos;

      // 視覺防震：強制把棋子定位在出發點，防止瞬移
      const startCoords = getCellCoords(from);
      controls.set({ left: `${startCoords.x}%`, top: `${startCoords.y}%` });

      const steppingPath: number[] = [];
      const connectorPaths: number[][] = [];

      let p = from;
      const maxSteps = 50;
      let count = 0;

      const direction = to > from ? 1 : -1;
      while (p !== to && count < maxSteps) {
        count++;
        const next = bounceOverHundred(p + direction);
        steppingPath.push(next);
        p = next;

        // 若路途中遇到傳送機關且終點就是最終目的地，轉入傳送動畫
        const { position } = applyConnectors(p);
        if (position === to && p !== to) {
          connectorPaths.push(applyConnectors(p).path);
          p = position;
          break;
        }
      }

      // 走步動畫：總計 1 秒
      if (steppingPath.length > 0) {
        const durationPerStep = 1 / steppingPath.length;
        for (const cell of steppingPath) {
          const coords = getCellCoords(cell);
          await controls.start({
            left: `${coords.x}%`,
            top: `${coords.y}%`,
            transition: { duration: durationPerStep, ease: "linear" },
          });
        }
      }

      // 傳送動畫：總計 1 秒
      if (connectorPaths.length > 0) {
        const totalSegments = connectorPaths.reduce(
          (acc, path) => acc + (path.length - 1),
          0
        );
        const durationPerSegment = totalSegments > 0 ? 1 / totalSegments : 1;
        for (const path of connectorPaths) {
          for (let i = 1; i < path.length; i++) {
            const coords = getCellCoords(path[i]);
            await controls.start({
              left: `${coords.x}%`,
              top: `${coords.y}%`,
              transition: { duration: durationPerSegment, ease: "easeInOut" },
            });
          }
        }
      }

      lastPosRef.current = to;
      isMovingRef.current = false;
      onMoveComplete?.();
    }
  }, [phase, player.position, manualTarget, controls, onMoveComplete, currentRound, animateFromPos]);

  // 初始渲染位置：在結算階段鎖定在移動前的位置
  const initialCoords = useMemo(() => {
    const pos =
      phase === "settle" && animateFromPos != null && animateFromPos !== player.position
        ? animateFromPos
        : player.position;
    return getCellCoords(pos);
  }, [player.position, phase, animateFromPos]);

  const offsetX = (index % 3 - 1) * 8;
  const offsetY = (Math.floor(index / 3) - 1) * 8;

  return (
    <motion.div
      animate={controls}
      initial={{
        left: `${initialCoords.x}%`,
        top: `${initialCoords.y}%`,
      }}
      className={cn(
        "absolute h-[10%] w-[10%] flex items-center justify-center",
        isTargetable
          ? "pointer-events-auto cursor-pointer scale-110 z-[60]"
          : "pointer-events-none"
      )}
      style={{
        zIndex: isSelf ? 50 : 10 + index,
        x: `calc(-50% + ${offsetX}px)`,
        y: `calc(-50% + ${offsetY}px)`,
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
          backgroundColor: isTargetable
            ? undefined
            : TOKEN_COLORS[index % TOKEN_COLORS.length],
        }}
      >
        {isSelf && (
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-white px-2 py-0.5 rounded-md shadow-lg border border-milky-beige z-[70]">
            <p className="text-[8px] font-black text-milky-brown whitespace-nowrap">
              {player.name.startsWith("[Bot] ")
                ? player.name.replace("[Bot] ", "").substring(0, 2)
                : player.name.substring(0, 2)}
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
            {player.name.startsWith("[Bot] ")
              ? player.name.replace("[Bot] ", "").substring(0, 2)
              : player.name.substring(0, 2)}
          </div>
        )}
      </div>
    </motion.div>
  );
}

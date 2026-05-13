import { useMemo } from "react";
import {
  applyConnectors,
  bounceOverHundred,
  buildZigzagGrid,
  cellKind,
  getJumpTarget,
  moveBySteps
} from "@/lib/game/boardEngine";

export function useSnakeLadderBoard() {
  return useMemo(
    () => ({
      buildZigzagGrid,
      cellKind,
      getJumpTarget,
      bounceOverHundred,
      applyConnectors,
      moveBySteps
    }),
    []
  );
}

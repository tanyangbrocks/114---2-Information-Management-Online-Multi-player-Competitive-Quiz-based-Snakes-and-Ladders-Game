"use client";

import type { QuizChoice } from "@/types/game";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  round: number;
  busy?: boolean;
  onClose?: () => void;
  onPick: (choice: QuizChoice) => void;
};

const OPTIONS: QuizChoice[] = ["A", "B", "C", "D"];

export function QuizModal({ open, round, busy, onClose, onPick }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 px-3 py-6 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-sky-700">主辦方已發題</p>
            <h3 className="text-xl font-semibold text-slate-900">第 {round} 回合</h3>
            <p className="mt-1 text-sm text-slate-600">請選擇正確答案對應的選項。</p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
              aria-label="關閉"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          {OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              disabled={busy}
              onClick={() => onPick(opt)}
              className="rounded-xl border border-slate-200 bg-slate-50 py-4 text-lg font-semibold text-slate-900 transition hover:border-sky-400 hover:bg-sky-50 disabled:cursor-not-allowed"
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

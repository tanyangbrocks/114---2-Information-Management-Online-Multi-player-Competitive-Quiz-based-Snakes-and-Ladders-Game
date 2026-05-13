"use client";

import { createClient } from "@/lib/supabase/browser";
import { generateInviteCode } from "@/lib/game/inviteCode";
import type { QuizChoice, RoundConfig } from "@/types/game";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

const OPTIONS: QuizChoice[] = ["A", "B", "C", "D"];

export default function HostSetupPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [rounds, setRounds] = useState<number>(3);
  const [answers, setAnswers] = useState<QuizChoice[]>(["A", "B", "C"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncAnswersLength = (next: number) => {
    setAnswers((prev) => {
      const copy = [...prev];
      if (copy.length < next) {
        while (copy.length < next) copy.push("A");
      } else {
        copy.length = next;
      }
      return copy;
    });
  };

  const handleRoundsChange = (value: number) => {
    const n = Math.min(20, Math.max(1, value));
    setRounds(n);
    syncAnswersLength(n);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const invite_code = generateInviteCode();
      const host_secret = crypto.randomUUID();
      const rounds_config: RoundConfig[] = answers.map((answer) => ({ answer }));
      const { data, error: insertError } = await supabase
        .from("games")
        .insert({
          invite_code,
          host_secret,
          round_count: rounds,
          rounds_config,
          current_round: 0,
          phase: "lobby",
          question_epoch: 0
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      if (!data?.id) throw new Error("建立場次失敗");
      router.push(`/host/${data.id}?hostSecret=${encodeURIComponent(host_secret)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "建立失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">Host</p>
        <h1 className="text-3xl font-semibold text-slate-900">建立新場次</h1>
        <p className="text-slate-600">設定回合數 N，並為每一回合指定正確答案（A–D）。建立後會導向主辦後臺。</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-6 rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-800">回合數 N（1–20）</span>
          <input
            type="number"
            min={1}
            max={20}
            value={rounds}
            onChange={(e) => handleRoundsChange(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-lg font-semibold text-slate-900 outline-none ring-sky-200 focus:ring-2"
          />
        </label>
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-800">每回合正確答案</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: rounds }, (_, idx) => (
              <label key={idx} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-sm text-slate-600">回合 {idx + 1}</span>
                <select
                  value={answers[idx] ?? "A"}
                  onChange={(e) => {
                    const v = e.target.value as QuizChoice;
                    setAnswers((prev) => {
                      const next = [...prev];
                      next[idx] = v;
                      return next;
                    });
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-semibold text-slate-900"
                >
                  {OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          建立場次並前往後臺
        </button>
      </form>
    </main>
  );
}

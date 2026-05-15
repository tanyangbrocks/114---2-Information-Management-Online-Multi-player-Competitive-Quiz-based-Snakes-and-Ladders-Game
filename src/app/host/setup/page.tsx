"use client";

import { createClient } from "@/lib/supabase/browser";
import { generateInviteCode } from "@/lib/game/inviteCode";
import type { QuizChoice, RoundConfig } from "@/types/game";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Loader2, Sparkles, LayoutDashboard } from "lucide-react";
import { MotionWrapper } from "@/components/MotionWrapper";

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
    <main className="mx-auto max-w-3xl px-4 py-12 page-fade-in">
      <div className="mb-10 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-milky-brown text-white shadow-lg">
           <LayoutDashboard className="h-6 w-6" />
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-milky-brown/40">GAME SETUP</p>
        <h1 className="text-4xl font-black text-milky-brown">建立新冒險</h1>
        <p className="mt-2 text-sm font-bold text-milky-brown/40 max-w-md mx-auto text-balance">
          設定回合總數與正確答案。冒險者將根據答題結果獲得對應的移動步數。
        </p>
      </div>

      <MotionWrapper type="fade">
        <form onSubmit={onSubmit} className="pudding-card border-2 space-y-8 p-8 shadow-xl">
          <label className="block space-y-3">
            <span className="text-sm font-black text-milky-brown/80 ml-1">冒險回合總數 (1–20)</span>
            <input
              type="number"
              min={1}
              max={20}
              value={rounds}
              onChange={(e) => handleRoundsChange(Number(e.target.value))}
              className="w-full rounded-2xl border-2 border-milky-beige bg-white/50 px-5 py-4 text-2xl font-black text-milky-brown outline-none ring-milky-apricot/50 focus:border-milky-apricot focus:ring-4 transition-all"
            />
          </label>

          <div className="space-y-4">
            <span className="text-sm font-black text-milky-brown/80 ml-1">每一回合的正確解答</span>
            <div className="grid gap-3 sm:grid-cols-2 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar p-1">
              {Array.from({ length: rounds }, (_, idx) => (
                <div key={idx} className="flex items-center justify-between gap-3 rounded-2xl border-2 border-milky-beige bg-milky-white/60 px-4 py-3 group hover:border-milky-apricot/30 transition-colors">
                  <span className="text-xs font-black text-milky-brown/40 uppercase tracking-tighter">Round {idx + 1}</span>
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
                    className="rounded-xl border-2 border-milky-beige bg-white px-3 py-1.5 text-sm font-black text-milky-brown outline-none focus:border-milky-apricot"
                  >
                    {OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        選項 {opt}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm font-bold text-milky-accent text-center">＊{error}</p>}
          
          <button
            type="submit"
            disabled={busy}
            className="pudding-button-primary w-full py-5 text-xl shadow-milky-apricot/30"
          >
            {busy ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : (
              <span className="flex items-center justify-center gap-2">
                 <Sparkles className="h-6 w-6" />
                 開啟冒險大門
              </span>
            )}
          </button>
        </form>
      </MotionWrapper>
    </main>
  );
}

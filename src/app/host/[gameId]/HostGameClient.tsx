"use client";

import { HostPlayerTable } from "@/components/HostPlayerTable";
import { QRInvitePanel } from "@/components/QRInvitePanel";
import { createClient } from "@/lib/supabase/browser";
import { rankPlayers } from "@/lib/game/ranking";
import { useGameRealtime } from "@/hooks/useGameRealtime";
import { resolveSkillsAndStartSettle } from "@/app/actions/resolveSkills";
import { useMemo, useState, useEffect, useRef, use } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { Loader2, Radio, SkipForward, Trophy, Sparkles, LayoutDashboard, Gift, Plus, Minus, X, UserPlus } from "lucide-react";
import { giveCardsToPlayer, addBotToGame } from "@/app/actions/hostActions";
import { moveBySteps } from "@/lib/game/boardEngine";
import { countSuits } from "@/lib/game/skillEngine";
import { useCardDraw } from "@/hooks/useCardDraw";
import { MotionWrapper } from "@/components/MotionWrapper";
import type { Suit, QuizChoice } from "@/types/game";

type Props = {
  params: Promise<{ gameId: string }>;
};

export function HostGameClient({ params }: Props) {
  const { gameId } = use(params);
  const searchParams = useSearchParams();
  const hostSecret = searchParams.get("hostSecret") ?? "";

  const { game, players, skillActions, status, error, reload, sendSignal } = useGameRealtime(gameId);
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState<"send" | "next" | "gift" | "bot" | null>(null);
  const [isGiftModalOpen, setIsGiftModalOpen] = useState(false);
  const [selectedGiftPlayerId, setSelectedGiftPlayerId] = useState<string>("");
  const [giftCounts, setGiftCounts] = useState<Record<Suit, number>>({ S: 0, C: 0, D: 0, H: 0 });

  // 在進入 settle 時快照各玩家的舊位置，用於後續比對是否已移動
  const settleBaselineRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (game?.phase === "settle") {
      // 進入 settle 時，若快照為空則建立
      if (settleBaselineRef.current.size === 0) {
        const baseline = new Map<string, number>();
        players.forEach((p) => baseline.set(p.id, p.position));
        settleBaselineRef.current = baseline;
      }
    } else {
      // 離開 settle 時清空快照
      settleBaselineRef.current = new Map();
    }
  }, [game?.phase, players]);

  // 判斷玩家是否已完成移動
  const isPlayerMoved = (p: typeof players[number]) => {
    if (!game || game.phase !== "settle") return false;
    const card = p.cards.find((c) => c.round === game.current_round);
    if (!card) return false;
    if (card.points === 0) return true; // 移動0格，位置不變但已結算
    const baseline = settleBaselineRef.current.get(p.id);
    return baseline !== undefined && p.position !== baseline;
  };


  const authorized = game && hostSecret && game.host_secret === hostSecret;
  const inviteUrl =
    typeof window !== "undefined" && game ? `${window.location.origin}/play/${game.invite_code}` : "";

  // 移除了手動建立頻道的邏輯，改用 Hook 提供的 sendSignal

  const sendQuestion = async () => {
    if (!game) return;
    setBusy("send");
    try {
      const epoch = game.question_epoch + 1;
      const { error: upErr } = await supabase
        .from("games")
        .update({
          phase: "question",
          question_epoch: epoch
        })
        .eq("id", game.id);
      if (upErr) throw upErr;
      await reload();
      await sendSignal();
    } catch (e) {
      alert(e instanceof Error ? e.message : "發送失敗");
    } finally {
      setBusy(null);
    }
  };

  const startGame = async () => {
    if (!game) return;
    setBusy("next");
    try {
      const { error: upErr } = await supabase
        .from("games")
        .update({ phase: "between_rounds", current_round: 1 })
        .eq("id", game.id);
      if (upErr) throw upErr;
      await reload();
      await sendSignal();
    } catch (e) {
      alert(e instanceof Error ? e.message : "啟動失敗");
    } finally {
      setBusy(null);
    }
  };

  const revealAnswer = async () => {
    if (!game) return;
    setBusy("send");
    try {
      const { error: upErr } = await supabase.from("games").update({ phase: "reveal" }).eq("id", game.id);
      if (upErr) throw upErr;
      await reload();
      await sendSignal();
    } catch (e) {
      alert(e instanceof Error ? e.message : "公布失敗");
    } finally {
      setBusy(null);
    }
  };

  const enterSkillPhase = async () => {
    if (!game) return;
    setBusy("next");
    try {
      const { error: upErr } = await supabase.from("games").update({ phase: "skill" }).eq("id", game.id);
      if (upErr) throw upErr;
      await reload();
      await sendSignal();
    } catch (e) {
      alert(e instanceof Error ? e.message : "進入技能發動失敗");
    } finally {
      setBusy(null);
    }
  };

  const [waitingActionId, setWaitingActionId] = useState<string | null>(null);
  const [waitingTargetName, setWaitingTargetName] = useState<string | null>(null);

  // 當技能列表更新時，同步反制等待狀態
  useEffect(() => {
    if (!skillActions || !waitingActionId) return;
    const stillWaiting = skillActions.some(a => a.id === waitingActionId && a.status === 'waiting_counter');
    if (!stillWaiting) {
      setWaitingActionId(null);
      setWaitingTargetName(null);
    }
  }, [skillActions, waitingActionId]);

  const settleMoves = async () => {
    if (!game) return;
    setBusy("next");
    try {
      const res = await resolveSkillsAndStartSettle(game.id, game.current_round);
      if (res.waitingForCounter) {
        setWaitingActionId(res.actionId);
        setWaitingTargetName(res.targetName);
      } else {
        setWaitingActionId(null);
        setWaitingTargetName(null);
      }
      await reload();
      await sendSignal();
    } catch (e) {
      alert(e instanceof Error ? e.message : "結算失敗");
    } finally {
      setBusy(null);
    }
  };

  const advanceRound = async () => {
    if (!game) return;
    setBusy("next");
    try {
      const finished = game.current_round >= game.round_count;
      const nextPhase = finished ? "finished" : "between_rounds";
      const nextRound = finished ? game.current_round : game.current_round + 1;

      const { error: upErr } = await supabase
        .from("games")
        .update({
          phase: nextPhase,
          current_round: nextRound
        })
        .eq("id", game.id);

      if (upErr) throw upErr;

      // 清除所有玩家的預測步數，為下一輪做準備
      await supabase.from("players").update({ predicted_steps: 0 }).eq("game_id", game.id);

      await reload();
      await sendSignal();
    } catch (e) {
      alert(e instanceof Error ? e.message : "更新失敗");
    } finally {
      setBusy(null);
    }
  };

  const handleGiveCards = async () => {
    if (!selectedGiftPlayerId) return;
    setBusy("gift");
    try {
      const res = await giveCardsToPlayer(selectedGiftPlayerId, giftCounts);
      if (res.success) {
        setIsGiftModalOpen(false);
        setGiftCounts({ S: 0, C: 0, D: 0, H: 0 });
        await reload();
      } else {
        alert(res.error);
      }
    } catch {
      alert("操作失敗");
    } finally {
      setBusy(null);
    }
  };

  const updateGiftCount = (suit: Suit, delta: number) => {
    setGiftCounts(prev => ({
      ...prev,
      [suit]: Math.max(0, prev[suit] + delta)
    }));
  };

  const handleAddBot = async () => {
    if (!game) return;
    setBusy("bot");
    try {
      const res = await addBotToGame(game.id);
      if (res.success) {
        await reload();
      } else {
        alert(res.error);
      }
    } catch {
      alert("新增失敗");
    } finally {
      setBusy(null);
    }
  };

  const { drawForSlot } = useCardDraw();
  const botProcessedRef = useRef<Set<string>>(new Set());

  // 機器人 AI 邏輯
  useEffect(() => {
    if (!game || game.phase === "lobby" || game.phase === "between_rounds" || game.phase === "finished") {
      botProcessedRef.current.clear();
      return;
    }

    const processBots = async () => {
      const bots = players.filter(p => p.name.startsWith("[Bot]"));
      for (const bot of bots) {
        const actionKey = `${game.phase}_${game.current_round}_${bot.id}`;
        if (botProcessedRef.current.has(actionKey)) continue;

        // 1. 答題階段：隨機答題
        if (game.phase === "question") {
          const roundKey = String(game.current_round);
          if (!bot.answers[roundKey]) {
            const choices: QuizChoice[] = ["A", "B", "C", "D"];
            const randomAnswer = choices[Math.floor(Math.random() * 4)];
            const updatedAnswers = { ...bot.answers, [roundKey]: randomAnswer };
            await supabase.from("players").update({ answers: updatedAnswers }).eq("id", bot.id);
            botProcessedRef.current.add(actionKey);
          }
        }

        // 2. 公布答案階段：自動抽卡
        if (game.phase === "reveal") {
          const alreadyDrawn = bot.cards.some(c => c.round === game.current_round);
          if (!alreadyDrawn) {
            const roundKey = String(game.current_round);
            const cfg = game.rounds_config[game.current_round - 1];
            if (cfg) {
              const isCorrect = bot.answers[roundKey] === cfg.answer;
              const card = drawForSlot(isCorrect ? 2 : 1, game.current_round);
              const updatedCards = [...bot.cards, card];
              await supabase.from("players").update({ cards: updatedCards }).eq("id", bot.id);
              botProcessedRef.current.add(actionKey);
            }
          }
        }

        // 3. 技能階段：機器人一律略過 (PASS) 以簡化邏輯
        if (game.phase === "skill") {
          const hasAction = skillActions?.some(a => a.player_id === bot.id && a.round === game.current_round);
          if (!hasAction) {
            await supabase.from("skill_actions").insert({
              game_id: game.id,
              round: game.current_round,
              player_id: bot.id,
              action_type: "PASS",
              status: "ready",
              consumed_cards: []
            });
            botProcessedRef.current.add(actionKey);
          }
        }

        // 4. 結算階段：自動移動
        if (game.phase === "settle") {
          const card = bot.cards.find(c => c.round === game.current_round);
          if (card && !card.is_used) {
            const suitCounts = countSuits(bot.cards.filter(c => !c.is_used));
            const move = moveBySteps(bot.position, card.points, {
               spades: suitCounts.S,
               clubs: suitCounts.C
            });
            const updatedCards = bot.cards.map(c => c.id === card.id ? { ...c, is_used: true } : c);
            await supabase.from("players").update({
              position: move.position,
              stars: bot.stars + move.starsGained,
              cards: updatedCards
            }).eq("id", bot.id);
            botProcessedRef.current.add(actionKey);
          }
        }
      }
    };

    void processBots();
  }, [game, players, skillActions, drawForSlot, supabase]);

  if (status === "loading" || status === "idle") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-milky-brown">
        <Loader2 className="h-10 w-10 animate-spin opacity-40" />
      </div>
    );
  }

  if (error || !game) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="pudding-card bg-milky-white border-milky-beige">
           <p className="text-milky-brown font-bold opacity-60">{error ?? "找不到場次"}</p>
        </div>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold text-slate-900">無法驗證主辦身分</h1>
        <p className="mt-2 text-slate-600">請使用建立場次後產生的網址（包含 hostSecret 參數）。</p>
      </main>
    );
  }

  const top = rankPlayers(players);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 page-fade-in">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
             <div className="bg-milky-brown text-white p-1.5 rounded-lg">
                <LayoutDashboard className="h-4 w-4" />
             </div>
             <p className="text-[10px] font-black uppercase tracking-[0.3em] text-milky-brown/40">HOST CONTROL CENTER</p>
          </div>
          <h1 className="text-3xl font-black text-milky-brown">冒險主辦後臺</h1>
          <p className="text-sm font-bold text-milky-brown/40">管理冒險進度與玩家互動</p>
        </div>
        {game.phase === "lobby" ? (
          <div className="flex flex-col gap-4">
            <MotionWrapper type="bounce" className="pudding-card !bg-milky-apricot/20 border-milky-apricot/30 flex items-center gap-6 py-4 px-8">
              <h3 className="text-sm font-black text-milky-brown/60 italic">等待人員到齊中...</h3>
              <div className="flex gap-4">
                <button
                  onClick={handleAddBot}
                  disabled={busy !== null}
                  className="pudding-button border-2 border-milky-brown bg-white text-milky-brown hover:bg-milky-brown hover:text-white flex items-center gap-2"
                >
                  <UserPlus className="h-5 w-5" />
                  加入機器人
                </button>
                <button
                  onClick={() => setIsGiftModalOpen(true)}
                  className="pudding-button border-2 border-milky-apricot bg-white text-milky-apricot hover:bg-milky-apricot hover:text-white flex items-center gap-2"
                >
                  <Gift className="h-5 w-5" />
                  發放物資
                </button>
                <button
                  onClick={startGame}
                  disabled={busy !== null}
                  className="pudding-button-primary shadow-milky-apricot/40 px-10 text-lg"
                >
                  {busy === "next" ? <Loader2 className="h-6 w-6 animate-spin" /> : "啟動冒險"}
                </button>
              </div>
            </MotionWrapper>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-4 bg-white/40 p-2 rounded-[2.5rem] border-2 border-milky-beige backdrop-blur-sm">
            {game.phase === "between_rounds" && (
              <button
                onClick={sendQuestion}
                disabled={busy !== null}
                className="pudding-button-primary flex items-center gap-2"
              >
                {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
                發送下一題
              </button>
            )}
            {game.phase === "question" && (
              <button
                onClick={revealAnswer}
                disabled={busy !== null}
                className="pudding-button bg-milky-accent text-white hover:opacity-90 flex items-center gap-2"
              >
                {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                公布答案
              </button>
            )}
            {game.phase === "reveal" && (
              <button
                onClick={enterSkillPhase}
                disabled={busy !== null}
                className="pudding-button bg-milky-brown text-white hover:opacity-90 flex items-center gap-2"
              >
                {busy === "next" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                進入技能階段
              </button>
            )}
            {game.phase === "skill" && (
              <div className="flex items-center gap-4">
                {waitingActionId && (
                  <div className="flex items-center gap-2 bg-milky-accent/20 border-2 border-milky-accent px-4 py-2 rounded-2xl animate-pulse">
                     <Loader2 className="h-4 w-4 animate-spin text-milky-accent" />
                     <span className="text-xs font-black text-milky-brown uppercase tracking-widest">等待 {waitingTargetName} 反制中</span>
                  </div>
                )}
                <button
                  onClick={settleMoves}
                  disabled={busy !== null || !!waitingActionId}
                  className="pudding-button bg-milky-apricot text-milky-brown hover:opacity-90 flex items-center gap-2 shadow-lg"
                >
                  {busy === "next" ? <Loader2 className="h-4 w-4 animate-spin" /> : <SkipForward className="h-4 w-4" />}
                  執行結算
                </button>
              </div>
            )}
            {game.phase === "settle" && (
              <button
                onClick={advanceRound}
                disabled={busy !== null}
                className="pudding-button-secondary border-2 border-milky-brown/10 flex items-center gap-2"
              >
                {busy === "next" ? <Loader2 className="h-4 w-4 animate-spin" /> : <SkipForward className="h-4 w-4" />}
                下一回合
              </button>
            )}
          </div>
        )}
      </header>

      <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
        <QRInvitePanel inviteUrl={inviteUrl} inviteCode={game.invite_code} />
        <HostPlayerTable game={game} players={players} />
      </div>

      {/* settle 階段：顯示各玩家移動確認狀態 */}
      {game.phase === "settle" && (
        <section className="mt-8 pudding-card !bg-milky-white/40 border-milky-beige">
          <div className="flex items-center gap-2 mb-4">
             <div className="bg-milky-brown text-white p-1 rounded-lg">
                <SkipForward className="h-4 w-4" />
             </div>
             <h2 className="text-lg font-black text-milky-brown">玩家移動進度</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {players.map((p) => {
              const done = isPlayerMoved(p);
              return (
                <MotionWrapper type="bounce"
                  key={p.id}
                  className={`flex flex-col gap-1 rounded-2xl border-2 px-4 py-3 transition-all ${
                    done
                      ? "border-milky-apricot bg-white text-milky-brown shadow-sm"
                      : "border-milky-beige bg-milky-beige/20 text-milky-brown/40"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <p className="font-black truncate">{p.name}</p>
                    <span className="text-lg">{done ? "✓" : "⏳"}</span>
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-tight">
                    {done ? `到第 ${p.position} 格` : "計算中..."}
                  </p>
                </MotionWrapper>
              );
            })}
          </div>
        </section>
      )}
      {game.phase === "finished" && (
        <section className="mt-12 pudding-card !bg-milky-apricot/10 border-milky-apricot/30">
          <div className="mb-6 flex items-center gap-4 text-milky-brown">
            <div className="bg-milky-apricot text-white p-3 rounded-2xl shadow-lg">
               <Trophy className="h-8 w-8" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-milky-brown/40">FINAL RESULTS</p>
              <h2 className="text-3xl font-black">冒險傳奇排名</h2>
            </div>
          </div>
          <ol className="grid gap-4 sm:grid-cols-3">
            {top.map((p, idx) => (
              <MotionWrapper type="fade" delay={idx * 0.1} key={p.id} className="pudding-card !bg-white/80 !p-5 relative overflow-hidden group">
                <div className={`absolute top-0 right-0 px-4 py-1 rounded-bl-2xl font-black text-xs text-white ${idx === 0 ? 'bg-milky-apricot' : idx === 1 ? 'bg-milky-accent' : 'bg-milky-brown/40'}`}>
                   RANK {idx + 1}
                </div>
                <p className="text-xl font-black text-milky-brown group-hover:scale-110 transition-transform">{p.name}</p>
                <div className="mt-3 flex justify-between items-end">
                   <div>
                      <p className="text-[10px] font-bold text-milky-brown/40 uppercase">STARS</p>
                      <p className="text-lg font-black text-milky-accent">★ {p.stars}</p>
                   </div>
                   <div className="text-right">
                      <p className="text-[10px] font-bold text-milky-brown/40 uppercase">CELL</p>
                      <p className="text-lg font-black">{p.position}</p>
                   </div>
                </div>
              </MotionWrapper>
            ))}
            {top.length === 0 && <p className="text-sm font-bold text-milky-brown/30">無人完成冒險...</p>}
          </ol>
        </section>
      )}
      {/* 管理員給予卡片 Modal */}
      <AnimatePresence>
        {isGiftModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-milky-brown/60 p-4 backdrop-blur-sm">
            <MotionWrapper type="fade" className="w-full max-w-md">
              <div className="pudding-card bg-white shadow-2xl border-4 border-milky-apricot relative">
                <button 
                  onClick={() => setIsGiftModalOpen(false)}
                  className="absolute top-4 right-4 text-milky-brown/40 hover:text-milky-brown transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>

                <div className="flex items-center gap-3 mb-8">
                  <div className="bg-milky-apricot text-white p-2 rounded-xl shadow-lg">
                    <Gift className="h-6 w-6" />
                  </div>
                  <h2 className="text-2xl font-black text-milky-brown tracking-tighter">給予玩家物資</h2>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-black text-milky-brown/40 uppercase tracking-widest block mb-2">選擇對象</label>
                    <select 
                      value={selectedGiftPlayerId}
                      onChange={(e) => setSelectedGiftPlayerId(e.target.value)}
                      className="w-full pudding-card !bg-milky-beige/10 border-milky-beige text-milky-brown font-bold focus:outline-none focus:border-milky-apricot transition-colors"
                    >
                      <option value="">請選擇玩家...</option>
                      {players.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {(["S", "C", "D", "H"] as Suit[]).map(suit => (
                      <div key={suit} className="pudding-card !bg-white border-milky-beige/50 flex flex-col items-center gap-3">
                        <span className="text-2xl">
                          {suit === 'S' && '♠'}
                          {suit === 'C' && '♣'}
                          {suit === 'D' && '♦'}
                          {suit === 'H' && '♥'}
                        </span>
                        <div className="flex items-center gap-4">
                          <button 
                            onClick={() => updateGiftCount(suit, -1)}
                            className="h-8 w-8 rounded-full bg-milky-beige/30 flex items-center justify-center text-milky-brown hover:bg-milky-beige transition-colors"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="text-xl font-black text-milky-brown w-6 text-center">{giftCounts[suit]}</span>
                          <button 
                            onClick={() => updateGiftCount(suit, 1)}
                            className="h-8 w-8 rounded-full bg-milky-apricot/20 flex items-center justify-center text-milky-apricot hover:bg-milky-apricot/30 transition-colors"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleGiveCards}
                    disabled={busy === "gift" || !selectedGiftPlayerId || Object.values(giftCounts).every(v => v === 0)}
                    className="pudding-button-primary w-full py-4 text-lg shadow-xl"
                  >
                    {busy === "gift" ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : "確認發放"}
                  </button>
                </div>
              </div>
            </MotionWrapper>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}

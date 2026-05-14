"use client";

import { BoardGrid } from "@/components/BoardGrid";
import { useCardDraw } from "@/hooks/useCardDraw";
import { useGameRealtime } from "@/hooks/useGameRealtime";
import { rankPlayers } from "@/lib/game/ranking";
import { createClient } from "@/lib/supabase/browser";
import { usePlayerSessionStore } from "@/store/playerSessionStore";
import { type QuizChoice, type GameCard } from "@/types/game";
import { calculateAvailableSkills, countSuits, type AvailableSkill } from "@/lib/game/skillEngine";
import { MotionWrapper } from "@/components/MotionWrapper";
import { Loader2, Sparkles, User, Radio, SkipForward, Heart } from "lucide-react";
import { useEffect, useMemo, useRef, useState, use, useCallback } from "react";
import { moveBySteps } from "@/lib/game/boardEngine";
import { castSkill } from "@/app/actions/skills";
import { respondToSkillCounter } from "@/app/actions/resolveSkills";


type Props = {
  params: Promise<{ code: string }>;
};

export function PlayClient({ params }: Props) {
  const { code } = use(params);
  const supabase = useMemo(() => createClient(), []);
  const [gameId, setGameId] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [joinName, setJoinName] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [answerBusy, setAnswerBusy] = useState(false);

  const { drawForSlot } = useCardDraw();

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("games")
      .select("id")
      .eq("invite_code", code)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setLookupError(error.message);
        else if (!data?.id) setLookupError("找不到此邀請碼");
        else setGameId(String(data.id));
      });
    return () => {
      cancelled = true;
    };
  }, [code, supabase]);

  const { game, players, skillActions, status, error, reload, sendSignal, sendMoveDone } = useGameRealtime(gameId);
  const playerId = usePlayerSessionStore((s) => (gameId ? s.playerByGame[gameId] : undefined));
  const setPlayerId = usePlayerSessionStore((s) => s.setPlayerId);

  const self = useMemo(() => players.find((p) => p.id === playerId), [players, playerId]);

  // 移除了手動建立頻道的邏輯，改用 Hook 提供的 sendSignal

  const joinGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gameId || !joinName.trim()) return;
    setJoinBusy(true);
    setJoinError(null);
    try {
      const { data, error: insErr } = await supabase
        .from("players")
        .insert({
          game_id: gameId,
          name: joinName.trim(),
          position: 1,
          stars: 0,
          cards: [],
          answers: {}
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      if (!data?.id) throw new Error("加入失敗");
      setPlayerId(gameId, String(data.id));
      await reload();
      await sendSignal();
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "加入失敗");
    } finally {
      setJoinBusy(false);
    }
  };

  const handleAnswer = async (choice: QuizChoice) => {
    if (!game || !self) return;
    if (game.phase !== "question") return;
    const roundKey = String(game.current_round);
    if (self.answers[roundKey]) return;

    setAnswerBusy(true);
    try {
      const newAnswers = { ...self.answers, [roundKey]: choice };
      const { error: upErr } = await supabase
        .from("players")
        .update({ answers: newAnswers })
        .eq("id", self.id);
      if (upErr) throw upErr;
      await reload();
      await sendSignal();
    } catch (err) {
      alert(err instanceof Error ? err.message : "送出失敗");
    } finally {
      setAnswerBusy(false);
    }
  };

  // 處理抽卡邏輯 (當主辦方進入 reveal 階段)
  useEffect(() => {
    if (game?.phase === "reveal" && self && gameId) {
      const alreadyDrawn = self.cards.some((c) => c.round === game.current_round);
      if (!alreadyDrawn) {
        const roundKey = String(game.current_round);
        const choice = self.answers[roundKey];
        if (!choice) return; // 沒答題就沒卡

        const cfg = game.rounds_config[game.current_round - 1];
        if (!cfg) return;

        const isCorrect = cfg.answer === choice;
        const card = drawForSlot(isCorrect ? 2 : 1, game.current_round);
        const newCards = [...self.cards, card];

        void supabase
          .from("players")
          .update({ cards: newCards })
          .eq("id", self.id)
          .then(() => {
            void reload();
            void sendSignal();
          });
      }
    }
  }, [game?.phase, game?.current_round, game?.rounds_config, self, gameId, drawForSlot, reload, sendSignal, supabase]);

  // 用 ref 記錄「已結算的回合編號」，防止 settle useEffect 因 self 改變而無限觸發
  const settledRoundRef = useRef<number>(-1);

  // 記錄玩家「已完成移動的回合編號」，移動完畢後立即關閉等待 modal
  const [movedRound, setMovedRound] = useState<number>(-1);

  // 技能相關狀態
  const [skillBusy, setSkillBusy] = useState(false);
  const [hasActedSkill, setHasActedSkill] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<string>("");

  // 當回合改變時重置技能狀態
  useEffect(() => {
    setHasActedSkill(false);
    setSelectedTarget("");
    setPendingCounter(null);
    setSnakeTarget(null);
  }, [game?.current_round]);

  // 反制相關狀態
  const [pendingCounter, setPendingCounter] = useState<{ id: string, action_type: string } | null>(null);
  const [snakeTarget, setSnakeTarget] = useState<{ position: number, starsGained: number, cards: GameCard[] } | null>(null);

  // 監聽是否有需要自己反制的技能
  useEffect(() => {
    if (!self || !skillActions) return;
    const counterAction = skillActions.find(a => a.target_player_id === self.id && a.status === 'waiting_counter');
    if (counterAction) {
      setPendingCounter({ id: counterAction.id, action_type: counterAction.action_type });
    } else {
      setPendingCounter(null);
    }
  }, [skillActions, self]);

  const performMove = useCallback(async (pos: number, stars: number, heartToConsume?: string) => {
    if (!self || !game) return;
    try {
      if (heartToConsume) {
        const newCards = self.cards.map(c => c.id === heartToConsume ? { ...c, is_used: true } : c);
        await supabase.from("players").update({ cards: newCards }).eq("id", self.id);
      }
      
      const { error: upErr } = await supabase
        .from("players")
        .update({ position: pos, stars: self.stars + stars })
        .eq("id", self.id);
      if (upErr) throw upErr;
      await reload();
      setMovedRound(game.current_round);
      void sendMoveDone(self.id, self.name, pos);
      void sendSignal();
    } catch (e) {
      console.error(e);
    }
  }, [self, game, supabase, reload, sendMoveDone, sendSignal]);

  // 處理移動邏輯 (當主辦方進入 settle 階段)
  useEffect(() => {
    if (game?.phase === "settle" && self && gameId) {
      // 如果這個回合已經結算過，直接跳過
      if (settledRoundRef.current === game.current_round) return;

      const card = self.cards.find((c) => c.round === game.current_round);
      if (!card) return;

      // 先標記為「已結算」，防止重複執行
      settledRoundRef.current = game.current_round;

      const move = moveBySteps(self.position, card.points);
      
      // 偵測是否遇到蛇 (掉落步數 > 0)
      if (move.position < (self.position + card.points)) {
        const hearts = self.cards.filter(c => !c.is_used && c.suit === 'H');
        if (hearts.length > 0) {
          // 彈出紅心抵銷提示
          setSnakeTarget({ position: move.position, starsGained: move.starsGained, cards: hearts });
          return;
        }
      }

      void performMove(move.position, move.starsGained);
    }
  }, [game?.phase, game?.current_round, self, gameId, reload, sendSignal, sendMoveDone, supabase, performMove]);

  // boardPlayers 只在棋盤可見時才更新，確保動畫在玩家看到棋盤後才播放
  const [boardPlayers, setBoardPlayers] = useState(players);

  // 結算移動完成後（movedRound 改變），此時 players 已包含新位置，觸發棋盤更新與動畫
  useEffect(() => {
    setBoardPlayers(players);
  }, [movedRound]); // eslint-disable-line react-hooks/exhaustive-deps

  // 在非遮蓋階段（回合間、大廳、結束）也即時同步棋盤顯示
  useEffect(() => {
    const phase = game?.phase;
    if (phase === "between_rounds" || phase === "lobby" || phase === "finished") {
      setBoardPlayers(players);
    }
  }, [game?.phase, players]);

  if (lookupError) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <p className="text-rose-600">{lookupError}</p>
      </main>
    );
  }

  if (!gameId || status === "loading" || status === "idle") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-milky-brown">
        <Loader2 className="h-10 w-10 animate-spin opacity-40" />
      </div>
    );
  }

  if (error || !game) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <p className="text-rose-600">{error ?? "無法載入場次"}</p>
      </main>
    );
  }

  if (!playerId || !self) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-10 page-fade-in">
        <MotionWrapper type="bounce" className="pudding-card">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-milky-apricot/30 text-milky-brown">
              <User className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-milky-brown/60">PLAYER JOIN</p>
              <h1 className="text-2xl font-black text-milky-brown">加入冒險</h1>
            </div>
          </div>
          <form className="space-y-5" onSubmit={joinGame}>
            <label className="block space-y-2">
              <span className="text-sm font-bold text-milky-brown/80 ml-1">冒險者稱號</span>
              <input
                required
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                className="w-full rounded-2xl border-2 border-milky-beige bg-white/50 px-4 py-3 text-milky-brown outline-none ring-milky-apricot/50 focus:border-milky-apricot focus:ring-4"
                placeholder="輸入您的名字..."
              />
            </label>
            {joinError && <p className="text-sm font-medium text-rose-500 ml-1">＊{joinError}</p>}
            <button
              type="submit"
              disabled={joinBusy}
              className="pudding-button-primary w-full text-lg shadow-milky-apricot/20"
            >
              {joinBusy ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : (
                <span className="flex items-center justify-center gap-2">
                   <Sparkles className="h-5 w-5" />
                   開始冒險
                </span>
              )}
            </button>
          </form>
        </MotionWrapper>
      </main>
    );
  }

  const roundKey = String(game.current_round);
  // 是否需要答題：在題目階段且還沒答
  const needsAnswer = game.phase === "question" && !self.answers[roundKey];
  // 是否已答題但在等公布：在題目階段且已答
  const isWaitingReveal = game.phase === "question" && !!self.answers[roundKey];
  // 是否正在看抽卡結果：在公布階段
  const isShowingReveal = game.phase === "reveal";
  // 是否在發動技能：在技能階段
  const isSkillPhase = game.phase === "skill";
  // 是否在等待結算：在結算階段且玩家尚未移動完畢
  const isWaitingSettle = game.phase === "settle" && movedRound !== game.current_round;
  const isCounterPhase = !!pendingCounter || !!snakeTarget;
  const podium = rankPlayers(players);

  // 技能相關變數
  const availableCards = self?.cards?.filter((c) => !c.is_used) || [];
  const suitCounts = countSuits(availableCards);
  const availableSkills = calculateAvailableSkills(self?.cards || []);

  const handleCastSkill = async (skill: AvailableSkill) => {
    if (!game || !self) return;
    if (skill.requiresTarget && !selectedTarget) {
      alert("請選擇對象");
      return;
    }
    setSkillBusy(true);
    try {
      // 簡單的自動選卡邏輯 (取最早拿到的牌)
      // 實務上可能需要玩家自己勾選，這裡先簡單根據消耗種類隨機抓
      // 假設 U-3 是消耗全部
      let consumed: (string | undefined)[] = [];
      if (skill.actionType === "U-3") consumed = availableCards.map(c => c.id);
      else if (skill.actionType === "S-1") consumed = [availableCards.find(c => c.suit === "S")?.id];
      else if (skill.actionType === "S-2") consumed = availableCards.filter(c => c.suit === "S").slice(0, 2).map(c => c.id);
      else if (skill.actionType === "C-1") consumed = [availableCards.find(c => c.suit === "C")?.id];
      else if (skill.actionType === "C-2") consumed = availableCards.filter(c => c.suit === "C").slice(0, 2).map(c => c.id);
      else if (skill.actionType === "H-1") consumed = [availableCards.find(c => c.suit === "H")?.id];
      // U-1, U-2 消耗較複雜，需要一套選卡系統，這裡暫時隨便抓需要的張數 (3張/4張)
      else if (skill.actionType === "U-1") consumed = availableCards.slice(0, 3).map(c => c.id);
      else if (skill.actionType === "U-2") consumed = availableCards.slice(0, 4).map(c => c.id);

      const finalConsumed = consumed.filter(Boolean) as string[];

      const res = await castSkill(game.id, game.current_round, self.id, skill.actionType, finalConsumed, selectedTarget || undefined);
      if (res.success) {
        setHasActedSkill(true);
      } else {
        alert("發動失敗: " + res.error);
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSkillBusy(false);
    }
  };

  const handleSkipSkill = async () => {
    if (!game || !self) return;
    setSkillBusy(true);
    try {
      const res = await castSkill(game.id, game.current_round, self.id, "PASS", []);
      if (res.success) {
        setHasActedSkill(true);
      } else {
        alert("略過失敗: " + res.error);
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSkillBusy(false);
    }
  };

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 lg:flex-row lg:items-start">
      <section className="flex-1 space-y-4">
        {/* 主要狀態提示視窗 */}
        {(needsAnswer || isWaitingReveal || isShowingReveal || isSkillPhase || isWaitingSettle || isCounterPhase) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-milky-brown/20 p-4 backdrop-blur-sm transition-all">
            <MotionWrapper type="bounce" className="w-full max-w-sm overflow-hidden">
              <div className="pudding-card overflow-y-auto max-h-[90vh]">
              {isCounterPhase && (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-rose-100 text-rose-500 shadow-inner">
                      <Sparkles className="h-10 w-10 animate-pulse" />
                    </div>
                    {pendingCounter && (
                      <>
                        <h2 className="text-2xl font-black text-milky-brown">反制攔截！</h2>
                        <p className="mt-2 text-milky-brown/70">對手對你發動了 <span className="font-bold text-rose-500">{pendingCounter.action_type}</span></p>
                        <p className="mt-4 font-bold text-milky-brown bg-milky-apricot/20 py-2 rounded-xl">是否消耗 2 張菱形抵銷？</p>
                        <div className="mt-8 flex gap-4">
                          <button
                            onClick={() => respondToSkillCounter(pendingCounter.id, true)}
                            className="pudding-button-primary flex-1 bg-rose-400 text-white hover:bg-rose-500"
                          >
                            是
                          </button>
                          <button
                            onClick={() => respondToSkillCounter(pendingCounter.id, false)}
                            className="pudding-button-secondary flex-1"
                          >
                            否
                          </button>
                        </div>
                      </>
                    )}
                    {snakeTarget && (
                      <>
                        <h2 className="text-2xl font-black text-milky-brown">遭遇電鰻/蛇！</h2>
                        <p className="mt-2 text-milky-brown/70">你即將掉落。是否消耗 1 張紅心抵銷？</p>
                        <div className="mt-8 flex gap-4">
                          <button
                            onClick={() => {
                              const hId = snakeTarget.cards[0].id;
                              setSnakeTarget(null);
                              const card = self.cards.find((c) => c.round === game.current_round);
                              performMove(self.position + (card?.points || 0), 0, hId);
                            }}
                            className="pudding-button-primary flex-1 bg-rose-400 text-white hover:bg-rose-500"
                          >
                            是 (消耗紅心)
                          </button>
                          <button
                            onClick={() => {
                              const pos = snakeTarget.position;
                              const stars = snakeTarget.starsGained;
                              setSnakeTarget(null);
                              performMove(pos, stars);
                            }}
                            className="pudding-button-secondary flex-1"
                          >
                            否 (正常掉落)
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
              {needsAnswer && (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-milky-apricot/20 text-milky-brown">
                      <Radio className="h-8 w-8" />
                    </div>
                    <h2 className="text-2xl font-black text-milky-brown">第 {game.current_round} 回合</h2>
                    <p className="mt-1 text-sm font-bold text-milky-brown/50">請選擇您的答案</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {(["A", "B", "C", "D"] as QuizChoice[]).map((choice) => (
                      <button
                        key={choice}
                        onClick={() => handleAnswer(choice)}
                        disabled={answerBusy}
                        className="flex h-20 items-center justify-center rounded-3xl border-b-4 border-milky-beige bg-milky-beige/30 text-3xl font-black text-milky-brown/40 transition-all hover:border-milky-apricot hover:bg-milky-apricot/20 hover:text-milky-brown active:translate-y-1 active:border-b-0 disabled:opacity-50"
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isWaitingReveal && (
                <div className="py-8 text-center">
                   <div className="glass-banner">
                      <div className="flex flex-col items-center gap-4">
                        <Loader2 className="h-12 w-12 animate-spin text-milky-brown/30" />
                        <h2 className="text-2xl font-black text-milky-brown tracking-widest">等待主辦方公布答案...</h2>
                      </div>
                   </div>
                </div>
              )}

              {isShowingReveal && (
                <div className="text-center">
                  {self.cards.find((c) => c.round === game.current_round) ? (
                    <div className="space-y-6">
                      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-lg">
                        <Sparkles className="h-10 w-10 animate-bounce" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-black text-milky-brown">正確答案已揭曉！</h2>
                        <p className="text-sm font-bold text-milky-brown/50">恭喜獲得冒險卡片：</p>
                      </div>
                      <div className="rounded-3xl border-4 border-emerald-100 bg-emerald-50 p-6 shadow-inner">
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-600/60">
                          {self.cards.find((c) => c.round === game.current_round)?.name}
                        </p>
                        <p className="mt-2 text-4xl font-black text-emerald-700">
                          +{self.cards.find((c) => c.round === game.current_round)?.points} 步
                        </p>
                      </div>
                      <p className="text-sm font-bold text-milky-brown/30 animate-pulse">主辦方正在結算移動中...</p>
                    </div>
                  ) : (
                    <div className="py-12">
                      <Loader2 className="mx-auto h-12 w-12 animate-spin text-milky-brown/10" />
                      <p className="mt-6 font-bold text-milky-brown/40">生成卡片中...</p>
                    </div>
                  )}
                </div>
              )}

              {isSkillPhase && (
                <div className="space-y-6">
                  <div className="text-center">
                    <h2 className="text-2xl font-black text-milky-brown">技能發動</h2>
                    <p className="mt-1 text-sm font-bold text-milky-brown/40">選擇您的策略，或是保存體力</p>
                  </div>

                  {!hasActedSkill ? (
                    <div className="space-y-4">
                      {availableSkills.some(s => s.requiresTarget) && (
                        <select
                          className="w-full rounded-2xl border-2 border-milky-beige bg-white/50 p-4 text-milky-brown font-bold outline-none focus:border-milky-apricot transition-all"
                          value={selectedTarget}
                          onChange={(e) => setSelectedTarget(e.target.value)}
                        >
                          <option value="">-- 選擇目標玩家 --</option>
                          {players.filter(p => p.id !== self.id).map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      )}

                      <div className="grid grid-cols-1 gap-3 max-h-[35vh] overflow-y-auto px-1">
                        {availableSkills.map((skill) => (
                          <button
                            key={skill.actionType}
                            onClick={() => handleCastSkill(skill)}
                            disabled={skillBusy}
                            className="flex items-center justify-between rounded-2xl border-2 border-milky-apricot/30 bg-milky-apricot/10 px-5 py-4 hover:bg-milky-apricot/30 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                          >
                            <div className="flex flex-col items-start">
                              <span className="font-black text-milky-brown text-lg">{skill.actionType}</span>
                              <span className="text-[10px] font-bold text-milky-brown/40 uppercase">技能代碼</span>
                            </div>
                            <span className="text-xs font-black bg-white/60 px-3 py-1 rounded-full text-milky-brown">
                              消耗: {skill.costDescription}
                            </span>
                          </button>
                        ))}
                        {availableSkills.length === 0 && (
                          <div className="text-center py-8 rounded-2xl bg-milky-beige/20 border-2 border-dashed border-milky-beige/50">
                             <p className="text-sm font-bold text-milky-brown/30">目前沒有可使用的技能</p>
                          </div>
                        )}
                      </div>
                      
                      <button
                        onClick={handleSkipSkill}
                        disabled={skillBusy}
                        className="pudding-button-secondary w-full"
                      >
                        {skillBusy ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-milky-brown/30" /> : "不發動技能 (略過)"}
                      </button>
                    </div>
                  ) : (
                    <div className="py-10 text-center">
                       <div className="glass-banner">
                          <div className="flex flex-col items-center gap-4">
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-lg mb-2">
                               <Sparkles className="h-8 w-8 animate-pulse" />
                            </div>
                            <h2 className="text-2xl font-black text-milky-brown tracking-widest">已確認行動，等待結算...</h2>
                          </div>
                       </div>
                    </div>
                  )}
                </div>
              )}

              {isWaitingSettle && (
                <div className="py-10 text-center">
                   <div className="glass-banner">
                      <div className="flex flex-col items-center gap-4">
                        <SkipForward className="h-16 w-16 animate-pulse text-milky-brown/20" />
                        <h2 className="text-3xl font-black text-milky-brown tracking-widest">全員準備出發！</h2>
                        <p className="font-bold text-milky-brown/40">即將開始同步滑行移動...</p>
                      </div>
                   </div>
                </div>
              )}
              </div>
            </MotionWrapper>
          </div>
        )}

        <header className="pudding-card !p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-milky-brown/40">ADVENTURER STATUS</p>
          <div className="mt-3 flex flex-wrap items-center gap-6 text-milky-brown">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-milky-apricot flex items-center justify-center text-white">
                <User className="h-4 w-4" />
              </div>
              <p className="text-lg font-black">{self.name}</p>
            </div>
            <div className="h-8 w-px bg-milky-brown/10 hidden sm:block" />
            <div>
              <p className="text-[10px] font-bold text-milky-brown/40">目前位置</p>
              <p className="text-xl font-black">第 {self.position} 格</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-milky-brown/40">獲得星星</p>
              <p className="text-xl font-black text-milky-accent">★ {self.stars}</p>
            </div>
            <div className="ml-auto bg-white/50 px-4 py-1 rounded-full border border-milky-beige/50">
              <p className="text-xs font-bold text-milky-brown/60 uppercase">
                 Round {game.current_round} / {game.round_count}
              </p>
            </div>
          </div>
        </header>
        {game.phase === "finished" && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">前三名</p>
            <ol className="mt-2 grid gap-2 sm:grid-cols-3">
              {podium.map((p, idx) => (
                <li key={p.id} className="rounded-xl border border-amber-100 bg-white px-3 py-2 text-sm text-slate-900">
                  <span className="text-xs text-amber-800">第 {idx + 1} 名</span>
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xs text-slate-600">
                    星星 {p.stars} · 位置 {p.position}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        )}
        <BoardGrid players={boardPlayers} selfId={self.id} />
      </section>
      <aside className="w-full max-w-sm space-y-4 pudding-card !bg-white/40 lg:sticky lg:top-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-milky-brown text-white flex items-center justify-center">
             <Heart className="h-4 w-4" />
          </div>
          <h2 className="text-lg font-black text-milky-brown">我的卡片</h2>
        </div>
        
        <div className="grid grid-cols-4 gap-2 rounded-2xl bg-white/60 p-3 shadow-inner">
          <div className="text-center">
            <p className="text-[10px] font-bold text-milky-brown/40">♠</p>
            <p className="text-sm font-black">{suitCounts.S}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-bold text-milky-brown/40">♣</p>
            <p className="text-sm font-black">{suitCounts.C}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-bold text-rose-400">♦</p>
            <p className="text-sm font-black text-rose-500">{suitCounts.D}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-bold text-rose-400">♥</p>
            <p className="text-sm font-black text-rose-500">{suitCounts.H}</p>
          </div>
        </div>

        {availableCards.length === 0 ? (
          <div className="py-10 text-center rounded-2xl border-2 border-dashed border-milky-brown/10">
            <p className="text-xs font-bold text-milky-brown/30 uppercase tracking-widest">NO CARDS YET</p>
          </div>
        ) : (
          <ul className="space-y-3 max-h-[50vh] overflow-y-auto pr-1 custom-scrollbar">
            {[...availableCards].reverse().map((c) => (
              <MotionWrapper type="bounce" key={c.id} className="group relative overflow-hidden rounded-2xl border-2 border-milky-beige bg-white p-4 shadow-sm hover:border-milky-apricot/50 transition-all">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-black text-milky-brown">{c.name}</p>
                    <p className="text-[10px] font-bold text-milky-brown/30 uppercase">Round {c.round}</p>
                  </div>
                  <span className={`text-2xl ${c.suit === 'S' || c.suit === 'C' ? 'text-milky-brown' : 'text-rose-400'}`}>
                    {c.suit === 'S' ? '♠' : c.suit === 'C' ? '♣' : c.suit === 'D' ? '♦' : '♥'}
                  </span>
                </div>
                <div className="absolute inset-x-0 bottom-0 h-1 bg-milky-apricot opacity-0 group-hover:opacity-100 transition-opacity" />
              </MotionWrapper>
            ))}
          </ul>
        )}
      </aside>
    </main>
  );
}

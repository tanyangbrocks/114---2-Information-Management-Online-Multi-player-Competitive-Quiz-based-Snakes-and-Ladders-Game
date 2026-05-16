"use client";
import { cn } from "@/lib/cn";

// import { BoardGrid } from "@/components/BoardGrid";
import { useCardDraw } from "@/hooks/useCardDraw";
import { useGameRealtime } from "@/hooks/useGameRealtime";
import { rankPlayers } from "@/lib/game/ranking";
import { createClient } from "@/lib/supabase/browser";
import { usePlayerSessionStore } from "@/store/playerSessionStore";
import { type QuizChoice, type GameCard } from "@/types/game";
import { calculateAvailableSkills, countSuits, getAvailableCards, type AvailableSkill } from "@/lib/game/skillEngine";
import { MotionWrapper } from "@/components/MotionWrapper";
import { Loader2, Sparkles, User, SkipForward, Heart, CheckCircle2, MessageCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState, use, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { castSkill } from "@/app/actions/skills";
import { respondToSkillCounter } from "@/app/actions/resolveSkills";

export const TOKEN_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEEAD",
  "#D4A5A5",
  "#9B59B6",
  "#F1C40F",
  "#E67E22",
  "#2ECC71",
  "#3498DB",
  "#E74C3C",
];

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
  const [answerFeedback, setAnswerFeedback] = useState<"O" | "X" | null>(null);
  const [skillTimer, setSkillTimer] = useState(30);
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);

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

  const isDrawingRef = useRef<boolean>(false);
  // 每回合只顯示一次 O/X，用 ref 鎖住防止因 self 更新而重復觸發
  const lastFeedbackRoundRef = useRef<number>(-1);

  useEffect(() => {
    if (game?.phase !== "reveal" || !self || !gameId) return;
    // 首要检查：此回合已經顯示過，不再重複
    if (lastFeedbackRoundRef.current === game.current_round) return;

    const roundKey = String(game.current_round);
    const choice = self.answers[roundKey];
    if (!choice) return; // 未作答，不顯示

    const cfg = game.rounds_config?.[game.current_round - 1];
    const isCorrect = cfg ? (choice === cfg.answer) : true;

    lastFeedbackRoundRef.current = game.current_round;
    setAnswerFeedback(isCorrect ? "O" : "X");

    // 獨立的計時器，不跟著 effect cleanup 連動，確保它一定會執行關閉
    setTimeout(() => {
      setAnswerFeedback((prev) => prev !== null ? null : prev);
    }, 1500);
  }, [game?.phase, game?.current_round, self, game?.rounds_config, gameId]);

  // 抽牌邏輯獨立成另一個 effect，避免與 feedback effect 互相干擾
  useEffect(() => {
    if (game?.phase !== "reveal" || !self || !gameId) return;

    // 檢查是否已經抽過此回合的卡
    const alreadyDrawn = self.cards.some((c) => c.round === game.current_round);
    if (alreadyDrawn) return;

    // 若正在抽取中，則等待（防止同一瞬間多次觸發）
    if (isDrawingRef.current) return;
    isDrawingRef.current = true;

    const roundKey = String(game.current_round);
    const choice = self.answers[roundKey];
    const cfg = game.rounds_config?.[game.current_round - 1];
    const isCorrect = cfg ? (choice === cfg.answer) : (!!choice);

    const card = drawForSlot(isCorrect ? 2 : 1, game.current_round);
    const newCards = [...self.cards, card];
    const suits = countSuits(newCards.filter(c => !c.is_used));
    const predicted = card.points + suits.S - suits.C;

    const performDraw = async () => {
      try {
        const { error } = await supabase
          .from("players")
          .update({ cards: newCards, predicted_steps: Math.max(0, predicted) })
          .eq("id", self.id);

        isDrawingRef.current = false;

        if (error) {
          console.error("Card draw failed:", error);
          return;
        }

        void reload();
        void sendSignal();
      } catch (err) {
        console.error("Card draw exception:", err);
        isDrawingRef.current = false;
      }
    };

    void performDraw();
  }, [game?.phase, game?.current_round, game?.rounds_config, self, gameId, drawForSlot, reload, sendSignal, supabase]);

  const settledRoundRef = useRef<number>(-1);
  // 在 reveal 階段結束時快照玩家位置，作為動畫的「出發點」
  const preSettlePositionRef = useRef<number>(1);
  const [skillBusy, setSkillBusy] = useState(false);
  const [skillPreview, setSkillPreview] = useState<AvailableSkill | null>(null);
  const [skillStage, setSkillStage] = useState<"preview" | "target" | "direction" | "idle">("idle");
  const [selectedTarget, setSelectedTarget] = useState<string>("");
  const [cDirection, setCDirection] = useState<1 | -1 | null>(null);
  const [hasActedSkillState, setHasActedSkillState] = useState(false);
  const [localMoveTarget, setLocalMoveTarget] = useState<{ pos: number; stars: number } | null>(null);
  const [isSkillUIVisible, setIsSkillUIVisible] = useState(true);

  const hasActedSkill = useMemo(() => {
    if (hasActedSkillState) return true;
    if (!self || !skillActions) return false;
    const myActions = skillActions.filter(a => a.player_id === self.id);
    if (myActions.length === 0) return false;
    // 只要放過任何「非 S-2」的技能，或者 S-2 被攔截，且尚未被取消，就結束本回合技能權限
    const hasNonS2 = myActions.some(a => a.action_type !== "S-2" && a.status !== "cancelled");
    return hasNonS2;
  }, [self, skillActions, hasActedSkillState]);

  const { passiveModifier, suitCounts, dynamicTotalSteps } = useMemo(() => {
    if (!self || !game) return { passiveModifier: 0, suitCounts: { S: 0, C: 0, D: 0, H: 0 }, dynamicTotalSteps: 0 };
    const available = getAvailableCards(self.cards);
    const counts = countSuits(available);
    const modifier = counts.S - counts.C;

    const currentRoundCard = self.cards.find(c => c.round === game.current_round);
    const baseSteps = currentRoundCard?.points || 0;

    return {
      passiveModifier: modifier,
      suitCounts: counts,
      dynamicTotalSteps: Math.max(0, baseSteps + modifier)
    };
  }, [self, game]);

  // 在 reveal 階段將玩家目前位置快照下來，供動畫用
  useEffect(() => {
    if (game?.phase === "reveal" && self) {
      preSettlePositionRef.current = self.position;
    }
  }, [game?.phase, self]);

  // 自動同步預計步數到資料庫，讓主辦方也能看見
  useEffect(() => {
    if (!self || !game || game.phase === "lobby") return;
    if (self.predicted_steps !== dynamicTotalSteps) {
      void supabase.from("players").update({ predicted_steps: dynamicTotalSteps }).eq("id", self.id);
    }
  }, [dynamicTotalSteps, self, game, supabase]);

  const availableSkills = useMemo(() => {
    if (!self) return [];
    return calculateAvailableSkills(self.cards || [], players.filter(p => p.id !== self.id), self.position);
  }, [self, players]);

  const handleSkipSkill = useCallback(async () => {
    if (!game || !self) return;
    setSkillBusy(true);
    try {
      const res = await castSkill(game.id, game.current_round, self.id, "PASS", []);
      if (res.success) {
        setHasActedSkillState(true);
        setIsDrawerOpen(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSkillBusy(false);
    }
  }, [game, self]);

  useEffect(() => {
    if (game?.phase !== "skill" || hasActedSkill || !self) {
      setSkillTimer(30);
      return;
    }
    const interval = setInterval(() => {
      setSkillTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setSkillPreview(null);
          setIsDrawerOpen(false);
          void handleSkipSkill();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [game?.phase, hasActedSkill, self, handleSkipSkill]);

  useEffect(() => {
    setSkillPreview(null);
    setSkillStage("idle");
    setSelectedTarget("");
    setCDirection(null);
    setPendingCounter(null);
    setSnakeTarget(null);
    setHasActedSkillState(false);
    // 回合變更時，重置 feedback ref 以允許下一回合再次顯示
    lastFeedbackRoundRef.current = -1;
  }, [game?.current_round]);

  useEffect(() => {
    if (game?.phase === "skill" && !hasActedSkill) {
      setIsDrawerOpen(true);
    } else {
      setIsDrawerOpen(false);
    }
  }, [game?.phase, hasActedSkill]);

  const [pendingCounter, setPendingCounter] = useState<{ id: string, action_type: string } | null>(null);
  const [snakeTarget, setSnakeTarget] = useState<{ position: number, starsGained: number, cards: GameCard[] } | null>(null);

  const [s2Selection, setS2Selection] = useState<{
    isOpen: boolean;
    suit: "S" | "C" | "H" | "D" | null;
    points: number | null;
    triggeredByActionId?: string;
  }>({ isOpen: false, suit: null, points: null });

  useEffect(() => {
    if (!self || !skillActions) return;
    const counterAction = skillActions.find(a => a.target_player_id === self.id && a.status === 'waiting_counter');
    if (counterAction) {
      setPendingCounter({ id: counterAction.id, action_type: counterAction.action_type });
    } else {
      setPendingCounter(null);
    }
  }, [skillActions, self]);

  // 結算完成：位置已由伺服器算好，這裡只需刷新本地資料、通知主辦方
  const handleMoveDone = useCallback(async () => {
    if (!self || !game) return;
    settledRoundRef.current = game.current_round;
    setLocalMoveTarget(null);
    // reload 讓 self.position 同步到 DB 最新值，棋子才能穩定在終點
    await reload();
    void sendMoveDone(self.id, self.name, self.position);
    void sendSignal();
  }, [self, game, reload, sendMoveDone, sendSignal]);

  const latestHandleMoveDone = useRef(handleMoveDone);
  useEffect(() => {
    latestHandleMoveDone.current = handleMoveDone;
  }, [handleMoveDone]);

  // 由於移除了 BoardGrid，大屏端負責播動畫，手機端在 settle 階段過一段時間後自動確認
  useEffect(() => {
    if (game?.phase === "settle" && settledRoundRef.current !== game.current_round) {
      const timer = setTimeout(() => {
        void latestHandleMoveDone.current();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [game?.phase, game?.current_round]);

  const performMove = useCallback(async (pos: number, stars: number, heartToConsume?: string) => {
    if (!self || !game) return;
    try {
      const updatedCards = self.cards.map(c => {
        if (c.id === heartToConsume) {
          return { ...c, is_used: true };
        }
        return c;
      });
      const updatePayload: Record<string, unknown> = {
        position: pos,
        stars: self.stars + stars,
      };
      // 只有在有紅心卡要消耗時才更新卡牌
      if (heartToConsume) {
        updatePayload.cards = updatedCards;
      }
      const { error: upErr } = await supabase
        .from("players")
        .update(updatePayload)
        .eq("id", self.id);
      if (upErr) throw upErr;
      await reload();
      void sendMoveDone(self.id, self.name, pos);
      void sendSignal();
    } catch (e) {
      console.error(e);
    }
  }, [self, game, supabase, reload, sendMoveDone, sendSignal]);

  const handleCastSkill = async (skill: AvailableSkill, explicitTarget?: string) => {
    if (!game || !self || hasActedSkill) return;

    if (skill.actionType === "S-2") {
      setS2Selection({ isOpen: true, suit: null, points: null });
      setSkillPreview(null);
      setSkillStage("idle");
      return;
    }

    setSkillBusy(true);
    const targetId = explicitTarget || selectedTarget;
    try {
      let consumed: string[] = [];
      const availableCards = getAvailableCards(self.cards).sort((a, b) => (a.round || 0) - (b.round || 0));
      const counts = countSuits(availableCards);

      if (skill.actionType === "U-3") {
        consumed = availableCards.map(c => c.id);
      } else if (skill.actionType === "S-1") {
        const card = availableCards.find(c => c.suit === "S");
        if (card) consumed = [card.id];
      } else if (skill.actionType === "C-1") {
        const card = availableCards.find(c => c.suit === "C");
        if (card) consumed = [card.id];
      } else if (skill.actionType === "C-2") {
        const matching = availableCards.filter(c => c.suit === "C").slice(0, 2);
        consumed = matching.map(c => c.id);
        if (consumed.length < 2) {
          const dCard = availableCards.find(c => c.suit === "D" && !consumed.includes(c.id));
          if (dCard) consumed.push(dCard.id);
        }
      } else if (skill.actionType === "U-1") {
        const suitToUse = (["S", "C", "H", "D"] as const).find(s => counts[s] >= 3) ||
          (["S", "C", "H"] as const).find(s => counts[s] >= 2 && counts.D >= 1);
        if (suitToUse) {
          const matching = availableCards.filter(c => c.suit === suitToUse).slice(0, 3);
          consumed = matching.map(c => c.id);
          if (consumed.length < 3 && counts.D >= 1) {
            const dCard = availableCards.find(c => c.suit === "D" && !consumed.includes(c.id));
            if (dCard) consumed.push(dCard.id);
          }
        }
      } else if (skill.actionType === "U-2") {
        const suits = ["S", "C", "H", "D"] as const;
        consumed = suits.map(s => availableCards.find(c => c.suit === s)?.id).filter(Boolean) as string[];
        if (consumed.length < 4 && counts.D >= 2) {
          const dCards = availableCards.filter(c => c.suit === "D");
          if (dCards.length >= 2) {
            const missingSuit = suits.find(s => !availableCards.some(c => c.suit === s));
            if (missingSuit) {
              consumed.push(dCards[1].id);
            }
          }
        }
      }

      const res = await castSkill(game.id, game.current_round, self.id, skill.actionType, consumed, targetId || undefined, cDirection ? { direction: cDirection } : undefined);
      if (res.success) {
        setHasActedSkillState(true);
        setSkillPreview(null);
        setSkillStage("idle");
        setSelectedTarget("");
        setCDirection(null);
        await reload(true);
      } else {
        alert(res.error || "發動技能失敗");
      }
    } catch (e) {
      alert(String(e));
    } finally {
      setSkillBusy(false);
    }
  };

  const handleConfirmS2 = async () => {
    if (!game || !self) return;
    const { suit, points, triggeredByActionId } = s2Selection;
    if (!suit || !points) return;

    setSkillBusy(true);
    setS2Selection({ isOpen: false, suit: null, points: null });
    try {
      let consumed: string[] = [];

      if (!triggeredByActionId) {
        // 正常主動施放 S-2：計算要消耗的黑桃/菱形卡
        const availableCards = getAvailableCards(self.cards).sort((a, b) => (a.round || 0) - (b.round || 0));
        const matching = availableCards.filter(c => c.suit === "S").slice(0, 2);
        consumed = matching.map(c => c.id);
        if (consumed.length < 2) {
          const dCard = availableCards.find(c => c.suit === "D" && !consumed.includes(c.id));
          if (dCard) consumed.push(dCard.id);
        }
      }
      // U-3 觸發的 S-2 不需要消耗任何卡片

      const res = await castSkill(
        game.id,
        game.current_round,
        self.id,
        "S-2",
        consumed,
        undefined,
        {
          s2_suit: suit,
          s2_points: points,
          ...(triggeredByActionId ? { from_u3_action_id: triggeredByActionId } : {})
        }
      );
      if (res.success) {
        setSkillPreview(null);
        setSkillStage("idle");
        await reload(true);
      } else {
        alert(res.error || "發動技能失敗");
      }
    } catch (e) {
      alert(String(e));
    } finally {
      setSkillBusy(false);
    }
  };

  if (lookupError) return <main className="mx-auto max-w-lg px-4 py-12"><p className="text-milky-brown font-bold opacity-60">{lookupError}</p></main>;
  if (!gameId || status === "loading" || status === "idle") return <div className="flex min-h-[50vh] items-center justify-center text-milky-brown"><Loader2 className="h-10 w-10 animate-spin opacity-40" /></div>;
  if (error || !game) return <main className="mx-auto max-w-lg px-4 py-12"><p className="text-milky-brown font-bold opacity-60">{error ?? "無法載入場次"}</p></main>;

  if (!playerId || !self) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-10 page-fade-in">
        <MotionWrapper type="bounce" className="pudding-card">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-milky-apricot/30 text-milky-brown"><User className="h-6 w-6" /></div>
            <div><p className="text-[10px] font-bold uppercase tracking-widest text-milky-brown/60">PLAYER JOIN</p><h1 className="text-2xl font-black text-milky-brown">加入冒險</h1></div>
          </div>
          <form className="space-y-5" onSubmit={joinGame}>
            <input required value={joinName} onChange={(e) => setJoinName(e.target.value)} className="w-full rounded-2xl border-2 border-milky-beige bg-white/50 px-4 py-3 text-milky-brown outline-none" placeholder="輸入您的名字..." />
            {joinError && <p className="text-xs font-bold text-milky-accent animate-pulse">{joinError}</p>}
            <button type="submit" disabled={joinBusy} className="pudding-button-primary w-full shadow-milky-apricot/20">{joinBusy ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : "開始冒險"}</button>
          </form>
        </MotionWrapper>
      </main>
    );
  }

  if (game.phase === "lobby") {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-10 page-fade-in text-center">
        <MotionWrapper type="bounce" className="pudding-card space-y-8">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-milky-apricot/20 text-milky-brown shadow-inner">
            <Loader2 className="h-12 w-12 animate-spin" />
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-black text-milky-brown">已成功加入！</h2>
            <p className="text-sm font-bold text-milky-brown/60 uppercase tracking-widest">等待主辦方啟動冒險...</p>
          </div>
          <div className="pt-6 border-t border-milky-beige/50">
            <p className="text-[10px] font-black text-milky-brown/40 uppercase mb-4">目前已加入的冒險者</p>
            <div className="flex flex-wrap justify-center gap-2">
              {players.map(p => (
                <div key={p.id} className="px-3 py-1 bg-white rounded-full border border-milky-beige text-xs font-bold text-milky-brown shadow-sm">
                  {p.name}
                </div>
              ))}
            </div>
          </div>
        </MotionWrapper>
      </main>
    );
  }

  const roundKey = String(game.current_round);
  const needsAnswer = game.phase === "question" && !self.answers[roundKey];
  const isWaitingReveal = game.phase === "question" && !!self.answers[roundKey];
  const isShowingReveal = game.phase === "reveal";
  const isSkillPhase = game.phase === "skill";
  const isWaitingSettle = game.phase === "settle" &&
    !localMoveTarget &&
    settledRoundRef.current !== game.current_round;
  const isCounterPhase = !!pendingCounter || !!snakeTarget;

  const currentRoundCard = self.cards.find(c => c.round === game.current_round);
  const correctChoice = game.rounds_config[game.current_round - 1]?.answer;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 lg:flex-row lg:items-start">
      <section className="flex-1 space-y-4">
        <AnimatePresence>
          {answerFeedback && (
            <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 2, opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
              <div className={`flex h-64 w-64 items-center justify-center rounded-full border-[16px] bg-white/90 backdrop-blur-xl shadow-2xl ${answerFeedback === 'O' ? 'border-milky-apricot text-milky-apricot' : 'border-milky-brown/20 text-milky-brown/40'}`}>
                <span className="text-[12rem] font-black leading-none">{answerFeedback}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {isSkillPhase && !hasActedSkill && (
          <div className="fixed top-0 left-0 right-0 z-[100] h-2 bg-milky-white/50">
            <motion.div className="h-full bg-gradient-to-r from-milky-brown via-milky-accent to-milky-apricot" initial={{ width: "100%" }} animate={{ width: `${(skillTimer / 30) * 100}%` }} transition={{ duration: 1, ease: "linear" }} />
          </div>
        )}

        <div className="fixed top-6 right-6 z-[60] flex flex-col items-end gap-3 pointer-events-none">
          <AnimatePresence mode="popLayout">
            {(answerBusy || skillBusy) && (
              <motion.div key="busy" initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 50, opacity: 0 }} className="flex items-center gap-3 bg-white/95 backdrop-blur-md px-5 py-3 rounded-2xl shadow-xl border border-milky-beige/50 pointer-events-auto">
                <Loader2 className="h-5 w-5 animate-spin text-milky-brown" />
                <span className="text-xs font-black text-milky-brown uppercase tracking-widest">{answerBusy ? "送出答案中" : skillBusy ? "技能處理中" : "同步狀態中"}</span>
              </motion.div>
            )}
            {isWaitingReveal && (
              <motion.div key="waiting-reveal" initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 50, opacity: 0 }} className="flex items-center gap-3 bg-milky-brown text-white px-5 py-3 rounded-2xl shadow-xl pointer-events-auto">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-xs font-black uppercase tracking-widest">等待公布答案</span>
              </motion.div>
            )}
            {isSkillPhase && hasActedSkill && (
              <motion.div key="waiting-skill" initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 50, opacity: 0 }} className="flex items-center gap-3 bg-milky-accent text-white px-5 py-3 rounded-2xl shadow-xl pointer-events-auto">
                <MessageCircle className="h-5 w-5 animate-pulse" />
                <span className="text-xs font-black uppercase tracking-widest">等待其他玩家施法</span>
              </motion.div>
            )}
            {isWaitingSettle && (
              <motion.div key="waiting-settle" initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 50, opacity: 0 }} className="flex items-center gap-3 bg-milky-apricot text-white px-5 py-3 rounded-2xl shadow-xl pointer-events-auto">
                <SkipForward className="h-5 w-5 animate-pulse" />
                <span className="text-xs font-black uppercase tracking-widest">其他玩家移動中</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {isShowingReveal && (
          <MotionWrapper type="bounce" className="space-y-4">
            <div className="pudding-card !bg-white/90 border-milky-beige flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-milky-brown text-white flex items-center justify-center shadow-lg"><CheckCircle2 className="h-6 w-6" /></div>
                <div>
                  <p className="text-[10px] font-black text-milky-brown/40 uppercase tracking-widest mb-1">Correct Answer Is</p>
                  <h2 className="text-3xl font-black text-milky-brown tracking-tighter">選項 {correctChoice}</h2>
                  <p className="text-sm font-bold text-milky-brown/60 italic">{game.rounds_config[game.current_round - 1]?.question_text || "正確答案"}</p>
                </div>
              </div>
              <div className="bg-milky-beige/30 px-6 py-3 rounded-2xl">
                <p className="text-sm font-black text-milky-brown/60">您的選擇：{self.answers[roundKey] || "未作答"}</p>
              </div>
            </div>

            {currentRoundCard ? (
              <div className="pudding-card !bg-milky-accent/10 border-milky-accent/20 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-milky-accent text-white flex items-center justify-center shadow-lg"><Sparkles className="h-6 w-6" /></div>
                  <div>
                    <p className="text-[10px] font-black text-milky-accent uppercase tracking-widest mb-1">Obtained Card</p>
                    <h2 className="text-2xl font-black text-milky-brown tracking-tighter">{currentRoundCard.name}</h2>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black text-milky-accent">+{currentRoundCard.points} 步</p>
                </div>
              </div>
            ) : (
              // 卡牌抽取中（非同步），顯示等待骨架
              <div className="pudding-card !bg-milky-beige/30 border-milky-beige/50 flex items-center gap-4 animate-pulse">
                <div className="h-12 w-12 rounded-2xl bg-milky-beige text-milky-brown/40 flex items-center justify-center shadow-sm">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-milky-brown/30 uppercase tracking-widest mb-1">Obtaining Card</p>
                  <p className="text-sm font-bold text-milky-brown/40">卡牌抽取中...</p>
                </div>
              </div>
            )}
          </MotionWrapper>
        )}

        {isWaitingSettle && (
          <MotionWrapper type="bounce" className="p-10 pudding-card !bg-white/90 border-4 border-milky-apricot shadow-2xl flex flex-col items-center gap-8 text-center my-6">
            <div className="space-y-2">
              <h3 className="text-3xl font-black text-milky-brown tracking-tighter">冒險結算中</h3>
              <p className="text-milky-brown/60 font-bold">請抬頭看大螢幕，確認您的移動結果！</p>
            </div>
            <Loader2 className="h-10 w-10 animate-spin text-milky-apricot" />
            <button
              onClick={() => {
                if (settledRoundRef.current === game.current_round) return;
                void handleMoveDone();
              }}
              className="pudding-button-primary text-lg px-8 py-4 shadow-xl bg-milky-apricot/80"
            >
              略過等待 (手動確認)
            </button>
          </MotionWrapper>
        )}

        {(needsAnswer || isCounterPhase) && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-milky-brown/60 p-4 backdrop-blur-sm transition-all">
            <MotionWrapper type="bounce" className="w-full max-w-sm">
              <div className="pudding-card overflow-y-auto max-h-[90vh] shadow-2xl border-4 border-white">
                {isCounterPhase && (
                  <div className="space-y-8 py-4 text-center">
                    <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-milky-apricot/20 text-milky-brown shadow-inner"><Sparkles className="h-12 w-12 animate-pulse" /></div>
                    {pendingCounter && (
                      <div className="space-y-6">
                        <h2 className="text-3xl font-black text-milky-brown">技能攔截！</h2>
                        <p className="text-sm font-bold text-milky-brown/60">對手發動了 {pendingCounter.action_type}。<br/>消耗 2 張菱形發動「白板防禦」反制？</p>
                        <div className="flex gap-4 pt-4">
                          <button onClick={() => respondToSkillCounter(pendingCounter.id, true)} className="pudding-button-primary flex-1 bg-milky-accent text-white">是</button>
                          <button onClick={() => respondToSkillCounter(pendingCounter.id, false)} className="pudding-button-secondary flex-1">否</button>
                        </div>
                      </div>
                    )}
                    {snakeTarget && (
                      <div className="space-y-6">
                        <h2 className="text-3xl font-black text-milky-brown">遭遇危險！</h2>
                        <p className="text-sm font-bold text-milky-brown/60">即將跌落，消耗 1 張「師大的網路結界」抵銷？</p>
                        <div className="flex gap-4 pt-4">
                          <button onClick={() => {
                            const hId = snakeTarget.cards[0].id;
                            setSnakeTarget(null);
                            const moveDist = (currentRoundCard?.points || 0) + suitCounts.S - suitCounts.C;
                            performMove(self.position + Math.max(0, moveDist), 0, hId);
                          }} className="pudding-button-primary flex-1 bg-milky-accent text-white">是</button>
                          <button onClick={() => { const pos = snakeTarget.position; const stars = snakeTarget.starsGained; setSnakeTarget(null); performMove(pos, stars); }} className="pudding-button-secondary flex-1">否</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {needsAnswer && (
                  <div className="space-y-8 py-4 text-center">
                    <h2 className="text-3xl font-black text-milky-brown">第 {game.current_round} 回合</h2>
                    <div className="grid grid-cols-2 gap-4">
                      {(['A', 'B', 'C', 'D'] as QuizChoice[]).map((choice) => (
                        <button key={choice} onClick={() => handleAnswer(choice)} disabled={answerBusy} className="flex h-24 items-center justify-center rounded-[2.5rem] border-b-8 border-milky-beige bg-milky-beige/20 text-5xl font-black text-milky-brown/30 hover:border-milky-apricot hover:bg-milky-apricot/10 hover:text-milky-brown disabled:opacity-50 transition-all">{choice}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </MotionWrapper>
          </div>
        )}

        {isSkillPhase && !hasActedSkill && (
          <div className="fixed inset-0 z-[70] pointer-events-none">
            <div className={`absolute inset-0 bg-black/20 transition-opacity pointer-events-auto ${isDrawerOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsDrawerOpen(false)} />
            <motion.div initial={{ y: "100%" }} animate={{ y: isDrawerOpen ? "0%" : "100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }} className="absolute bottom-0 left-0 right-0 bg-milky-white rounded-t-[4rem] border-t-8 border-white shadow-2xl pointer-events-auto flex flex-col">
              <div className="flex justify-center py-6 cursor-pointer group" onClick={() => setIsDrawerOpen(!isDrawerOpen)}><div className="w-20 h-2 bg-milky-brown/10 rounded-full group-hover:bg-milky-brown/30" /></div>
              <div className="px-8 pb-16 overflow-y-auto max-h-[80vh]">
                <div className="mb-10 flex items-end justify-between">
                  <h2 className="text-4xl font-black text-milky-brown tracking-tighter">發動冒險技能</h2>
                  <div className="flex flex-col items-end gap-2">
                    <p className={`text-2xl font-black ${skillTimer <= 5 ? 'text-milky-accent animate-pulse' : 'text-milky-brown'}`}>{skillTimer}s</p>
                    <button onClick={handleSkipSkill} className="text-xs font-black text-milky-brown/40 underline">略過</button>
                  </div>
                </div>
                {availableSkills.length === 0 ? <div className="py-20 text-center bg-white/40 rounded-[4rem] border-4 border-dashed border-milky-beige/50"><p className="text-sm font-black text-milky-brown/20">目前沒有可發動的技能</p></div> : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {availableSkills.map((skill) => (
                      <button key={skill.actionType} onClick={() => { setSkillPreview(skill); setSkillStage("preview"); setIsDrawerOpen(false); }} className="group rounded-[3rem] bg-white p-8 text-left shadow-sm border-2 border-transparent hover:border-milky-apricot transition-all hover:shadow-2xl hover:-translate-y-2 flex flex-col justify-between h-full">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xl font-black text-milky-brown leading-tight break-words">
                            {skill.name === "按下空格鍵即可開始遊戲" ? (
                              <>按下空格鍵<br/>即可開始遊戲</>
                            ) : skill.name}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-milky-brown/40 leading-relaxed line-clamp-2">{skill.description}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {skillPreview && skillStage === "preview" && (
          <div className={cn("fixed inset-0 z-[110] flex items-center justify-center p-4 bg-milky-brown/40 backdrop-blur-md transition-all duration-300", !isSkillUIVisible && "opacity-0 pointer-events-none")}>
            <MotionWrapper type="bounce" className="w-full max-w-sm relative">
              <button onClick={() => setIsSkillUIVisible(false)} className="absolute -top-12 right-0 flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full text-white text-xs font-bold hover:bg-white/30 transition-all">
                <SkipForward className="h-4 w-4 rotate-90" /> 暫時隱藏
              </button>
              <div className="pudding-card shadow-2xl border-4 border-white text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-milky-brown text-white shadow-xl"><Sparkles className="h-10 w-10" /></div>
                <h3 className="text-3xl font-black text-milky-brown mb-3">
                  {skillPreview.name === "按下空格鍵即可開始遊戲" ? (
                    <>按下空格鍵<br/>即可開始遊戲</>
                  ) : skillPreview.name}
                </h3>
                <p className="text-sm font-bold text-milky-brown/60 mb-8">{skillPreview.description}</p>
                <div className="flex gap-4">
                  <button onClick={() => { setSkillPreview(null); setSkillStage("idle"); setIsDrawerOpen(true); }} className="pudding-button-secondary flex-1">取消</button>
                  <button
                    onClick={() => {
                      if (skillPreview.requiresTarget) {
                        setSkillStage("target");
                      } else if (skillPreview.actionType === "C-1") {
                        setSkillStage("direction");
                      } else {
                        handleCastSkill(skillPreview);
                      }
                    }}
                    className="pudding-button-primary flex-1 shadow-milky-apricot/30"
                  >
                    確認發動
                  </button>
                </div>
              </div>
            </MotionWrapper>
          </div>
        )}

        {skillPreview && skillStage === "target" && (
          <div className={cn("fixed inset-0 z-[110] flex flex-col items-center justify-center p-4 bg-milky-brown/60 backdrop-blur-md transition-all duration-300", !isSkillUIVisible && "opacity-0 pointer-events-none")}>
            <button onClick={() => setIsSkillUIVisible(false)} className="absolute top-10 right-10 flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full text-white text-xs font-bold hover:bg-white/30 transition-all">
              <SkipForward className="h-4 w-4 rotate-90" /> 暫時隱藏
            </button>
            <div className="mb-8 text-center">
              <h3 className="text-3xl font-black text-white mb-2">選擇技能目標</h3>
              <p className="text-white/60 font-bold">請點擊下方清單或棋盤上的玩家頭像</p>
            </div>
            <div className="w-full max-w-md grid grid-cols-2 gap-4 mb-8">
              {[...players].sort((a, b) => a.id.localeCompare(b.id)).map(p => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedTarget(p.id);
                    if (skillPreview.actionType === "C-2") {
                      setSkillStage("direction");
                    } else {
                      handleCastSkill(skillPreview, p.id);
                    }
                  }}
                  className={`pudding-card flex flex-col items-center gap-3 border-4 transition-all hover:scale-105 ${selectedTarget === p.id ? 'border-milky-apricot bg-white' : 'border-white/20 bg-white/10 text-white'}`}
                >
                  <div className="h-12 w-12 rounded-2xl bg-milky-brown text-white flex items-center justify-center shadow-lg"><User className="h-6 w-6" /></div>
                  <span className="font-black">{p.name}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setSkillStage("preview")} className="pudding-button-secondary px-10">返回預覽</button>
          </div>
        )}

        {skillPreview && skillStage === "direction" && (
          <div className={cn("fixed inset-0 z-[110] flex items-center justify-center p-4 bg-milky-brown/40 backdrop-blur-md transition-all duration-300", !isSkillUIVisible && "opacity-0 pointer-events-none")}>
            <MotionWrapper type="bounce" className="w-full max-w-sm relative">
              <button onClick={() => setIsSkillUIVisible(false)} className="absolute -top-12 right-0 flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full text-white text-xs font-bold hover:bg-white/30 transition-all">
                <SkipForward className="h-4 w-4 rotate-90" /> 暫時隱藏
              </button>
              <div className="pudding-card shadow-2xl border-4 border-white text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-milky-accent text-white shadow-xl"><Sparkles className="h-10 w-10" /></div>
                <h3 className="text-3xl font-black text-milky-brown mb-3">選擇移動方向</h3>
                <p className="text-sm font-bold text-milky-brown/60 mb-8">
                  {skillPreview.actionType === "C-1" ? "讓自己移動 1 格" : `讓 ${players.find(p => p.id === selectedTarget)?.name} 移動 1 格`}
                </p>
                <div className="flex gap-4 mb-8">
                  <button onClick={() => { setCDirection(1); handleCastSkill(skillPreview); }} className="flex-1 pudding-card border-4 border-milky-beige/30 hover:border-milky-apricot transition-all py-8 flex flex-col items-center gap-2">
                    <span className="text-4xl">⬆️</span>
                    <span className="font-black text-milky-brown">前進</span>
                  </button>
                  <button onClick={() => { setCDirection(-1); handleCastSkill(skillPreview); }} className="flex-1 pudding-card border-4 border-milky-beige/30 hover:border-milky-apricot transition-all py-8 flex flex-col items-center gap-2">
                    <span className="text-4xl">⬇️</span>
                    <span className="font-black text-milky-brown">後退</span>
                  </button>
                </div>
                <button onClick={() => setSkillStage(skillPreview.requiresTarget ? "target" : "preview")} className="pudding-button-secondary w-full">返回上一步</button>
              </div>
            </MotionWrapper>
          </div>
        )}

        {/* 恢復按鈕：當選單被隱藏時顯示 */}
        <AnimatePresence>
          {!isSkillUIVisible && skillStage !== "idle" && (
            <motion.button
              initial={{ scale: 0, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0, opacity: 0, y: 20 }}
              onClick={() => setIsSkillUIVisible(true)}
              className="fixed bottom-24 right-6 z-[120] flex h-16 w-16 items-center justify-center rounded-3xl bg-milky-brown text-white shadow-2xl border-4 border-white"
            >
              <SkipForward className="h-8 w-8 -rotate-90" />
            </motion.button>
          )}
        </AnimatePresence>

        <header className="pudding-card !p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 h-1.5 w-full bg-gradient-to-r from-milky-apricot via-milky-accent to-milky-brown opacity-60" />
          <div className="flex flex-wrap items-center gap-10 text-milky-brown">
            <div className="flex items-center gap-4"><div className="h-12 w-12 rounded-[1.2rem] bg-milky-brown text-white flex items-center justify-center shadow-xl group-hover:rotate-6 transition-transform"><User className="h-6 w-6" /></div><div><p className="text-[10px] font-black uppercase tracking-[0.3em] text-milky-brown/40 leading-none mb-1">Adventurer</p><p className="text-2xl font-black tracking-tighter">{self.name}</p></div></div>
            <div className="flex gap-10">
              <div><p className="text-[10px] font-black text-milky-brown/30 uppercase mb-1">位置</p><p className="text-2xl font-black tracking-tighter">{self.position}</p></div>
              <div><p className="text-[10px] font-black text-milky-brown/30 uppercase mb-1">星星</p><p className="text-2xl font-black text-milky-accent tracking-tighter">★ {self.stars}</p></div>
              <div className="flex flex-wrap gap-2">
                <div className="rounded-xl bg-milky-apricot/20 px-3 py-1.5 border border-milky-apricot/30">
                  <p className="text-[9px] font-black uppercase tracking-wider text-milky-brown/40">Expected Move</p>
                  <p className="text-sm font-black text-milky-brown">🚀 {dynamicTotalSteps} 步</p>
                </div>
                <div className="rounded-xl bg-milky-accent/10 px-3 py-1.5 border border-milky-accent/20">
                  <p className="text-[9px] font-black uppercase tracking-wider text-milky-accent/60">Passive Mod</p>
                  <p className="text-sm font-black text-milky-accent">{passiveModifier > 0 ? `+${passiveModifier}` : passiveModifier} 步</p>
                </div>
              </div>
            </div>
            <div className="ml-auto"><div className="bg-milky-beige/20 px-6 py-3 rounded-[1.5rem] border border-milky-beige/50 shadow-inner text-xs font-black text-milky-brown/50 uppercase tracking-[0.3em]">Round {game.current_round} / {game.round_count}</div></div>
          </div>
        </header>

        {game.phase === "finished" && (
          <MotionWrapper type="bounce" className="rounded-[3.5rem] border-4 border-milky-apricot bg-milky-white/95 p-10 shadow-2xl text-center">
            <h3 className="text-sm font-black uppercase tracking-[0.5em] text-milky-apricot mb-8">Legendary Adventurers</h3>
            <ol className="grid gap-6 sm:grid-cols-3">
              {rankPlayers(players).slice(0, 3).map((p, idx) => (
                <li key={p.id} className="rounded-[3rem] border-4 border-milky-beige/20 bg-white p-8 shadow-sm relative group overflow-hidden">
                  <div className={`absolute top-0 inset-x-0 h-2 ${idx === 0 ? 'bg-milky-apricot' : idx === 1 ? 'bg-milky-accent' : 'bg-milky-brown/20'}`} />
                  <span className="text-[10px] font-black text-milky-brown/20 uppercase tracking-widest block mb-4">RANK {idx + 1}</span>
                  <p className="text-2xl font-black text-milky-brown truncate mb-2">{p.name}</p>
                  <p className="text-xs font-black text-milky-accent">★ {p.stars} · {p.position} 格</p>
                </li>
              ))}
            </ol>
          </MotionWrapper>
        )}

        {/* TODO: OMITTED IN SCREEN
            BoardGrid 已經完全移至 Screen 處理，PlayClient 專注於手牌與互動
        */}
      </section>

      <aside className="w-full max-w-sm space-y-6 pudding-card !bg-milky-white/50 lg:sticky lg:top-8 border-none shadow-none">
        <div className="flex items-center gap-3"><div className="h-10 w-10 rounded-[1.2rem] bg-milky-brown text-white flex items-center justify-center shadow-lg"><Heart className="h-5 w-5" /></div><h2 className="text-xl font-black text-milky-brown tracking-tighter">我的卡池</h2></div>
        <div className="grid grid-cols-4 gap-3 rounded-[2rem] bg-white p-5 shadow-sm border border-milky-beige/30 text-center">
          <div className="flex flex-col items-center"><p className="text-[10px] font-black text-milky-brown/20 mb-1">何老師</p><p className="text-lg font-black text-milky-brown">{suitCounts.S}</p></div>
          <div className="flex flex-col items-center"><p className="text-[10px] font-black text-milky-brown/20 mb-1">邱老師</p><p className="text-lg font-black text-milky-brown">{suitCounts.C}</p></div>
          <div className="flex flex-col items-center"><p className="text-[10px] font-black text-milky-accent/50 mb-1">黃老師</p><p className="text-lg font-black text-milky-accent">{suitCounts.D}</p></div>
          <div className="flex flex-col items-center"><p className="text-[10px] font-black text-milky-accent/50 mb-1">師大</p><p className="text-lg font-black text-milky-accent">{suitCounts.H}</p></div>
        </div>
        {self.cards.length === 0 ? <div className="py-20 text-center rounded-[3rem] border-4 border-dashed border-milky-beige/30"><p className="text-xs font-black text-milky-brown/20 uppercase tracking-[0.3em]">No cards collected</p></div> : (
          <ul className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
            {[...self.cards].reverse().map((c) => (
              <MotionWrapper type="bounce" key={c.id} className={`group relative overflow-hidden rounded-[2.5rem] border-2 p-6 shadow-sm transition-all ${c.is_used ? 'bg-milky-beige/10 border-milky-beige/30 grayscale-[0.8]' : 'bg-white border-milky-beige hover:border-milky-apricot'}`}>
                {c.is_used && (
                  <div className="absolute top-2 right-4 bg-milky-brown/10 text-[8px] font-black px-2 py-0.5 rounded-full text-milky-brown/40 tracking-widest">USED</div>
                )}
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-lg font-black tracking-tight ${c.is_used ? 'text-milky-brown/40' : 'text-milky-brown'}`}>{c.name}</p>
                    <p className="text-[10px] font-bold text-milky-brown/30 uppercase">Round {c.round}</p>
                  </div>
                  <div className={`text-3xl ${c.is_used ? 'opacity-20' : 'text-milky-accent/40 group-hover:scale-125 transition-transform'}`}>
                    {c.suit === 'S' && '♠'}
                    {c.suit === 'C' && '♣'}
                    {c.suit === 'D' && '♦'}
                    {c.suit === 'H' && '♥'}
                  </div>
                </div>
                {!c.is_used && (
                  <div className="absolute inset-y-0 left-0 w-1.5 bg-milky-apricot opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </MotionWrapper>
            ))}
          </ul>
        )}
      </aside>

      {s2Selection.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm space-y-6">
            {s2Selection.triggeredByActionId ? (
              <div className="text-center space-y-1">
                <p className="text-xs font-black text-milky-accent uppercase tracking-widest">梭哈是一種智慧觸發！</p>
                <h3 className="text-2xl font-black text-milky-brown">重修舊好</h3>
                <p className="text-sm font-bold text-milky-brown/60">U-3 為您隨機抽到了這個能力！<br/>免費選一張牌加入步數，無需消耗資源</p>
              </div>
            ) : (
              <>
                <h3 className="text-2xl font-black text-milky-brown text-center">重修舊好</h3>
                <p className="text-sm font-bold text-milky-brown/60 text-center">選擇一張卡牌加入本回合的移動步數</p>
              </>
            )}

            <div className="space-y-3">
              <p className="text-sm font-bold text-milky-brown">1. 選擇花色</p>
              <div className="grid grid-cols-4 gap-2">
                {(["S", "H", "D", "C"] as const).map(s => (
                  <button key={s} onClick={() => setS2Selection(prev => ({ ...prev, suit: s }))} className={`py-3 rounded-xl border-2 text-2xl font-black transition-all ${s2Selection.suit === s ? "border-milky-accent bg-milky-accent/10" : "border-milky-beige bg-milky-white hover:border-milky-apricot"}`}>
                    <span className={s === "D" || s === "H" ? "text-milky-accent" : "text-milky-brown"}>
                      {s === "S" ? "♠" : s === "H" ? "♥" : s === "D" ? "♦" : "♣"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-bold text-milky-brown">2. 選擇點數</p>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(p => (
                  <button key={p} onClick={() => setS2Selection(prev => ({ ...prev, points: p }))} className={`py-3 rounded-xl border-2 text-xl font-black transition-all ${s2Selection.points === p ? "border-milky-accent bg-milky-accent/10 text-milky-accent" : "border-milky-beige bg-milky-white text-milky-brown/60 hover:border-milky-apricot hover:text-milky-brown"}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              {!s2Selection.triggeredByActionId && (
                <button onClick={() => setS2Selection({ isOpen: false, suit: null, points: null })} className="flex-1 py-3 rounded-xl font-bold text-milky-brown bg-milky-beige/50 hover:bg-milky-beige transition-colors">取消</button>
              )}
              <button
                disabled={!s2Selection.suit || !s2Selection.points}
                onClick={handleConfirmS2}
                className="flex-[2] py-3 rounded-xl font-bold text-white bg-milky-accent disabled:opacity-50 disabled:cursor-not-allowed hover:bg-milky-accent/90 transition-colors shadow-lg"
              >
                {s2Selection.triggeredByActionId ? "✨ 免費確認" : "確認施放"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/browser";
import { motion, AnimatePresence } from "framer-motion";

export type GameEvent = {
  id: string;
  game_id: string;
  round: number;
  message: string;
  type: string;
  created_at: string;
};

export function BattleReport({ gameId }: { gameId: string }) {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    // 1. Fetch historical events
    const fetchEvents = async () => {
      const { data } = await supabase
        .from("game_events")
        .select("*")
        .eq("game_id", gameId)
        .order("created_at", { ascending: true });
      if (data) {
        setEvents(data as GameEvent[]);
      }
    };
    void fetchEvents();

    // 2. Subscribe to new events
    const channel = supabase
      .channel("game-events")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "game_events",
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          setEvents((prev) => {
            const newEvent = payload.new as GameEvent;
            // 防重覆
            if (prev.some((e) => e.id === newEvent.id)) return prev;
            return [...prev, newEvent];
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [gameId, supabase]);

  // 3. Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  const renderMessage = (msg: string) => {
    // 找出所有 【】 並加粗變色
    const parts = msg.split(/(【.*?】)/g);
    return parts.map((part, i) => {
      if (part.startsWith("【") && part.endsWith("】")) {
        return (
          <span key={i} className="font-black text-milky-apricot drop-shadow-sm">
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  const getTypeStyle = (type: string) => {
    switch (type) {
      case "skill":
        return "border-l-milky-accent bg-blue-50/5 text-blue-100";
      case "warning":
        return "border-l-red-400 bg-red-50/5 text-red-100";
      case "movement":
        return "border-l-milky-apricot bg-orange-50/5 text-orange-100";
      case "system":
      default:
        return "border-l-green-400 bg-green-50/5 text-green-100";
    }
  };

  if (events.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] w-[350px] h-[300px] flex flex-col pointer-events-none">
      {/* 標題 */}
      <div className="bg-black/40 backdrop-blur-md rounded-t-2xl px-4 py-2 border-b border-white/10 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-white/80 text-xs font-black uppercase tracking-widest">LIVE BATTLE REPORT</span>
      </div>
      
      {/* 滾動內容區 */}
      <div 
        ref={scrollRef}
        className="flex-1 bg-black/30 backdrop-blur-md rounded-b-2xl p-4 overflow-y-auto custom-scrollbar flex flex-col gap-2"
        style={{ scrollBehavior: "smooth" }}
      >
        <AnimatePresence initial={false}>
          {events.map((event) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className={`border-l-4 pl-3 py-2 pr-2 rounded-r-xl shadow-sm text-sm ${getTypeStyle(event.type)}`}
            >
              <div className="leading-relaxed font-bold tracking-wide">
                {renderMessage(event.message)}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

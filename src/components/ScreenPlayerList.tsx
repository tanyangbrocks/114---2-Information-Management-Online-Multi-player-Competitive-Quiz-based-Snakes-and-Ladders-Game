"use client";

import { motion } from "framer-motion";
import type { GameRow, PlayerRow, SkillAction } from "@/types/game";
import { MapPin, Star } from "lucide-react";

export const TOKEN_COLORS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEEAD",
  "#D4A5A5", "#9B59B6", "#F1C40F", "#E67E22", "#2ECC71",
  "#3498DB", "#E74C3C",
];

type Props = {
  game: GameRow;
  players: PlayerRow[];
  skillActions: SkillAction[];
};

export function ScreenPlayerList({ game, players, skillActions }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-1 gap-4 h-full content-start">
      {players.map((p, idx) => {
        const roundKey = String(game.current_round);
        const hasAnswered = !!p.answers[roundKey];
        const hasSelectedSkill = skillActions.some(a => a.player_id === p.id && a.round === game.current_round);

        let statusText = "等待中";
        let statusColor = "text-milky-brown/40";

        if (game.phase === "question") {
          statusText = hasAnswered ? "已作答" : "答題中...";
          statusColor = hasAnswered ? "text-milky-accent" : "text-milky-brown animate-pulse";
        } else if (game.phase === "reveal") {
          statusText = "確認結果中";
          statusColor = "text-milky-brown";
        } else if (game.phase === "skill") {
          statusText = hasSelectedSkill ? "技能準備完畢" : "思考技能中...";
          statusColor = hasSelectedSkill ? "text-milky-accent" : "text-milky-brown animate-pulse";
        } else if (game.phase === "settle") {
          statusText = "移動中...";
          statusColor = "text-milky-accent animate-bounce";
        } else if (game.phase === "between_rounds") {
          statusText = "準備下回合";
          statusColor = "text-milky-brown/60";
        } else if (game.phase === "finished") {
          statusText = "冒險結束";
          statusColor = "text-milky-apricot";
        }

        const color = TOKEN_COLORS[idx % TOKEN_COLORS.length];

        return (
          <motion.div
            key={p.id}
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`p-3 sm:p-4 rounded-3xl border-2 border-milky-beige/30 bg-white shadow-sm flex flex-col gap-3 relative overflow-hidden`}
          >
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 sm:h-12 sm:w-12 rounded-2xl flex items-center justify-center text-white shadow-md font-black flex-shrink-0"
                style={{ backgroundColor: color }}
              >
                {p.name.substring(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-milky-brown truncate text-sm sm:text-base">{p.name}</p>
                <div className={`text-[10px] font-black uppercase tracking-widest ${statusColor} bg-milky-beige/10 inline-block px-2 py-0.5 rounded-full mt-1 border border-milky-beige/20`}>
                  {statusText}
                </div>
              </div>
            </div>
            <div className="flex justify-between items-center bg-milky-beige/10 p-2 rounded-2xl border border-milky-beige/20">
              <div className="flex flex-col items-center flex-1 border-r border-milky-beige/20">
                <MapPin className="w-3 h-3 text-milky-brown/40 mb-1" />
                <span className="font-black text-milky-brown text-sm">{p.position}</span>
              </div>
              <div className="flex flex-col items-center flex-1">
                <Star className="w-3 h-3 text-milky-accent/60 mb-1" />
                <span className="font-black text-milky-accent text-sm">{p.stars}</span>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

import { create } from "zustand";
import { persist } from "zustand/middleware";

type SessionMap = Record<string, string>;

type State = {
  playerByGame: SessionMap;
  setPlayerId: (gameId: string, playerId: string) => void;
  getPlayerId: (gameId: string) => string | undefined;
  clearPlayerId: (gameId: string) => void;
};

export const usePlayerSessionStore = create<State>()(
  persist(
    (set, get) => ({
      playerByGame: {},
      setPlayerId: (gameId, playerId) =>
        set((s) => ({ playerByGame: { ...s.playerByGame, [gameId]: playerId } })),
      getPlayerId: (gameId) => get().playerByGame[gameId],
      clearPlayerId: (gameId) =>
        set((s) => {
          const rest = { ...s.playerByGame };
          delete rest[gameId];
          return { playerByGame: rest };
        })
    }),
    { name: "snake-ladder-quiz-player-sessions" }
  )
);

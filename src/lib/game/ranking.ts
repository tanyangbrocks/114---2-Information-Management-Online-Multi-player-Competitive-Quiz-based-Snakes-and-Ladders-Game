import type { PlayerRow, RankedPlayer } from "@/types/game";

export function rankPlayers(players: PlayerRow[]): RankedPlayer[] {
  const sorted = [...players].sort((a, b) => {
    if (b.stars !== a.stars) return b.stars - a.stars;
    return b.position - a.position;
  });
  return sorted.slice(0, 3).map((p) => ({
    id: p.id,
    name: p.name,
    stars: p.stars,
    position: p.position
  }));
}

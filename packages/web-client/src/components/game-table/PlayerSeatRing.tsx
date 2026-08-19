import type { ClientView } from '@rose-blade/game-engine';
import { PlayerSeat } from './PlayerSeat';

type Player = ClientView['players'][number];


export function PlayerSeatRing({ players, myPlayerId, coinHolderId, currentPlayerId, seenPlayerIds }: { players: Player[]; myPlayerId: string; coinHolderId: string | null; currentPlayerId: string | null; seenPlayerIds: string[] }) {
  const sorted = [...players].sort((a, b) => a.seatIndex - b.seatIndex);
  const meIndex = sorted.findIndex((player) => player.id === myPlayerId);
  const count = sorted.length;
  if (count === 0 || meIndex < 0) return null;
  const radius = count >= 9 ? 41 : count >= 7 ? 42 : 43;
  return <div className="player-seat-ring" aria-label={`${count} 人座位`}>
    {sorted.map((player, index) => {
      const relativeIndex = (index - meIndex + count) % count;
      const angle = Math.PI / 2 + (relativeIndex * Math.PI * 2) / count;
      return <PlayerSeat key={player.id} player={player} isMe={player.id === myPlayerId} isCoinHolder={player.id === coinHolderId} isCurrentTurn={player.id === currentPlayerId} isSeenByMe={seenPlayerIds.includes(player.id)} style={{ left: `${50 + radius * Math.cos(angle)}%`, top: `${50 + radius * Math.sin(angle)}%` }} />;
    })}
  </div>;
}

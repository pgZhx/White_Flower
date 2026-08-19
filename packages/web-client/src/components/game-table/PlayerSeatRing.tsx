import type { ClientView } from '@rose-blade/game-engine';
import { PlayerSeat } from './PlayerSeat';

type Player = ClientView['players'][number];

function directionFor(index: number, meIndex: number, count: number, isMe: boolean) {
  if (isMe) return '你';
  const right = (index - meIndex + count) % count;
  const left = count - right;
  return right <= left ? `右${right}` : `左${left}`;
}

export function PlayerSeatRing({ players, myPlayerId, coinHolderId, currentPlayerId }: { players: Player[]; myPlayerId: string; coinHolderId: string | null; currentPlayerId: string | null }) {
  const sorted = [...players].sort((a, b) => a.seatIndex - b.seatIndex);
  const meIndex = sorted.findIndex((player) => player.id === myPlayerId);
  const count = sorted.length;
  if (count === 0 || meIndex < 0) return null;
  const radius = count >= 9 ? 39 : count >= 7 ? 38 : 37;
  return <div className="player-seat-ring" aria-label={`${count} 人座位`}>
    {sorted.map((player, index) => {
      const relativeIndex = (index - meIndex + count) % count;
      const angle = Math.PI / 2 + (relativeIndex * Math.PI * 2) / count;
      return <PlayerSeat key={player.id} player={player} direction={directionFor(index, meIndex, count, player.id === myPlayerId)} isMe={player.id === myPlayerId} isCoinHolder={player.id === coinHolderId} isCurrentTurn={player.id === currentPlayerId} style={{ left: `${50 + radius * Math.cos(angle)}%`, top: `${50 + radius * Math.sin(angle)}%` }} />;
    })}
  </div>;
}

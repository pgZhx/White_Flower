import type { ClientView } from '@rose-blade/game-engine';
import { PlayerSeat } from './PlayerSeat';

type Player = ClientView['players'][number];
const seatSlots = ['seat-slot--top', 'seat-slot--upper-right', 'seat-slot--lower-right', 'seat-slot--lower-left', 'seat-slot--upper-left'];

function directionFor(player: Player, players: Player[], myPlayerId: string): string {
  const meIndex = players.findIndex((candidate) => candidate.id === myPlayerId);
  const playerIndex = players.findIndex((candidate) => candidate.id === player.id);
  if (meIndex < 0 || playerIndex < 0 || player.id === myPlayerId) return '你';
  const right = (playerIndex - meIndex + players.length) % players.length;
  const left = players.length - right;
  return right <= left ? `右${right}` : `左${left}`;
}

export function RoundTable({ players, myPlayerId, coinHolderId }: { players: Player[]; myPlayerId: string; coinHolderId: string | null }) {
  const sortedPlayers = [...players].sort((a, b) => a.seatIndex - b.seatIndex);
  if (!sortedPlayers.some((player) => player.id === myPlayerId)) return null;
  return <div className="round-table" aria-label="圆桌座位图">
    <div className="round-table__surface" aria-hidden="true"><div className="round-table__grain" /><div className="round-table__center-mark">✦</div></div>
    <div className="round-table__seats">{sortedPlayers.map((player, index) => <div className={`seat-slot ${seatSlots[index % seatSlots.length]}`} key={player.id}><PlayerSeat player={player} direction={directionFor(player, sortedPlayers, myPlayerId)} isMe={player.id === myPlayerId} isCoinHolder={player.id === coinHolderId} /></div>)}</div>
  </div>;
}

import type { ClientView } from '@rose-blade/game-engine';
import { CoinIndicator } from './CoinIndicator';

type Player = ClientView['players'][number];

export function PlayerSeat({ player, direction, isMe, isCoinHolder }: { player: Player; direction: string; isMe: boolean; isCoinHolder: boolean }) {
  return <div className={`player-seat${isMe ? ' player-seat--me' : ''}`}>
    {isCoinHolder && <CoinIndicator />}
    <div className="player-seat__avatar"><span className="player-seat__name">{player.nickname}</span>{isMe && <span className="player-seat__self">(你)</span>}<span className="player-seat__direction">{direction}</span></div>
  </div>;
}

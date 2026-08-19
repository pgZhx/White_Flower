import type { ClientView } from '@rose-blade/game-engine';
import { CoinIndicator } from '../CoinIndicator';

type Player = ClientView['players'][number];

export function PlayerSeat({ player, direction, isMe, isCoinHolder, isCurrentTurn, style }: { player: Player; direction: string; isMe: boolean; isCoinHolder: boolean; isCurrentTurn: boolean; style: React.CSSProperties }) {
  return <div className="player-seat-ring__slot" style={style}>
    <div className={`player-seat${isMe ? ' player-seat--me' : ''}${isCurrentTurn ? ' player-seat--turn' : ''}`}>
      {isCoinHolder && <CoinIndicator />}
      <button type="button" className="player-seat__avatar" aria-label={`查看玩家 ${player.nickname}`}>
        <span className="player-seat__name">{player.nickname}</span>{isMe && <span className="player-seat__self">(你)</span>}<span className="player-seat__direction">{direction}</span>
      </button>
    </div>
  </div>;
}

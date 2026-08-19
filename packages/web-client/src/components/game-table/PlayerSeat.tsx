import type { ClientView } from '@rose-blade/game-engine';
import { CoinIndicator } from '../CoinIndicator';

type Player = ClientView['players'][number];

export function PlayerSeat({ player, isMe, isCoinHolder, isCurrentTurn, isSeenByMe, style }: { player: Player; isMe: boolean; isCoinHolder: boolean; isCurrentTurn: boolean; isSeenByMe: boolean; style: React.CSSProperties }) {
  return <div className="player-seat-ring__slot" style={style}>
    <div className={`player-seat${isMe ? ' player-seat--me' : ''}${isCurrentTurn ? ' player-seat--turn' : ''}`}>
      {isSeenByMe && <span className="player-seat__eye" aria-label="你看见过该玩家" title="你看见过该玩家">👁️</span>}
      {isCoinHolder && <CoinIndicator />}
      <button type="button" className="player-seat__avatar" aria-label={`查看玩家 ${player.nickname}`}>
        <span className="player-seat__name">{player.nickname}</span>{isMe && <span className="player-seat__self">(你)</span>}
      </button>
    </div>
  </div>;
}

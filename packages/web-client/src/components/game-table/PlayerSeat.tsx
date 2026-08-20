import type { ClientView } from '@rose-blade/game-engine';
import { CoinIndicator } from '../CoinIndicator';

type Player = ClientView['players'][number];

export function PlayerSeat({ player, isMe, isCoinHolder, isCurrentTurn, isSeenByMe, style }: { player: Player; isMe: boolean; isCoinHolder: boolean; isCurrentTurn: boolean; isSeenByMe: boolean; style: React.CSSProperties }) {
  return <div className="player-seat-ring__slot" style={style}>
    <div className={`player-seat${isMe ? ' player-seat--me' : ''}${isCurrentTurn ? ' player-seat--turn' : ''}`}>
      {isSeenByMe && (
        <span className="player-seat__eye" aria-label="你看见过该玩家" title="你看见过该玩家">
          <svg className="player-seat__eye-icon" viewBox="0 0 64 40" aria-hidden="true">
            <defs>
              <linearGradient id="eye-white" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fff8dc" />
                <stop offset="1" stopColor="#d9b978" />
              </linearGradient>
              <radialGradient id="eye-iris">
                <stop offset="0" stopColor="#f7dc83" />
                <stop offset=".58" stopColor="#a9672e" />
                <stop offset="1" stopColor="#3a160d" />
              </radialGradient>
            </defs>
            <path className="player-seat__eye-white" d="M4 20C13 4 51 4 60 20C51 36 13 36 4 20Z" />
            <path className="player-seat__eye-lid" d="M4 20C13 4 51 4 60 20" />
            <circle className="player-seat__eye-iris" cx="32" cy="20" r="10" />
            <circle className="player-seat__eye-pupil" cx="32" cy="20" r="5" />
            <circle className="player-seat__eye-glint" cx="29" cy="16" r="2" />
          </svg>
        </span>
      )}
      {isCoinHolder && <CoinIndicator />}
      <button type="button" className="player-seat__avatar" aria-label={`查看玩家 ${player.nickname}`}>
        <span className="player-seat__name">{player.nickname}</span>{isMe && <span className="player-seat__self">(你)</span>}
      </button>
      <span className="player-seat__hand-count" aria-label={`${player.nickname} 剩余 ${player.handCount} 张手牌`}>
        手牌 {player.handCount}
      </span>
    </div>
  </div>;
}

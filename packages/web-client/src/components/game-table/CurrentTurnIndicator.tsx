import type { ClientView } from '@rose-blade/game-engine';

function RuneCursor() { return <svg className="rune-cursor" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 3l5 13 13 8-13 8-5 13-5-13-13-8 13-8Z"/><circle cx="24" cy="24" r="5" /></svg>; }

export function CurrentTurnIndicator({ player }: { player: ClientView['players'][number] | undefined }) {
  return (
    <div className="table-turn" aria-label={player ? `当前行动：${player.nickname}` : '当前没有行动玩家'}>
      <span className="table-turn__icon"><RuneCursor /></span>
      <span className="table-turn__label">当前行动</span>
      <strong>{player?.nickname ?? '等待开始'}</strong>
    </div>
  );
}

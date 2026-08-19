import type { ClientView } from '@rose-blade/game-engine';

export function CurrentTurnIndicator({ player }: { player: ClientView['players'][number] | undefined }) {
  return (
    <div className="table-turn" aria-label={player ? `当前行动：${player.nickname}` : '当前没有行动玩家'}>
      <span className="table-turn__icon" aria-hidden="true">➤</span>
      <span className="table-turn__label">当前行动</span>
      <strong>{player?.nickname ?? '等待开始'}</strong>
    </div>
  );
}

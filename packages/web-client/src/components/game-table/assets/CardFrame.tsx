import type { Card } from '@rose-blade/game-engine';
import { cardLabel } from '../../../game/labels';

export function CardFrame({ card }: { card: Card }) {
  const kind = card === 'GHOST' ? 'ghost' : card === 'BELIEVER' ? 'believer' : card === 'WHITE_ROSE' ? 'rose' : 'blade';
  return <div className={`hand-card hand-card--${kind}`}><span className="hand-card__corner">✦</span><span className="hand-card__sigil" aria-hidden="true">{kind === 'ghost' ? '◌' : kind === 'blade' ? '†' : '✿'}</span><span>{cardLabel(card)}</span><span className="hand-card__corner hand-card__corner--bottom">✦</span></div>;
}

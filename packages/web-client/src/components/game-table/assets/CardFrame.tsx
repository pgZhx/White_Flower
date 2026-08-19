import type { Card } from '@rose-blade/game-engine';
import { cardLabel } from '../../../game/labels';
import { BladeIcon } from './BladeIcon';
import { RoseIcon } from './RoseIcon';

export function CardFrame({ card }: { card: Card }) {
  const kind = card === 'GHOST' ? 'ghost' : card === 'BELIEVER' || card === 'BISHOP' ? 'believer' : card === 'WHITE_ROSE' ? 'rose' : 'blade';
  return (
    <div className={`hand-card hand-card--${kind}`} aria-label={cardLabel(card)}>
      <span className="hand-card__corner">1</span>
      <span className="hand-card__art" aria-hidden="true">
        {kind === 'ghost' ? <span className="ghost-card-figure" /> : kind === 'blade' ? <BladeIcon /> : <RoseIcon state={kind === 'rose' ? 'SAFE' : 'SAFE'} />}
      </span>
      <span className="hand-card__name">{cardLabel(card)}</span>
      <span className="hand-card__seal" aria-hidden="true">{kind === 'ghost' ? '◌' : kind === 'blade' ? '✦' : '✧'}</span>
      <span className="hand-card__corner hand-card__corner--bottom">✦</span>
    </div>
  );
}

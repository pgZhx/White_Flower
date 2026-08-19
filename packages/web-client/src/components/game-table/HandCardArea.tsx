import type { Card } from '@rose-blade/game-engine';
import { cardLabel } from '../../game/labels';

export function HandCardArea({ cards }: { cards: Card[] }) {
  return (
    <section className="hand-card-area" aria-label="我的手牌">
      <div className="hand-card-area__title"><span>我的手牌</span><span>{cards.length}/3</span></div>
      <div className="hand-card-area__cards">
        {Array.from({ length: 3 }, (_, index) => {
          const card = cards[index];
          return card ? <div className="hand-card" key={`${card}-${index}`}><span className="hand-card__seal">✦</span><span>{cardLabel(card)}</span></div> : <div className="hand-card hand-card--empty" key={`empty-${index}`} aria-label="空卡槽"><span>+</span></div>;
        })}
      </div>
    </section>
  );
}

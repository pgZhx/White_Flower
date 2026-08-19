export type WhiteRoseState = 'HIDDEN' | 'SAFE' | 'KILLED';

export function RoseTracker({ state, sacrificed, threshold }: { state: WhiteRoseState; sacrificed: number; threshold: number }) {
  const flowerClass = `rose-tracker__flower rose-tracker__flower--${state.toLowerCase()}`;
  return (
    <button type="button" className={`table-tracker rose-tracker rose-tracker--${state.toLowerCase()}`} title="白蔷薇与信者状态">
      <span className="table-tracker__eyebrow">白蔷薇</span>
      <span className={flowerClass} aria-hidden="true">✿</span>
      <span className="rose-tracker__buds" aria-label={`献祭信者 ${sacrificed} / ${threshold}`}>
        {Array.from({ length: threshold }, (_, index) => <span key={index} className={index < sacrificed ? 'is-filled' : ''}>✿</span>)}
      </span>
      <span className="table-tracker__count">{sacrificed}/{threshold}</span>
    </button>
  );
}

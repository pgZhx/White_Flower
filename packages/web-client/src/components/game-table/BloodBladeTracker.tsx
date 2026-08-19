export function BloodBladeTracker({ doubleKnives, darkKnives, deadBelievers, threshold }: { doubleKnives: number; darkKnives: number; deadBelievers: number; threshold: number }) {
  return (
    <button type="button" className="table-tracker blood-tracker" title="血刃与死亡信者状态">
      <span className="table-tracker__eyebrow">血刃</span>
      <span className="blood-tracker__icon" aria-hidden="true">⚔</span>
      <span className="blood-tracker__blades">双刃 ×{doubleKnives}　暗刃 ×{darkKnives}</span>
      <span className="blood-tracker__flowers" aria-label={`死亡信者 ${deadBelievers} / ${threshold}`}>
        {Array.from({ length: threshold }, (_, index) => <span key={index} className={index < deadBelievers ? 'is-filled' : ''}>✿</span>)}
      </span>
      <span className="table-tracker__count">{deadBelievers}/{threshold}</span>
    </button>
  );
}

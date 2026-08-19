import { BelieverIcon } from './assets/BelieverIcon';
import { BladeIcon } from './assets/BladeIcon';
export function BloodBladeTracker({ greatSwords, doubleKnives, darkKnives, deadBelievers, threshold }: { greatSwords: number; doubleKnives: number; darkKnives: number; deadBelievers: number; threshold: number }) {
  return (
    <button type="button" className="table-tracker blood-tracker" title="血刃与死亡信者状态">
      <span className="table-tracker__eyebrow">血刃</span>
      <span className="blood-tracker__icon"><BladeIcon /></span>
      <span className="blood-tracker__blades">巨刃 ×{greatSwords}　双刃 ×{doubleKnives}　暗刃 ×{darkKnives}</span>
      <span className="blood-tracker__flowers" aria-label={`死亡信者 ${deadBelievers} / ${threshold}`}>
        {Array.from({ length: threshold }, (_, index) => <BelieverIcon key={index} filled={index < deadBelievers} blood />)}
      </span>
      <span className="table-tracker__count">{deadBelievers}/{threshold}</span>
    </button>
  );
}

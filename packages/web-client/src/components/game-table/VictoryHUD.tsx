import { BloodBladeTracker } from './BloodBladeTracker';
import { RoseTracker, type WhiteRoseState } from './RoseTracker';

export function VictoryHUD({ whiteRoseState, sacrificed, sacrificeThreshold, deadBelievers, deathThreshold, doubleKnives, darkKnives }: { whiteRoseState: WhiteRoseState; sacrificed: number; sacrificeThreshold: number; deadBelievers: number; deathThreshold: number; doubleKnives: number; darkKnives: number }) {
  return <div className="table-victory-hud"><RoseTracker state={whiteRoseState} sacrificed={sacrificed} threshold={sacrificeThreshold} /><BloodBladeTracker doubleKnives={doubleKnives} darkKnives={darkKnives} deadBelievers={deadBelievers} threshold={deathThreshold} /></div>;
}

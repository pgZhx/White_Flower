import { BloodBladeTracker } from './BloodBladeTracker';
import { RoseTracker, type WhiteRoseState } from './RoseTracker';

export function VictoryHUD({ whiteRoseState, sacrificed, sacrificeThreshold, deadBelievers, deathThreshold, greatSwords, doubleKnives, darkKnives }: { whiteRoseState: WhiteRoseState; sacrificed: number; sacrificeThreshold: number; deadBelievers: number; deathThreshold: number; greatSwords: number; doubleKnives: number; darkKnives: number }) {
  return <div className="table-victory-hud"><RoseTracker state={whiteRoseState} sacrificed={sacrificed} threshold={sacrificeThreshold} /><BloodBladeTracker greatSwords={greatSwords} doubleKnives={doubleKnives} darkKnives={darkKnives} deadBelievers={deadBelievers} threshold={deathThreshold} /></div>;
}

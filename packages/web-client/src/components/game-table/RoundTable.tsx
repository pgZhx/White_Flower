import type { ClientView } from '@rose-blade/game-engine';
import { getPlayerCountRules, isBud } from '@rose-blade/game-engine';
import { CurrentTurnIndicator } from './CurrentTurnIndicator';
import { HandCardArea } from './HandCardArea';
import { PlayerSeatRing } from './PlayerSeatRing';
import { VictoryHUD } from './VictoryHUD';

export function RoundTable({ view, myPlayerId, currentPlayerId }: { view: ClientView; myPlayerId: string; currentPlayerId: string | null }) {
  const rules = getPlayerCountRules(view.players.length);
  const sorted = [...view.players].sort((a, b) => a.seatIndex - b.seatIndex);
  const deadBelievers = view.deathPile.filter(isBud).length;
  const sacrificed = view.sacrificePile.filter(isBud).length;
  const doubleKnives = view.bladePile.filter((card) => card === 'DOUBLE_KNIFE').length;
  const darkKnives = view.bladePile.filter((card) => card === 'DARK_KNIFE').length;
  const whiteRoseKilled = view.eventLog.some((event) => event.type === 'WHITE_ROSE_KILLED');
  const whiteRoseState = whiteRoseKilled ? 'KILLED' : view.whiteRoseSafe ? 'SAFE' : 'HIDDEN';
  const currentPlayer = sorted.find((player) => player.id === currentPlayerId);
  return <div className="round-table" aria-label="数字桌游圆桌">
    <div className="round-table__surface"><div className="round-table__grain" /><div className="round-table__center">
      <VictoryHUD whiteRoseState={whiteRoseState} sacrificed={sacrificed} sacrificeThreshold={rules.sacrificeThreshold} deadBelievers={deadBelievers} deathThreshold={rules.deathThreshold} doubleKnives={doubleKnives} darkKnives={darkKnives} />
      <CurrentTurnIndicator player={currentPlayer} />
    </div></div>
    <PlayerSeatRing players={view.players} myPlayerId={myPlayerId} coinHolderId={view.currentCoinHolderId} currentPlayerId={currentPlayerId} />
    <HandCardArea cards={view.me.hand} />
  </div>;
}

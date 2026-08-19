import type { WhiteRoseState } from '../RoseTracker';

const ROSE_REFERENCE_SRC = '/game-table/white-rose-reference.png';

export function RoseIcon({ state, small = false }: { state: WhiteRoseState; small?: boolean }) {
  return (
    <span className={`rose-icon rose-icon--${state.toLowerCase()}${small ? ' rose-icon--small' : ''}`} aria-hidden="true">
      <img className="rose-reference-image" src={ROSE_REFERENCE_SRC} alt="" />
      {state === 'KILLED' && <span className="rose-reference-crack" />}
    </span>
  );
}

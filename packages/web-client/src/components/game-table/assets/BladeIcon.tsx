const BLADE_REFERENCE_SRC = '/game-table/blood-blade-reference.png';

export function BladeIcon() {
  return <span className="blade-icon" aria-hidden="true"><img className="blade-reference-image" src={BLADE_REFERENCE_SRC} alt="" /></span>;
}

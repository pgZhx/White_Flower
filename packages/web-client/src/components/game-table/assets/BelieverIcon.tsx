import { RoseIcon } from './RoseIcon';

export function BelieverIcon({ filled, blood = false }: { filled: boolean; blood?: boolean }) {
  return <span className={`believer-icon${filled ? ' is-filled' : ''}${blood ? ' is-blood' : ''}`}><RoseIcon state={filled ? (blood ? 'KILLED' : 'SAFE') : 'HIDDEN'} small /></span>;
}

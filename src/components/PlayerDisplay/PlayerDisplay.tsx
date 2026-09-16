import './PlayerDisplay.css';

interface Props {
  name: string;
  alias?: string | null;
  /** sm = compacto (listas), md = default */
  size?: 'sm' | 'md';
}

/**
 * Renders a player as "alias" (gamertag, primary) with the real name below smaller.
 * If no alias, shows just the name.
 */
export default function PlayerDisplay({ name, alias, size = 'md' }: Props) {
  const primary = alias || name;
  const secondary = alias ? name : null;
  return (
    <span className={`pdn pdn--${size}`}>
      <span className="pdn-alias">{primary}</span>
      {secondary && <span className="pdn-name">{secondary}</span>}
    </span>
  );
}

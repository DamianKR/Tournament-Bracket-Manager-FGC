import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Character } from '@/data/games';
import { getCharacterImageUrl } from '@/utils/characterImage';
import './CharacterDropdown.css';

interface Props {
  gameId: string;
  characters: Character[];
  value: string | null;
  onChange: (characterId: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

function CharacterDropdown({ gameId, characters, value, onChange, placeholder, disabled }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = characters.find((c) => c.id === value) ?? null;
  const filtered = characters.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase())
  );

  // Position dropdown menu
  useEffect(() => {
    if (!open || !ref.current || !menuRef.current) return;
    const rect = ref.current.getBoundingClientRect();
    const menu = menuRef.current;
    const menuHeight = 260;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
      menu.style.top = `${rect.top - menuHeight - 4}px`;
    } else {
      menu.style.top = `${rect.bottom + 4}px`;
    }

    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 220 - 8));
    menu.style.left = `${left}px`;
    menu.style.minWidth = `${rect.width}px`;
    menu.style.width = `${Math.max(rect.width, 220)}px`;
  }, [open]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        menuRef.current && !menuRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (id: string | null) => {
    onChange(id);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className={`char-dropdown ${open ? 'open' : ''} ${disabled ? 'disabled' : ''}`} ref={ref}>
      <button
        type="button"
        className="char-dropdown-trigger"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
      >
        {selected ? (
          <>
            <img
              src={getCharacterImageUrl(gameId, selected.id) ?? ''}
              alt={selected.name}
              className="char-dropdown-icon"
            />
            <span className="char-dropdown-label">{selected.name}</span>
          </>
        ) : (
          <span className="char-dropdown-placeholder">
            {placeholder ?? t('tournament.matchResult.character')}
          </span>
        )}
        <i className={`fas fa-chevron-${open ? 'up' : 'down'} char-dropdown-arrow`} />
      </button>

      {open && (
        <div className="char-dropdown-menu" ref={menuRef}>
          <div className="char-dropdown-search">
            <i className="fas fa-search" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('common.search')}
              autoFocus
            />
          </div>
          <div className="char-dropdown-list">
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`char-dropdown-item ${value === c.id ? 'selected' : ''}`}
                onClick={() => select(c.id)}
              >
                <img
                  src={getCharacterImageUrl(gameId, c.id) ?? ''}
                  alt={c.name}
                  className="char-dropdown-item-icon"
                />
                <span className="char-dropdown-item-name">{c.name}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="char-dropdown-empty">{t('common.noResults')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default CharacterDropdown;

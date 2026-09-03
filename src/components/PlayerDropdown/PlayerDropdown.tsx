import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GlobalParticipant } from '@/models/types';
import './PlayerDropdown.css';

interface PlayerDropdownProps {
  participants: GlobalParticipant[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  placeholder?: string;
  className?: string;
}

function PlayerDropdown({ participants, selectedId, onSelect, placeholder, className = '' }: PlayerDropdownProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const displayPlaceholder = placeholder ?? t('common.allPlayers');
  const [openToRight, setOpenToRight] = useState(true);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = participants.find(p => p.id === selectedId);
  const sortedParticipants = [...participants].sort((a, b) => a.name.localeCompare(b.name));

  function handleToggle() {
    if (!isOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const spaceRight = window.innerWidth - rect.left;
      const spaceLeft = rect.right;
      const menuWidth = 280;
      const canOpenRight = spaceRight >= menuWidth;
      const canOpenLeft = spaceLeft >= menuWidth;
      setOpenToRight(canOpenRight || (!canOpenLeft && spaceRight >= spaceLeft));
    }
    setIsOpen(!isOpen);
  }

  const filtered = search.trim()
    ? sortedParticipants.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.alias && p.alias.toLowerCase().includes(search.toLowerCase()))
      )
    : sortedParticipants;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchRef.current) {
      searchRef.current.focus();
    }
  }, [isOpen]);

  function handleSelect(id: string | null) {
    onSelect(id);
    setIsOpen(false);
    setSearch('');
  }

  return (
    <div className={`player-dropdown ${className}`} ref={dropdownRef}>
      <button
        className="player-dropdown-trigger"
        onClick={handleToggle}
        type="button"
      >
        <span className="player-dropdown-label">
          {selected ? (
            <>
              <i className="fas fa-user" />
              {selected.alias ? `${selected.alias} (${selected.name})` : selected.name}
            </>
          ) : (
            <>
              <i className="fas fa-users" />
              {displayPlaceholder}
            </>
          )}
        </span>
        <i className={`fas fa-chevron-down player-dropdown-arrow ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div className={`player-dropdown-menu ${openToRight ? 'align-left' : 'align-right'}`}>
          <div className="player-dropdown-search">
            <i className="fas fa-search" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('common.searchPlayers')}
              className="player-dropdown-search-input"
            />
          </div>

          <div className="player-dropdown-list">
            <button
              className={`player-dropdown-item ${selectedId === null ? 'selected' : ''}`}
              onClick={() => handleSelect(null)}
              type="button"
            >
              <i className="fas fa-users" />
              <span>{t('common.allPlayers')}</span>
              {selectedId === null && <i className="fas fa-check player-dropdown-check" />}
            </button>

            {filtered.length === 0 && (
              <div className="player-dropdown-empty">
                <i className="fas fa-search" />
                <span>{t('common.noPlayersFound')}</span>
              </div>
            )}

            {filtered.map(p => (
              <button
                key={p.id}
                className={`player-dropdown-item ${selectedId === p.id ? 'selected' : ''}`}
                onClick={() => handleSelect(p.id)}
                type="button"
              >
                <i className="fas fa-user" />
                <div className="player-dropdown-item-info">
                  <span className="player-dropdown-item-name">{p.alias ? `${p.alias} (${p.name})` : p.name}</span>
                </div>
                {selectedId === p.id && <i className="fas fa-check player-dropdown-check" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default PlayerDropdown;

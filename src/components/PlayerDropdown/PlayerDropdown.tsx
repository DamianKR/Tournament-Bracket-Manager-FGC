import { useState, useRef, useEffect } from 'react';
import { GlobalParticipant } from '@/models/types';
import './PlayerDropdown.css';

interface PlayerDropdownProps {
  participants: GlobalParticipant[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  placeholder?: string;
  className?: string;
}

function PlayerDropdown({ participants, selectedId, onSelect, placeholder = 'All Players', className = '' }: PlayerDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = participants.find(p => p.id === selectedId);
  const sortedParticipants = [...participants].sort((a, b) => a.name.localeCompare(b.name));

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
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <span className="player-dropdown-label">
          {selected ? (
            <>
              <i className="fas fa-user" />
              {selected.name}
              {selected.alias && <span className="player-alias">({selected.alias})</span>}
            </>
          ) : (
            <>
              <i className="fas fa-users" />
              {placeholder}
            </>
          )}
        </span>
        <i className={`fas fa-chevron-down player-dropdown-arrow ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div className="player-dropdown-menu">
          <div className="player-dropdown-search">
            <i className="fas fa-search" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search players..."
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
              <span>All Players</span>
              {selectedId === null && <i className="fas fa-check player-dropdown-check" />}
            </button>

            {filtered.length === 0 && (
              <div className="player-dropdown-empty">
                <i className="fas fa-search" />
                <span>No players found</span>
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
                  <span className="player-dropdown-item-name">{p.name}</span>
                  {p.alias && <span className="player-dropdown-item-alias">{p.alias}</span>}
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

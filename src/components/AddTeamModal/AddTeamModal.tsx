import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GlobalParticipant } from '@/models/types';
import { searchParticipants } from '@/services/participants/participantService';
import './AddTeamModal.css';

interface AddTeamModalProps {
  isOpen: boolean;
  teamSize: number;
  excludedNames: string[]; // Names of participants already in other teams
  onConfirm: (teamName: string, memberNames: string[]) => void;
  onCancel: () => void;
}

function AddTeamModal({ isOpen, teamSize, excludedNames = [], onConfirm, onCancel }: AddTeamModalProps) {
  const { t } = useTranslation();
  const [teamName, setTeamName] = useState('');
  const [memberNames, setMemberNames] = useState<string[]>(Array(teamSize).fill(''));
  const [suggestions, setSuggestions] = useState<GlobalParticipant[][]>(
    Array(teamSize).fill([])
  );
  const [showSuggestions, setShowSuggestions] = useState<boolean[]>(
    Array(teamSize).fill(false)
  );
  const [highlightedIdx, setHighlightedIdx] = useState<number[]>(
    Array(teamSize).fill(-1)
  );
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const ignoreNextFocus = useRef<boolean[]>(Array(teamSize).fill(false));

  useEffect(() => {
    if (isOpen) {
      // Reset form when modal opens
      setTeamName('');
      setMemberNames(Array(teamSize).fill(''));
      setSuggestions(Array(teamSize).fill([]));
      setShowSuggestions(Array(teamSize).fill(false));
      setHighlightedIdx(Array(teamSize).fill(-1));
      inputRefs.current = Array(teamSize).fill(null);
    }
  }, [isOpen, teamSize]);

  // Get names already selected in other member inputs
  const getSelectedNames = (currentIndex: number): string[] => {
    return memberNames
      .map((n, i) => (i !== currentIndex ? n.trim().toLowerCase() : ''))
      .filter(Boolean);
  };

  const handleMemberInput = (index: number, value: string) => {
    const newNames = [...memberNames];
    newNames[index] = value;
    setMemberNames(newNames);

    const newHighlighted = [...highlightedIdx];
    newHighlighted[index] = -1;
    setHighlightedIdx(newHighlighted);

    if (value.trim().length >= 1) {
      const selectedNames = getSelectedNames(index);
      const alreadyUsed = new Set([...excludedNames.map(n => n.toLowerCase()), ...selectedNames]);
      
      const results = searchParticipants(value).filter(
        (s) => !alreadyUsed.has(s.name.toLowerCase())
      );
      
      const newSuggestions = [...suggestions];
      newSuggestions[index] = results;
      setSuggestions(newSuggestions);

      const newShow = [...showSuggestions];
      newShow[index] = results.length > 0;
      setShowSuggestions(newShow);
    } else {
      const newSuggestions = [...suggestions];
      newSuggestions[index] = [];
      setSuggestions(newSuggestions);

      const newShow = [...showSuggestions];
      newShow[index] = false;
      setShowSuggestions(newShow);
    }
  };

  const selectSuggestion = (index: number, suggestion: GlobalParticipant) => {
    const newNames = [...memberNames];
    newNames[index] = suggestion.name;
    setMemberNames(newNames);

    const newSuggestions = [...suggestions];
    newSuggestions[index] = [];
    setSuggestions(newSuggestions);

    const newShow = [...showSuggestions];
    newShow[index] = false;
    setShowSuggestions(newShow);

    const newHighlighted = [...highlightedIdx];
    newHighlighted[index] = -1;
    setHighlightedIdx(newHighlighted);

    // Prevent the next onFocus from reopening the dropdown
    const focusIndex = index < teamSize - 1 ? index + 1 : index;
    ignoreNextFocus.current[focusIndex] = true;

    setTimeout(() => {
      inputRefs.current[focusIndex]?.focus();
    }, 0);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions[index] && suggestions[index].length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const newHighlighted = [...highlightedIdx];
        newHighlighted[index] = Math.min(
          newHighlighted[index] + 1,
          suggestions[index].length - 1
        );
        setHighlightedIdx(newHighlighted);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const newHighlighted = [...highlightedIdx];
        newHighlighted[index] = Math.max(newHighlighted[index] - 1, -1);
        setHighlightedIdx(newHighlighted);
        return;
      }
      if (e.key === 'Enter' && highlightedIdx[index] >= 0) {
        e.preventDefault();
        selectSuggestion(index, suggestions[index][highlightedIdx[index]]);
        return;
      }
      if (e.key === 'Escape') {
        const newShow = [...showSuggestions];
        newShow[index] = false;
        setShowSuggestions(newShow);
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (index < teamSize - 1) {
        inputRefs.current[index + 1]?.focus();
      } else {
        handleSubmit();
      }
    }
  };

  const handleSubmit = () => {
    if (!teamName.trim()) {
      alert(t('tournament.addTeamModal.errors.teamNameRequired'));
      return;
    }

    const filledMembers = memberNames.filter((name) => name.trim());
    if (filledMembers.length !== teamSize) {
      alert(t('tournament.addTeamModal.errors.membersRequired', { count: teamSize }));
      return;
    }

    onConfirm(teamName.trim(), memberNames.map((n) => n.trim()));
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content add-team-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('tournament.addTeamModal.title')}</h2>

        <div className="form-group">
          <label>{t('tournament.addTeamModal.teamNameLabel')}</label>
          <input
            type="text"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder={t('tournament.addTeamModal.teamNamePlaceholder')}
            className="w-full"
            autoFocus
          />
        </div>

        <div className="team-members-section">
          <label>{t('tournament.addTeamModal.teamMembersLabel', { count: teamSize })}</label>
          {Array.from({ length: teamSize }).map((_, index) => (
            <div key={index} className="autocomplete-wrapper">
              <div className="autocomplete-input-wrap">
                <input
                  ref={(el) => { inputRefs.current[index] = el; }}
                  type="text"
                  value={memberNames[index] ?? ''}
                  onChange={(e) => handleMemberInput(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onFocus={() => {
                    if (ignoreNextFocus.current[index]) {
                      ignoreNextFocus.current[index] = false;
                      return;
                    }
                    const currentValue = memberNames[index] ?? '';
                    if (currentValue.trim().length >= 1) {
                      handleMemberInput(index, currentValue);
                    }
                  }}
                  placeholder={t('tournament.addTeamModal.playerPlaceholder', { number: index + 1 })}
                  className="w-full"
                  autoComplete="off"
                />
                {showSuggestions[index] && suggestions[index].length > 0 && (
                  <div className="autocomplete-dropdown">
                    {suggestions[index].map((s, idx) => (
                      <div
                        key={s.id}
                        className={`autocomplete-item ${
                          idx === highlightedIdx[index] ? 'highlighted' : ''
                        }`}
                        onMouseDown={() => selectSuggestion(index, s)}
                      >
                        <span className="autocomplete-item-name">{s.name}</span>
                        {s.alias && (
                          <span className="autocomplete-item-alias">{s.alias}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button className="btn-outline" onClick={onCancel}>
            {t('tournament.addTeamModal.cancel')}
          </button>
          <button className="btn-primary" onClick={handleSubmit}>
            {t('tournament.addTeamModal.addButton')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddTeamModal;

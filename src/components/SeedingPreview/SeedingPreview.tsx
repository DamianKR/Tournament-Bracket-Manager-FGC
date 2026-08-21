import { useState, useEffect } from 'react';
import { Participant, SeedingMode, PartialSeedCount } from '@/models/types';
import { applySeed, applyBracketSeeding } from '@/services/seeding/seedingService';
import { updateTournamentParticipants } from '@/services/tournament/tournamentService';
import './SeedingPreview.css';

interface SeedingPreviewProps {
  tournamentId: string;
  participants: Participant[];
  seedingMode: SeedingMode;
  partialSeedCount?: PartialSeedCount;
  onBack: () => void;
  onConfirm: () => void;
  onParticipantsChange: (participants: Participant[]) => void;
}

function SeedingPreview({
  tournamentId,
  participants,
  seedingMode,
  partialSeedCount,
  onBack,
  onConfirm,
  onParticipantsChange,
}: SeedingPreviewProps) {
  const [seededParticipants, setSeededParticipants] = useState<Participant[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  useEffect(() => {
    // Apply seeding on mount
    const seeded = applySeed(participants, seedingMode, partialSeedCount);
    setSeededParticipants(seeded);
  }, [participants, seedingMode, partialSeedCount]);

  const handleReshuffle = () => {
    // Re-apply seeding (re-randomizes unseeded participants in partial mode)
    const seeded = applySeed(participants, seedingMode, partialSeedCount);
    setSeededParticipants(seeded);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const updated = [...seededParticipants];
    const [removed] = updated.splice(draggedIndex, 1);
    updated.splice(index, 0, removed);

    // Reassign seeds
    const reseeded = updated.map((p, i) => ({ ...p, seed: i + 1 }));
    setSeededParticipants(reseeded);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleConfirm = () => {
    // Apply bracket seeding positions (includes nulls for byes)
    const bracketSeededWithByes = applyBracketSeeding(seededParticipants);
    
    // Filter out nulls for tournament participants array
    const bracketSeeded = bracketSeededWithByes.filter((p): p is Participant => p !== null);
    
    // Mark tournament as bracket-seeded so engine knows not to re-sort
    updateTournamentParticipants(tournamentId, bracketSeeded, true);
    onParticipantsChange(bracketSeeded);
    onConfirm();
  };

  const topSeedCount = seedingMode === 'partial' ? partialSeedCount : seededParticipants.length;

  return (
    <div className="seeding-preview">
      <div className="seeding-header">
        <h2>Seeding Preview</h2>
        <p className="text-secondary">
          {seedingMode === 'full' && 'All participants ranked by ELO + win rate'}
          {seedingMode === 'partial' && `Top ${partialSeedCount} seeded, rest randomized`}
        </p>
      </div>

      <div className="seeding-actions card">
        <button className="btn-outline" onClick={handleReshuffle}>
          <i className="fas fa-shuffle" /> Re-shuffle unseeded
        </button>
        <span className="text-secondary">
          Drag to reorder manually
        </span>
      </div>

      <div className="seeding-list card">
        {seededParticipants.map((p, index) => {
          const isTopSeed = index < (topSeedCount ?? 0);
          return (
            <div
              key={p.id}
              className={`seeding-item ${isTopSeed ? 'top-seed' : 'unseeded'} ${draggedIndex === index ? 'dragging' : ''}`}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
            >
              <div className="seeding-rank">
                <span className="seed-number">#{p.seed}</span>
                {isTopSeed && <i className="fas fa-star seed-star" />}
              </div>
              <div className="seeding-name">{p.name}</div>
              {p.alias && <div className="seeding-alias">{p.alias}</div>}
              <div className="seeding-drag-handle">
                <i className="fas fa-grip-vertical" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="form-actions">
        <button className="btn-outline" onClick={onBack}>
          Back
        </button>
        <button className="btn-primary" onClick={handleConfirm}>
          Confirm & Start Tournament
        </button>
      </div>
    </div>
  );
}

export default SeedingPreview;

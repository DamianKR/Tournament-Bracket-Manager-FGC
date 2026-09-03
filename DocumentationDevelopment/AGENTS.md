# Project Documentation for AI Agents

## Project Overview

This is a **Bracket Tournament Manager** - a frontend-only web application for managing double elimination tournaments. Built with React, TypeScript, and Vite.

## Key Commands


# Run this command in PowerShell to allow script execution
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process; 

```bash
# Development
npm run dev          # Start dev server at http://localhost:5173

# Build
npm run build        # Build for production
npm run preview      # Preview production build
```

## Architecture

### Core Principle
**Complete separation of tournament logic from UI**. The tournament engine is fully decoupled and can work independently of React.

### Key Directories

- `src/engine/` - **Pure tournament logic** (no React, no UI)
  - `generator/` - Bracket generation algorithms
  - `progression/` - Match result handling and advancement
  - `seeding/` - Participant seeding logic
  - `utils/` - Mathematical utilities for brackets

- `src/services/` - Business logic layer
  - `storage/` - LocalStorage persistence
  - `tournament/` - High-level tournament operations

- `src/models/` - TypeScript type definitions
- `src/pages/` - Main page components
- `src/components/` - Reusable UI components

## How It Works

### 1. Bracket Generation
When a tournament starts:
1. Calculate bracket size (next power of 2)
2. Calculate byes needed
3. Apply standard seeding pattern
4. Generate all winner bracket matches
5. Generate all loser bracket matches
6. Link matches together (nextWinnerMatchId, nextLoserMatchId)
7. Create grand final structure

### 2. Match Progression
When a match result is recorded:
1. Update match with winner/loser
2. Increment loser's loss count
3. Check if loser is eliminated (2 losses)
4. Advance winner to nextWinnerMatchId
5. Advance loser to nextLoserMatchId (if not eliminated)
6. Auto-save to localStorage

### 3. Grand Final Logic
- Winner bracket champion vs Loser bracket champion
- If loser bracket winner wins → create bracket reset match
- If winner bracket champion wins → tournament complete

## Data Models

### Tournament
```typescript
{
  id, name, mode, status,
  participants: Participant[],
  bracket: Bracket,
  championId, createdAt, updatedAt
}
```

### Participant
```typescript
{
  id, name, seed,
  eliminated, lossCount, finalPosition
}
```

### Match
```typescript
{
  id, roundNumber, matchNumber, bracketType,
  participant1Id, participant2Id,
  winnerId, loserId, status,
  nextWinnerMatchId, nextLoserMatchId
}
```

## Important Implementation Details

### Bracket Math
- Uses `nextPowerOfTwo()` to determine bracket size
- Byes = bracketSize - participantCount
- Winner rounds = log2(bracketSize)
- Loser rounds = 2 × (winner rounds - 1)

### Match Linking
- Winner bracket: Each match links to next round match
- Loser bracket: Complex alternating structure
  - Odd rounds receive new losers from winner bracket
  - Even rounds are winners from previous loser round
- Grand final: Both brackets converge

### Drop Mapping Algorithm (rematch prevention)
The key to avoiding early rematches is the **drop mapping** in `linkWinnerToLoserBracketCorrect()` (`bracketGenerator.ts`).

**WR1 → LR1**: Adjacent WR1 pairs share one LR1 match.
- Odd-numbered WR1 match → slot 1 of its LR1 match
- Even-numbered WR1 match → slot 2 of its LR1 match
This ensures the two participants who will meet in WR2 are in different slots of LR1 (so whoever survives LR1 has never faced the incoming WR2 loser in their own LR1 match).

**WR2 → LR2**: Positions are **reversed** (top WR2 losers drop to bottom LR2, bottom WR2 losers drop to top LR2). This is the critical anti-rematch step — it guarantees the WR2 loser lands in the LR2 match whose LR1 survivor came from the *opposite* WR1 quadrant, making an early rematch impossible.

**WR3+ → LR(2n-2)**: Direct (non-reversed) mapping. The WR2 reversal already established cross-bracket separation; further reversals would undo it.

This matches the standard used by Challonge / smash.gg. Reference: `wireLoserRouting.ts` in github.com/nadersafa1/double-elimination.

**Slot assignment in progression** (`matchProgression.ts`):
- WR1 losers: slot determined by match parity (odd matchNumber → slot 1, even → slot 2)
- WR2+ losers: always slot 2 (the "drop-in" slot)
- LB winners advancing: always slot 1

### Persistence
- Everything saved to localStorage automatically
- Key: `bracket_tournaments`
- Saves on every change (participant add/remove, match result, etc.)
- No backend needed

## Testing Checklist

When testing or modifying:
- [ ] Test with 4, 8, 16 participants (power of 2)
- [ ] Test with 6, 10, 14 participants (non-power of 2, needs byes)
- [ ] Test with 19, 43 participants (odd numbers)
- [ ] Verify byes auto-advance correctly
- [ ] Test grand final reset scenario
- [ ] Test match result reversal (undo)
- [ ] Verify localStorage persistence (close/reopen browser)
- [ ] Test participant name editing during tournament
- [ ] Verify elimination after 2 losses

## Common Issues & Solutions

### Issue: Matches not advancing
- Check `nextWinnerMatchId` and `nextLoserMatchId` are set correctly
- Verify `advanceParticipant()` logic in `matchProgression.ts`

### Issue: Byes not working
- Check auto-advance logic in `generateWinnerBracket()`
- Matches with null participant should auto-complete

### Issue: Loser bracket structure wrong
- Review `linkWinnerToLoserBracket()` function
- Loser bracket has complex alternating feed structure

### Issue: Grand final reset not triggering
- Check `checkTournamentCompletion()` in `matchProgression.ts`
- Reset only triggers if loser bracket champion wins first final

## File Naming Conventions

- Components: PascalCase (e.g., `BracketView.tsx`)
- Services/Utils: camelCase (e.g., `tournamentService.ts`)
- Types: `types.ts`
- Constants: `UPPER_SNAKE_CASE` in files

## UI/UX Notes

- Click participant name to select as winner
- Double-click participant in list to edit name
- Sidebar shows current view and participant count
- Status badges: Setup (blue), In Progress (yellow), Completed (green)
- Winner bracket = blue, Loser bracket = red, Grand final = gold

## Performance Considerations

- Bracket generation is O(n) where n = participant count
- Match progression is O(1) - direct ID lookups
- localStorage has ~5-10MB limit (sufficient for hundreds of tournaments)
- No optimization needed for <256 participants

## Future Enhancement Ideas

- Single elimination mode (simpler than double)
- Export bracket as image/PDF
- Match timestamps and history
- Undo/redo stack for multiple changes
- Drag-and-drop participant reordering
- Custom seeding (manual seed assignment)
- Swiss system tournaments
- Round-robin tournaments

---

Last updated: 2026-08-09

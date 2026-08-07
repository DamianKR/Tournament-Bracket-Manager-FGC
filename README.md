# Bracket Tournament Manager

A frontend-only double elimination tournament bracket manager built with React and TypeScript. Manage tournaments with automatic bracket generation, match progression, and local persistence.

## Features

- ✅ **Double Elimination Brackets**: Full support for winner bracket, loser bracket, and grand finals
- ✅ **Automatic Bracket Generation**: Handles any number of participants with automatic bye calculation
- ✅ **Local Persistence**: All tournament data saved to browser localStorage
- ✅ **Match Progression**: Automatic advancement of winners and losers through brackets
- ✅ **Grand Final Reset**: Supports bracket reset if loser bracket winner wins first grand final
- ✅ **Participant Management**: Add, edit, remove, and randomize participants
- ✅ **Tournament Dashboard**: View and manage multiple tournaments
- ✅ **Real-time Updates**: Instant bracket updates as matches are completed

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Application

Start the development server:
```bash
npm run dev
```

The application will open at `http://localhost:5173`

### Building for Production

Build the application:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

## Usage

### Creating a Tournament

1. Click "New Tournament" on the dashboard
2. Enter a tournament name
3. Select "Double Elimination" mode
4. Click "Create Tournament"

### Adding Participants

1. Enter participant names one at a time
2. Click "Add Participant" or press Enter
3. Add at least 4 participants (minimum required)
4. Optionally randomize the order

### Starting the Tournament

1. Once you have enough participants, click "Start Tournament"
2. The bracket will be automatically generated
3. View the winner bracket, loser bracket, and grand final structure

### Recording Match Results

1. Navigate to the Bracket view
2. Click on a participant's name in any match to declare them the winner
3. The bracket automatically updates:
   - Winner advances to next winner bracket match
   - Loser drops to appropriate loser bracket match
   - Players eliminated after second loss

### Grand Finals

- Winner bracket champion vs Loser bracket champion
- If loser bracket champion wins, a bracket reset occurs
- Second match determines the final champion

## Project Structure

```
src/
├── pages/              # Main page components
│   ├── Dashboard/      # Tournament list and management
│   ├── CreateTournament/  # Tournament creation flow
│   └── Tournament/     # Tournament view and bracket display
├── components/         # Reusable UI components
│   ├── Bracket/        # Bracket visualization
│   ├── Match/          # Match card component
│   ├── Participants/   # Participant list
│   ├── Sidebar/        # Navigation sidebar
│   └── UI/             # Common UI elements
├── engine/             # Tournament logic (decoupled from UI)
│   ├── generator/      # Bracket generation algorithms
│   ├── progression/    # Match progression logic
│   ├── seeding/        # Participant seeding
│   ├── validation/     # Input validation
│   └── utils/          # Bracket math utilities
├── models/             # TypeScript type definitions
├── services/           # Business logic services
│   ├── storage/        # LocalStorage persistence
│   └── tournament/     # Tournament management
├── constants/          # Application constants
└── utils/              # Utility functions
```

## Technical Details

### Bracket Generation

- Calculates next power of 2 for bracket size
- Automatically assigns byes when needed
- Uses standard tournament seeding (1 vs last, 2 vs second-to-last, etc.)
- Generates complete match structure for winner and loser brackets

### Match Progression

- Tracks participant loss count (0, 1, or 2 losses)
- Automatically advances winners through winner bracket
- Drops losers to appropriate loser bracket positions
- Eliminates participants after second loss
- Supports match result reversal (if subsequent matches not played)

### Data Persistence

- All data stored in browser localStorage
- Automatic save on every change
- Tournaments persist across browser sessions
- No backend or database required

## Supported Participant Counts

The system supports any number of participants from 4 to 256+:
- 4-8 participants: 3-4 rounds
- 9-16 participants: 4-5 rounds
- 17-32 participants: 5-6 rounds
- 33-64 participants: 6-7 rounds
- And so on...

## Browser Compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari
- Any modern browser with localStorage support

## Future Enhancements

- Single elimination mode
- Swiss system tournaments
- Export/import tournament data
- Print bracket functionality
- Match scheduling and timestamps
- Participant statistics and history
- Custom seeding options
- Mobile app version

## License

ISC

## Contributing

This is a personal project, but suggestions and improvements are welcome!

---

Built with ❤️ using React, TypeScript, and Vite

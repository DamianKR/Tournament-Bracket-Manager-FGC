# 📐 Estructura del Loser Bracket en Doble Eliminación

## Concepto Fundamental

El Loser Bracket en doble eliminación tiene una **estructura alternada** que es crítica para el funcionamiento correcto del torneo.

---

## Estructura Alternada

### Rondas Impares (1, 3, 5, 7...)
- **Reciben perdedores del Winner Bracket**
- Los perdedores se enfrentan a ganadores de la ronda anterior del Loser
- Resultado: La mitad de participantes avanzan

### Rondas Pares (2, 4, 6, 8...)
- **NO reciben perdedores nuevos**
- Solo juegan los ganadores de la ronda anterior del Loser
- Resultado: La mitad de participantes avanzan

---

## Ejemplo: 8 Participantes

### Winner Bracket
```
Round 1: 4 matches → 4 ganadores, 4 perdedores
Round 2: 2 matches → 2 ganadores, 2 perdedores
Round 3: 1 match → 1 ganador, 1 perdedor
```

### Loser Bracket

#### Round 1 (Impar - Recibe perdedores)
```
Fuente: 4 perdedores de Winner R1
Matches: 2 (4 perdedores / 2)
Resultado: 2 ganadores
```

#### Round 2 (Par - Solo ganadores previos)
```
Fuente: 2 ganadores de Loser R1 + 2 perdedores de Winner R2
Matches: 2
Distribución:
  - Match 1: Ganador Loser R1 Match 1 vs Perdedor Winner R2 Match 1
  - Match 2: Ganador Loser R1 Match 2 vs Perdedor Winner R2 Match 2
Resultado: 2 ganadores
```

#### Round 3 (Impar - Solo ganadores previos)
```
Fuente: 2 ganadores de Loser R2
Matches: 1 (2 ganadores / 2)
Resultado: 1 ganador
```

#### Round 4 (Par - Recibe perdedor)
```
Fuente: 1 ganador de Loser R3 + 1 perdedor de Winner R3
Matches: 1
Resultado: 1 ganador (va a Grand Final)
```

---

## Fórmula de Vinculación

### Winner → Loser

**Winner Round 1** → **Loser Round 1**
```
Cada 2 matches del Winner R1 alimentan 1 match del Loser R1
Winner R1 Match 1 y 2 → Loser R1 Match 1
Winner R1 Match 3 y 4 → Loser R1 Match 2
```

**Winner Round n (n ≥ 2)** → **Loser Round 2(n-1)**
```
Winner R2 → Loser R2
Winner R3 → Loser R4
Winner R4 → Loser R6
...
```

### Loser → Loser

**Rondas Impares** (1, 3, 5...):
```
Cada 2 ganadores → 1 match en siguiente ronda
Loser R1 Match 1 y 2 → Loser R2 Match 1 y 2 (con perdedores de Winner)
```

**Rondas Pares** (2, 4, 6...):
```
Cada ganador → 1 posición en siguiente ronda
Loser R2 Match 1 → Loser R3 Match 1 (posición 1)
Loser R2 Match 2 → Loser R3 Match 1 (posición 2)
```

---

## Número de Matches por Ronda

Para un bracket de tamaño `2^n`:

### Loser Round 1
```
Matches = 2^(n-2)
Ejemplo: 8 participantes (n=3) → 2^1 = 2 matches
```

### Loser Round 2k (pares)
```
Matches = 2^(n-k-1)
Ejemplo R2: 2^(3-1-1) = 2 matches
```

### Loser Round 2k+1 (impares, k ≥ 1)
```
Matches = 2^(n-k-2)
Ejemplo R3: 2^(3-2-1) = 1 match
```

---

## Tabla Completa: 8 Participantes

| Ronda | Tipo | Recibe de | Matches | Participantes | Ganadores |
|-------|------|-----------|---------|---------------|-----------|
| L R1  | Impar | Winner R1 | 2 | 4 | 2 |
| L R2  | Par | Winner R2 + L R1 | 2 | 4 (2+2) | 2 |
| L R3  | Impar | L R2 | 1 | 2 | 1 |
| L R4  | Par | Winner R3 + L R3 | 1 | 2 (1+1) | 1 |

---

## Tabla Completa: 16 Participantes

| Ronda | Tipo | Recibe de | Matches | Participantes | Ganadores |
|-------|------|-----------|---------|---------------|-----------|
| L R1  | Impar | Winner R1 | 4 | 8 | 4 |
| L R2  | Par | Winner R2 + L R1 | 4 | 8 (4+4) | 4 |
| L R3  | Impar | L R2 | 2 | 4 | 2 |
| L R4  | Par | Winner R3 + L R3 | 2 | 4 (2+2) | 2 |
| L R5  | Impar | L R4 | 1 | 2 | 1 |
| L R6  | Par | Winner R4 + L R5 | 1 | 2 (1+1) | 1 |

---

## Reglas Importantes

### 1. No Repetir Enfrentamientos
Un participante **NO debe enfrentarse dos veces al mismo oponente** hasta la Grand Final.

**Ejemplo incorrecto:**
```
Winner R1: A vs B → A gana
Loser R2: B vs A → ❌ Ya se enfrentaron
```

**Ejemplo correcto:**
```
Winner R1 M1: A vs B → A gana, B pierde
Winner R1 M2: C vs D → C gana, D pierde
Loser R1: B vs D → Ganador enfrenta a otros
```

### 2. Cruce Correcto
Los perdedores del Winner deben **cruzarse** con ganadores del Loser para evitar rematches.

**Patrón correcto para Loser R2:**
```
Winner R2 Match 1: A vs C → A gana, C pierde
Winner R2 Match 2: E vs G → E gana, G pierde

Loser R1 Match 1: B vs D → B gana
Loser R1 Match 2: F vs H → F gana

Loser R2:
  Match 1: B (ganador L R1 M1) vs G (perdedor W R2 M2) ✅ Cruzado
  Match 2: F (ganador L R1 M2) vs C (perdedor W R2 M1) ✅ Cruzado
```

### 3. Posicionamiento
- **Perdedores de Winner**: Entran en posiciones específicas del Loser
- **Ganadores de Loser**: Avanzan a la siguiente ronda
- **Orden importa**: El cruce debe ser consistente

---

## Implementación en Código

### Generación de Matches
```typescript
function generateLoserBracket(participantCount, winnerBracket) {
  const loserRounds = calculateLoserRounds(participantCount);
  
  for (let round = 1; round <= loserRounds; round++) {
    const matchesInRound = calculateLoserRoundMatches(round, participantCount);
    // Crear matches...
  }
}
```

### Vinculación Winner → Loser
```typescript
function linkWinnerToLoserBracket(winnerMatches, loserMatches) {
  // Winner R1 → Loser R1
  // Winner Rn → Loser R(2n-2) para n ≥ 2
  
  for (let winnerRound = 2; winnerRound <= maxRounds; winnerRound++) {
    const loserRoundNumber = (winnerRound - 1) * 2;
    // Vincular matches...
  }
}
```

### Vinculación Loser → Loser
```typescript
function linkLoserBracketMatches(matches, totalRounds) {
  for (let round = 1; round < totalRounds; round++) {
    if (round % 2 === 1) {
      // Ronda impar: 2 ganadores → 1 match
      // Patrón: floor(index / 2)
    } else {
      // Ronda par: 1 ganador → 1 posición específica
      // Patrón: mismo índice
    }
  }
}
```

---

## Casos de Prueba

### Verificar Estructura Correcta

1. **8 participantes**
   - Loser R1: 2 matches (4 perdedores de Winner R1)
   - Loser R2: 2 matches (2 ganadores L R1 + 2 perdedores Winner R2)
   - Loser R3: 1 match (2 ganadores L R2)
   - Loser R4: 1 match (1 ganador L R3 + 1 perdedor Winner R3)

2. **16 participantes**
   - Loser R1: 4 matches
   - Loser R2: 4 matches
   - Loser R3: 2 matches
   - Loser R4: 2 matches
   - Loser R5: 1 match
   - Loser R6: 1 match

### Verificar No Rematches

- Simular torneo completo
- Rastrear todos los enfrentamientos
- Verificar que ningún par se repita antes de Grand Final

---

## Errores Comunes

### ❌ Error 1: Fórmula Incorrecta
```typescript
// INCORRECTO
const loserRound = winnerRound * 2; // Demasiado alto

// CORRECTO
const loserRound = (winnerRound - 1) * 2;
```

### ❌ Error 2: No Cruzar
```typescript
// INCORRECTO: Mismo índice
winnerMatches[i] → loserMatches[i]

// CORRECTO: Cruzar para evitar rematches
// Depende de la estructura específica
```

### ❌ Error 3: Ignorar Paridad
```typescript
// INCORRECTO: Mismo patrón para todas las rondas
nextMatchIndex = floor(index / 2)

// CORRECTO: Patrón diferente según paridad
if (round % 2 === 1) {
  nextMatchIndex = floor(index / 2)
} else {
  nextMatchIndex = index
}
```

---

## Referencias

- [Challonge Double Elimination](https://challonge.com/tournament/bracket_generator)
- [Wikipedia: Double-elimination tournament](https://en.wikipedia.org/wiki/Double-elimination_tournament)
- Libro: "Tournament Design" - McGarry & Schutz

---

**Última actualización:** 2026-08-07  
**Versión:** 1.0.3

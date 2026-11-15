# Changelog

## [Unreleased] - 2026-11-14

### 🐛 Generador de brackets: matches marcados como terminados antes de tiempo

- Al generar el bracket, un match que dependía de BYEs podía quedar marcado como "fantasma" (completado sin nadie) aunque todavía iba a recibir jugadores, porque el generador miraba si sus feeders estaban terminados antes de mover a sus ganadores. Afectaba a tamaños con BYEs en cadena (9, 17-19, 33-39 jugadores)
- Si se jugaba una ronda posterior de una mitad del bracket antes de terminar la ronda anterior de la otra, el torneo podía declarar campeón antes de tiempo o atascarse. Jugando ronda por ronda se corregía solo, por eso pasaba desapercibido
- Un feeder ahora solo cuenta como resuelto cuando su ganador ya está en el match siguiente (`feederSettled` en ambos generadores). Los torneos ya creados no cambian; solo los nuevos
- Verificado: con los mismos resultados, el bracket nuevo termina en un estado idéntico al anterior en todos los tamaños jugados ronda por ronda; los únicos cambios en la generación son esos matches fantasma erróneos

### ✨ DQ (descalificación) en torneos

- En un match listo del bracket (ambos jugadores presentes) el admin puede descalificar a uno de los dos: botón "DQ" en el modal del match, con confirmación en dos pasos
- El rival avanza **sin marcador** y el jugador queda fuera del torneo (no cae al Loser Bracket ni suma derrota). Su posición final es la de su ronda y recibe los puntos de ELO de torneo de esa posición
- Un DQ **no es una partida jugada**: no crea registro de partida, así que no afecta historial, H2H ni estadísticas; la tarjeta muestra una etiqueta DQ y el detalle un aviso
- Se puede deshacer con el mismo botón que un resultado, mientras los matches siguientes no se hayan jugado. DQ en la gran final decide el título sin bracket reset
- Si los DQs vacían una rama del Loser Bracket, el bracket se resuelve solo (BYEs / gran final con un solo finalista)
- Estadísticas del perfil: las victorias/derrotas del bracket ahora cuentan solo partidas jugadas (sin DQ y sin BYEs), igual que ya hacía el servidor con los registros de partida
- Validado con simulación de torneos de 2 a 64 jugadores (sencilla y doble eliminación) con miles de DQs aleatorios, y exhaustivamente para 3-5 jugadores

### ✨ Paginación en todo el sitio

- Un solo sistema (componente `Pagination`, hook `usePaginatedList`, lenguaje de consulta compartido servidor/navegador). Ver [PAGINATION.md](PAGINATION.md)
- Niveles 25 / 50 / 75 / 100 (por defecto 25; 50 en ranking y participantes). Se oculta con 25 elementos o menos, también tras filtrar o buscar
- Servidor + copia local (funciona offline): historial del ranking, Events → History, Matches del perfil, leaderboard, Ligas
- Servidor sin copia local: Usuarios (superadmin)
- Local: Participantes, Torneos, Retos ranked, Resultados del perfil y H2H
- Filtros y búsqueda se ejecutan en la base de datos (Postgres/JSONB en Supabase) y, sin conexión, con la misma lógica sobre la copia local
- Nuevos endpoints: `GET /api/history`, `GET /api/history/counts`; `?page=` opt-in en `/api/ranking`, `/api/ranking/matches`, `/api/leagues` y `/api/auth/users` (sin `?page=` responden como antes)

### 🐛 Bug Fixes

- Events → History marcaba siempre al jugador 1 como ganador en partidas de torneo
- Los contadores de los filtros del historial ahora salen del servidor (antes contaban solo lo cargado)
- Aviso offline y banda de datos parciales con los colores del tema; mejor diseño en móvil

### 🔧 Cambios Técnicos

- `npm test` (Node `--test`): motor de consulta, helper de rutas, ámbito de comunidad e historial unificado
- Ligas: orden "más nueva primero". Leaderboard: los jugadores sin puntos van al final en orden alfabético
- Eliminadas las copias locales antiguas `bracket_history_cache` y `bracket_all_league_matches_cache` (se purgan al arrancar) y la página sin uso `LeaguesPage`

---

## [1.0.4] - 2026-08-07

### 🐛 Bug Fixes

- **CRÍTICO**: Corregido procesamiento de "Ghost Matches" (TBD vs TBD)
  - Matches con ambos slots vacíos ahora se completan automáticamente
  - Ocurría en torneos con muchos BYEs (ej: 9 participantes → 7 BYEs)
  - Sistema ahora detecta cuando ambos participantes nunca llegarán
  - Previene bloqueo en cascada de rondas posteriores

### 🔧 Cambios Técnicos

- Modificada `checkAndProcessImplicitBye()` para manejar doble BYE
- Agregado procesamiento iterativo de ghost matches en `processByeMatches()`
- Sistema ahora completa matches vacíos que bloquean progresión

### 📊 Impacto

- Resuelve torneos con números pequeños de participantes (3-9)
- Especialmente crítico para 9 participantes (7 BYEs)
- Permite progresión correcta del Loser Bracket con múltiples BYEs

---

## [1.0.3] - 2026-08-07

### 🐛 Bug Fixes - CRÍTICO

- **CRÍTICO**: Corregida estructura del Loser Bracket
  - **Problema 1**: Perdedores del Winner Bracket no bajaban correctamente al Loser Bracket
  - **Problema 2**: Vinculación incorrecta entre rondas del Loser Bracket
  - **Problema 3**: Fórmula de asignación `(round - 1) * 2` era incorrecta
  - Ahora respeta la estructura alternada correcta (rondas impares/pares)
  - Ver `LOSER_BRACKET_STRUCTURE.md` para detalles de la estructura correcta

### 🔧 Cambios Técnicos

- Reescrita función `linkWinnerToLoserBracket()` con fórmula correcta
- Reescrita función `linkLoserBracketMatches()` con lógica de paridad
- Agregada documentación completa de estructura en `LOSER_BRACKET_STRUCTURE.md`
- Implementado cruce correcto para evitar rematches prematuros

### 📊 Impacto

- **CRÍTICO**: Afectaba a TODOS los torneos de doble eliminación
- Resuelve asignaciones incorrectas en Loser Bracket
- Previene rematches antes de Grand Final
- Estructura ahora coincide con estándar de Challonge

---

## [1.0.2] - 2026-08-07

### 🐛 Bug Fixes

- **CRÍTICO**: Corregido bug de BYEs implícitos en Loser Bracket
  - Matches con un solo participante (oponente nunca llegará) ahora se completan automáticamente
  - Ocurría cuando un participante bajaba al Loser Bracket y su oponente era un slot vacío permanente
  - Sistema ahora detecta cuando un slot nunca se llenará y auto-avanza al participante presente
  - Ver `BUGFIX_IMPLICIT_BYES.md` para detalles técnicos

### 🔧 Cambios Técnicos

- Agregada función `checkAndProcessImplicitBye()` en `matchProgression.ts`
- Agregada función `checkIfMatchCanReceiveParticipants()` para validar si un match puede recibir más participantes
- Modificada función `advanceParticipant()` para detectar y procesar BYEs implícitos
- Detección inteligente de slots vacíos que nunca se llenarán

### 📊 Impacto

- Resuelve matches bloqueados en Loser Bracket con torneos de cualquier tamaño
- Especialmente importante para torneos con 6, 10, 14, 18, etc. participantes
- No afecta torneos con potencias de 2 (4, 8, 16, 32, etc.)

---

## [1.0.1] - 2026-08-07

### 🐛 Bug Fixes

- **CRÍTICO**: Corregido bug donde participantes con BYE no avanzaban automáticamente al siguiente match
  - Los matches con BYE ahora avanzan correctamente al ganador
  - Afectaba a todos los torneos con número de participantes no potencia de 2
  - Ver `BUGFIX_BYES.md` para detalles técnicos

### 🔧 Cambios Técnicos

- Agregada función `processByeMatches()` en `bracketGenerator.ts`
- Procesamiento automático de BYEs después de vincular matches
- Aplicado tanto a winner bracket como loser bracket

---

## [1.0.0] - 2026-08-07

### ✨ Características Iniciales

- ✅ Sistema completo de doble eliminación
- ✅ Generación automática de brackets
- ✅ Soporte para cualquier número de participantes (4-256+)
- ✅ Cálculo automático de byes
- ✅ Avance automático de ganadores/perdedores
- ✅ Grand Final con bracket reset
- ✅ Persistencia en localStorage
- ✅ Dashboard de torneos
- ✅ Gestión de participantes (agregar, editar, eliminar, randomizar)
- ✅ Visualización interactiva de brackets
- ✅ Interfaz responsive

### 🔧 Configuración Técnica

- React 19.2.8
- TypeScript 6.0.3
- Vite 8.2.1
- React Router 7.18.2

### 📝 Correcciones

- Eliminado `baseUrl` deprecado de tsconfig.json (deprecado en TS 7.0)
- Actualizado path aliases para usar `fileURLToPath` con `import.meta.url`
- Configuración moderna de Vite sin advertencias

### 📦 Build

- Tamaño optimizado: 266 KB total
- Compresión gzip: 79.28 KB para JS
- Tiempo de build: ~120ms

### 📚 Documentación

- README.md (inglés)
- LEEME.md (español)
- INSTRUCCIONES_USO_LOCAL.md (guía detallada en español)
- AGENTS.md (documentación técnica para desarrolladores)
- Script batch para abrir la aplicación con un click

---

## Notas de Migración

### TypeScript Path Aliases

Si estás actualizando desde una versión anterior:

**Antes (deprecado):**
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

**Ahora (moderno):**
```typescript
// vite.config.ts
import { fileURLToPath } from 'url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
```

Los imports siguen funcionando igual:
```typescript
import { Tournament } from '@/models/types'
```

---

## Roadmap Futuro

### Versión 1.1 (Planeada)
- [ ] Single elimination mode
- [ ] Exportar bracket como imagen
- [ ] Timestamps en matches
- [ ] Historial de cambios (undo/redo)

### Versión 1.2 (Ideas)
- [ ] Swiss system
- [ ] Round-robin
- [ ] Estadísticas de participantes
- [ ] Temas de color personalizables

---

## Soporte

Para reportar bugs o sugerir mejoras, contacta al desarrollador.

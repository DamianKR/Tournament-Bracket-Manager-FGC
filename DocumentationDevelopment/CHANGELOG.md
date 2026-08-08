# Changelog

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

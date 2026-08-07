# Changelog

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

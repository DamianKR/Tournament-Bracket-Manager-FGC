# 🎯 Instrucciones para Usar la Aplicación Localmente

## ✅ ¿Qué es esto?

Esta es una aplicación **100% local** que funciona directamente en tu navegador sin necesidad de internet ni servidor. Todos los datos se guardan en tu navegador (localStorage).

## 🚀 Opción 1: Usar el Build de Producción (RECOMENDADO - Más Ligero)

### Paso 1: Ya está construido
El build ya está listo en la carpeta `dist/`

### Paso 2: Abrir la aplicación
Simplemente abre el archivo:
```
dist/index.html
```

**Formas de abrirlo:**
1. **Doble clic** en `dist/index.html`
2. **Click derecho** → "Abrir con" → Tu navegador favorito (Chrome, Edge, Firefox)
3. **Arrastrar** el archivo a una ventana del navegador

### Ventajas de esta opción:
- ✅ **Súper ligero**: Solo ~266 KB total
- ✅ **Sin servidor**: No consume recursos del sistema
- ✅ **Instantáneo**: Abre inmediatamente
- ✅ **Portable**: Puedes copiar la carpeta `dist/` a cualquier lugar

### ⚠️ Importante:
Si mueves la carpeta `dist/`, asegúrate de mover **toda la carpeta**, no solo el `index.html`, porque necesita la subcarpeta `assets/`.

---

## 🔧 Opción 2: Modo Desarrollo (Para hacer cambios)

Si quieres modificar el código:

```bash
npm run dev
```

Esto abre un servidor en `http://localhost:5173`

**Consume más recursos** porque está compilando en tiempo real.

---

## 📦 Cómo Crear un Nuevo Build

Si haces cambios al código y quieres un nuevo build optimizado:

```bash
npm run build
```

Esto regenera la carpeta `dist/` con la versión optimizada.

---

## 💾 ¿Dónde se Guardan los Datos?

Los torneos se guardan en el **localStorage del navegador**:
- **Chrome/Edge**: `C:\Users\[TuUsuario]\AppData\Local\[Navegador]\User Data\Default\Local Storage`
- **Firefox**: `C:\Users\[TuUsuario]\AppData\Roaming\Mozilla\Firefox\Profiles\[perfil]\storage\default`

### Importante:
- Los datos **NO se sincronizan** entre navegadores
- Si abres en Chrome y luego en Firefox, verás torneos diferentes
- Si borras el caché del navegador, **perderás los torneos**

---

## 📤 Exportar/Respaldar Torneos

Para hacer un respaldo manual:

1. Abre las **Herramientas de Desarrollador** (F12)
2. Ve a la pestaña **Console**
3. Escribe:
   ```javascript
   console.log(localStorage.getItem('bracket_tournaments'))
   ```
4. Copia el resultado y guárdalo en un archivo `.txt`

Para restaurar:
1. Abre las Herramientas de Desarrollador (F12)
2. Ve a la pestaña Console
3. Escribe:
   ```javascript
   localStorage.setItem('bracket_tournaments', 'PEGA_AQUI_TU_RESPALDO')
   ```

---

## 🎮 Uso Básico

1. **Crear Torneo**: Click en "New Tournament"
2. **Agregar Participantes**: Mínimo 4 jugadores
3. **Iniciar**: Click en "Start Tournament"
4. **Declarar Ganadores**: Click en el nombre del ganador en cada partido
5. **Ver Progreso**: El bracket se actualiza automáticamente

---

## 📊 Consumo de Recursos

### Build de Producción (`dist/index.html`):
- **Tamaño en disco**: ~266 KB
- **RAM al abrir**: ~50-100 MB (normal para cualquier página web)
- **CPU**: Casi nada (solo al abrir)
- **Internet**: ❌ No necesita

### Modo Desarrollo (`npm run dev`):
- **RAM**: ~200-300 MB (servidor Node.js)
- **CPU**: 1-5% constante
- **Internet**: ❌ No necesita

---

## 🔥 Consejos para Mínimo Consumo

1. **Usa el build de producción** (`dist/index.html`)
2. **Cierra otras pestañas** del navegador
3. **Usa Edge o Chrome** (más optimizados que Firefox)
4. **No uses modo desarrollo** a menos que estés programando

---

## 🐛 Solución de Problemas

### La página está en blanco
- Asegúrate de abrir `dist/index.html`, no `index.html` de la raíz
- Verifica que la carpeta `dist/assets/` exista

### Los datos no se guardan
- Verifica que el navegador permita localStorage
- No uses modo incógnito (no guarda datos)

### Quiero empezar de cero
Abre la consola (F12) y escribe:
```javascript
localStorage.clear()
```

---

## 📁 Estructura de Archivos

```
Bracket Project/
├── dist/                    ← ESTA ES LA CARPETA QUE NECESITAS
│   ├── index.html          ← ABRE ESTE ARCHIVO
│   └── assets/             ← No tocar, necesario
│       ├── index-[hash].css
│       └── index-[hash].js
├── src/                     ← Código fuente (no necesario para usar)
├── node_modules/            ← Dependencias (no necesario para usar)
└── package.json
```

---

## 🎯 Resumen Rápido

**Para usar la app:**
1. Abre `dist/index.html` en tu navegador
2. ¡Listo! Ya puedes crear torneos

**Para actualizar después de cambios:**
1. `npm run build`
2. Abre `dist/index.html`

**Consumo:** Casi nada, es como abrir cualquier página web estática.

---

## 💡 Tip Pro

Puedes crear un **acceso directo** en tu escritorio que apunte a:
```
D:\Damiam\Gaming\Bracket Project\dist\index.html
```

Así lo abres con un solo click como si fuera una aplicación de escritorio.

---

¿Necesitas ayuda? Revisa el archivo `README.md` para más detalles técnicos.

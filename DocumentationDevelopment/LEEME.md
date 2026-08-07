# 🏆 Gestor de Torneos con Brackets

Aplicación web para gestionar torneos de doble eliminación. **100% local, sin necesidad de internet ni servidor.**

## 🚀 Inicio Rápido

### Opción 1: Usar Directamente (Recomendado)

1. **Doble click** en `Abrir_Aplicacion.bat`
   
   O manualmente:
   
2. Abre el archivo `dist/index.html` en tu navegador

¡Listo! Ya puedes crear torneos.

### Opción 2: Modo Desarrollo

```bash
npm run dev
```

Abre `http://localhost:5173` en tu navegador.

---

## ✨ Características

- ✅ **Doble Eliminación Completa**: Winner bracket, loser bracket y gran final
- ✅ **Generación Automática**: Soporta cualquier número de participantes
- ✅ **Guardado Automático**: Todo se guarda en tu navegador
- ✅ **Sin Internet**: Funciona 100% offline
- ✅ **Ligero**: Solo 266 KB
- ✅ **Bracket Reset**: Si el ganador del loser bracket gana la primera final

---

## 📖 Cómo Usar

### 1. Crear un Torneo
- Click en "New Tournament"
- Ingresa un nombre
- Selecciona "Double Elimination"

### 2. Agregar Participantes
- Agrega mínimo 4 participantes
- Puedes editar nombres en cualquier momento
- Usa "Randomize Order" para orden aleatorio

### 3. Iniciar Torneo
- Click en "Start Tournament"
- El bracket se genera automáticamente

### 4. Registrar Resultados
- Click en el nombre del ganador en cada partido
- El bracket se actualiza automáticamente
- El ganador avanza, el perdedor baja al loser bracket

### 5. Gran Final
- Ganador del winner bracket vs ganador del loser bracket
- Si gana el del loser bracket → se juega una segunda final (bracket reset)
- Si gana el del winner bracket → es el campeón

---

## 🎯 Números de Participantes Soportados

Funciona con **cualquier número** de participantes desde 4 hasta 256+:

- 4-8 participantes → 3-4 rondas
- 9-16 participantes → 4-5 rondas  
- 17-32 participantes → 5-6 rondas
- 33-64 participantes → 6-7 rondas

Si el número no es potencia de 2, se asignan **byes automáticos**.

**Ejemplo con 10 participantes:**
- Bracket de 16 posiciones
- 6 participantes reciben bye (pasan automáticamente)
- 4 partidos en primera ronda

---

## 💾 Almacenamiento de Datos

Los torneos se guardan en el **localStorage** de tu navegador:

- ✅ Persisten al cerrar el navegador
- ✅ No necesitan internet
- ⚠️ Se borran si limpias el caché del navegador
- ⚠️ No se sincronizan entre navegadores diferentes

### Hacer Respaldo

1. Presiona `F12` para abrir herramientas de desarrollador
2. Ve a la pestaña "Console"
3. Escribe:
   ```javascript
   console.log(localStorage.getItem('bracket_tournaments'))
   ```
4. Copia el resultado y guárdalo en un archivo de texto

### Restaurar Respaldo

1. Presiona `F12`
2. Pestaña "Console"
3. Escribe:
   ```javascript
   localStorage.setItem('bracket_tournaments', 'PEGA_AQUI_TU_RESPALDO')
   ```

---

## 🔧 Comandos para Desarrolladores

```bash
# Instalar dependencias
npm install

# Modo desarrollo (con hot reload)
npm run dev

# Crear build de producción
npm run build

# Vista previa del build
npm run preview
```

---

## 📁 Estructura del Proyecto

```
src/
├── pages/              # Páginas principales
│   ├── Dashboard/      # Lista de torneos
│   ├── CreateTournament/  # Crear torneo
│   └── Tournament/     # Vista del bracket
├── components/         # Componentes reutilizables
│   ├── Bracket/        # Visualización del bracket
│   ├── Match/          # Tarjeta de partido
│   ├── Participants/   # Lista de participantes
│   └── Sidebar/        # Barra lateral
├── engine/             # Lógica del torneo (sin UI)
│   ├── generator/      # Generación de brackets
│   ├── progression/    # Avance de partidos
│   ├── seeding/        # Asignación de seeds
│   └── utils/          # Utilidades matemáticas
├── services/           # Servicios de negocio
│   ├── storage/        # Persistencia en localStorage
│   └── tournament/     # Gestión de torneos
└── models/             # Definiciones de tipos TypeScript
```

---

## 🎨 Tecnologías Utilizadas

- **React 19** - Framework UI
- **TypeScript** - Tipado estático
- **Vite** - Build tool ultrarrápido
- **React Router** - Navegación
- **LocalStorage** - Persistencia de datos

---

## 📊 Consumo de Recursos

### Build de Producción (dist/index.html)
- **Tamaño**: 266 KB
- **RAM**: ~50-100 MB (normal para una página web)
- **CPU**: Casi nada
- **Internet**: ❌ No necesita

### Modo Desarrollo (npm run dev)
- **RAM**: ~200-300 MB
- **CPU**: 1-5%
- **Internet**: ❌ No necesita

---

## 🐛 Solución de Problemas

### La página no carga
- Asegúrate de abrir `dist/index.html`, no el `index.html` de la raíz
- Verifica que exista la carpeta `dist/assets/`

### Los datos no se guardan
- No uses modo incógnito
- Verifica que el navegador permita localStorage

### Quiero borrar todos los torneos
Presiona F12 y en la consola escribe:
```javascript
localStorage.clear()
```

---

## 📝 Licencia

ISC

---

## 📚 Más Información

- **Instrucciones detalladas**: Ver `INSTRUCCIONES_USO_LOCAL.md`
- **Documentación técnica**: Ver `README.md` (inglés)
- **Documentación para desarrolladores**: Ver `AGENTS.md`

---

Hecho con ❤️ usando React, TypeScript y Vite

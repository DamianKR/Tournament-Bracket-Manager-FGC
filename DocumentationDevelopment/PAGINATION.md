# Paginación

Un solo sistema para todo el sitio: mismo componente, mismo hook, mismo lenguaje de consulta
en servidor y navegador. Niveles de página: 25 / 50 / 75 / 100 (por defecto 25; 50 en ranking y
participantes). La barra no se muestra si el total filtrado es de 25 o menos.

## Piezas

| Capa | Archivo | Qué hace |
|---|---|---|
| Lenguaje de consulta | `shared/query.js` (+ `.d.ts`) | `where` / `search` / `sort` / `offset` / `limit`. Lo ejecutan el servidor JSON, Supabase (PostgREST) y el navegador offline con la misma semántica |
| Adaptadores | `server/db/jsonDb.js`, `server/db/supabaseDb.js` | `collection.query(spec)` → `{ items, total }` |
| Rutas | `server/utils/paginate.js` | `isPaged`, `parseClientSpec` (lista blanca por ruta), `withScope` (visibilidad que el cliente no puede ampliar), `runPagedQuery`, `pageInMemory` |
| Historial unificado | `server/utils/historyQuery.js`, `server/routes/history.js` | Torneo + liga + ranked en un feed paginado |
| Espejo local | `src/services/pagination/listMirror.ts` | Copia por ámbito que se llena página a página (`complete` indica si es exhaustiva) |
| Fuentes | `src/services/pagination/pagedSource.ts` | `createServerPagedSource` (servidor + espejo), `createServerOnlyPagedSource` (sin copia local) |
| Hook | `src/hooks/usePaginatedList.ts` | `usePaginatedList` (servidor) y `useLocalPagination` (lista ya local) |
| Componente | `src/components/Pagination/Pagination.tsx` | `« ‹ 1 [página editable] N › »`, tamaño de página, adaptado a móvil |

## Contrato del servidor

Es opt-in: una ruta solo pagina si recibe `?page=` o `?pageSize=`; sin ellos responde igual que siempre (array).

```
GET /api/<ruta>?communityId=…&page=2&pageSize=50&q={"where":[…],"search":{"text":"ale"},"sort":[…]}
→ { items, total, page, pageSize, totalPages }
```

- Operadores: `eq`, `neq`, `in`, `nin`, `null`, y grupos `or` / `and`. Los campos son rutas con puntos
  (`games.ssbu.eloPoints`); segmentos `[A-Za-z0-9_-]`.
- Semántica estilo SQL sobre `data->>campo`: los valores se comparan como texto y `eq/neq/in/nin` nunca
  coinciden con un campo nulo o ausente (usa `null`). El orden pone nulos al final.
- Página fuera de rango → se recorta a la última. `pageSize` inválido → el valor por defecto.
- `q` se valida contra una lista blanca de campos por ruta; la visibilidad de comunidad la añade siempre el servidor.

## Qué usa qué

| Pantalla | Modo | Por qué |
|---|---|---|
| Historial del ranking, Events → History, Matches del perfil | Servidor + espejo | Datos del servidor; History y Matches comparten copia por comunidad |
| Leaderboard (50 por defecto), Ligas | Servidor + espejo | El servidor calcula posiciones / ámbito; se corta la página después |
| Usuarios (superadmin) | Servidor, sin copia local | Las cuentas no se guardan en el navegador; offline = aviso de reconexión |
| Participantes (50 por defecto), Torneos, Retos ranked | Local | Se crean / editan offline y otras pantallas necesitan la lista completa |
| Resultados del perfil (torneos y ligas), H2H | Local | El servidor ya devuelve la lista completa; H2H necesita todos los sets para agregar personajes |

## Offline

Con conexión, cada página se pide al servidor (filtros y búsqueda en la base de datos) y se mezcla en el
espejo; en segundo plano se completa el resto (trozos de 100, tope 5000, refresco a los 10 min). Sin conexión
o con 5xx, se ejecuta la misma consulta sobre el espejo:

- espejo completo → resultados idénticos a los del servidor, sin aviso;
- espejo parcial → `incomplete` (banda "datos parciales");
- sin espejo → `unavailable` (aviso de reconexión).

## Añadir una lista nueva

1. Ruta: `if (isPaged(req.query))` → `parseClientSpec(req.query, RULES)` → `withScope(spec, communityScopeCond(...))` →
   `runPagedQuery(collection, spec, req.query)` (o `pageInMemory` si la lista se calcula en memoria).
2. Cliente: fuente con `createServerPagedSource` (memoiza la fuente o confía en su `key`), `buildXxxSpec()` con los filtros,
   `usePaginatedList({ source, spec })`, y `<Pagination {...list.paginationProps} scrollRef={ref} />`.
3. Lista ya local: `useLocalPagination(items, spec, { listId, resetKey })`.
4. Estados: `list.loading`, `list.unavailable` (`<OfflineNotice />`), `list.incomplete` (`<OfflineNotice compact partial />`),
   `list.error`; vacío real cuando `!loading && !unavailable && !error && total === 0`.

## Pruebas

`npm test` (Node, sin dependencias): motor de consulta, helper de rutas, ámbito de comunidad y historial unificado
(150 combinaciones aleatorias de filtros contra el filtrado en memoria). La paridad con Supabase se comprobó en
solo lectura contra producción.

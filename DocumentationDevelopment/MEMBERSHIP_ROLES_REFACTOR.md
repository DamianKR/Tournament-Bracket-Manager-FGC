# Refactor de roles y permisos a nivel de membership

## Estado actual y problema

Ahora mismo la autorización se basa en campos globales del `user`:

```js
user = {
  id,
  username,
  password,
  role: 'superadmin' | 'community_admin' | 'admin' | 'user',
  gameAdminFor: ['ssbu'],
  communityId, // home
  memberships: [{ participantId, communityId, isActive }]
}
```

Esto genera problemas graves:

1. **Un `community_admin` que edita un participante en su comunidad toca la cuenta global del usuario.** Si le cambia username o password, le quita acceso a **todas** las comunidades.
2. **El rol es global.** Un usuario que es `community_admin` en una comunidad lo es en todas, aunque solo tenga una membresía.
3. **`gameAdminFor` es global.** Un admin con scope de un juego en una comunidad hereda ese scope en otras comunidades, lo cual no tiene sentido.
4. **No se puede tener ayudantes (`admin`) por comunidad sin afectar el resto.**

## Objetivo del refactor

Mover `role` y `gameAdminFor` del `user` a cada `membership`, dejando el `user` como identidad global única (username/password) y `superadmin` como el único rol global.

## Modelo de datos propuesto

### `User` (global)

```js
{
  id,
  username,        // único, global
  password,        // único, global
  role?: 'superadmin' | null,   // único rol global: superadmin. Si es null/undefined, el usuario es un usuario normal cuyo rol real vive en memberships
  participantId,   // home participant (legado, para compatibilidad)
  memberships: [
    {
      participantId,
      communityId,
      isActive,
      role: 'user' | 'admin' | 'community_admin',  // rol en ESTA comunidad
      gameAdminFor?: string[]                       // scope de juegos en ESTA comunidad
    }
  ],
  createdAt,
  updatedAt
}
```

### Diferencia entre `user.role` y `membership.role`

Para evitar confusión con dos campos que se llaman `role`:

- **`user.role`**: solo indica si es `superadmin` global. Puede ser `null`, `undefined` o `'superadmin'`.
  - `superadmin` → acceso total, ignora las `memberships`.
  - `null` / `undefined` → no es superadmin; su poder depende de la `membership` de cada comunidad.

- **`membership.role`**: indica el rol del usuario **dentro de esa comunidad**.
  - `'user'` → miembro normal.
  - `'admin'` → ayudante/administrador de la comunidad.
  - `'community_admin'` → dueño/administrador principal de la comunidad.

El `user` repetido no es un conflicto real: en `user.role` simplemente no hay `user`, y en `membership.role` el `'user'` significa "miembro sin permisos de admin". Si se prefiere evitar la palabra `user` en dos sitios, se puede renombrar el campo de membresía a `communityRole`. En este plan se mantiene `role` para no romper más la interfaz, pero se documenta que tienen distinto ámbito.

### `Community`

```js
{
  id,
  name,
  shortName,
  description,
  isPublic,
  ownerAdminId,    // id del user dueño (puede quedar o derivarse de memberships)
  // ... resto de campos
}
```

> **Nota sobre `ownerAdminId`:** puede conservarse como referencia rápida al dueño, pero la fuente de verdad del rol en la comunidad será la `membership` del usuario. En la migración se actualizará `ownerAdminId` si es necesario.

### Reglas de negocio

| Acción | Quién puede |
|--------|-------------|
| Cambiar username/password | El propio usuario o `superadmin` |
| Asignar rol dentro de una comunidad | `superadmin` o `community_admin` de esa comunidad |
| Asignar `gameAdminFor` dentro de una comunidad | `superadmin`, `community_admin` de esa comunidad, o un `admin` que no se promueva a sí mismo |
| Borrar participante | `superadmin`, `community_admin` o `admin` (sin scope) de esa comunidad, sin superar jerarquía |
| Editar perfil de participant | El propio usuario, `superadmin`, o admin de esa comunidad con juego coincidente (según reglas actuales) |

## Jerarquía por comunidad

```text
superadmin (4) > community_admin de la comunidad (3) > admin sin scope de la comunidad (2) > admin scopado de la comunidad (1) > user de la comunidad (0)
```

- Un `community_admin` **no** puede editar/borrar a otro `community_admin` o `superadmin`.
- Un `admin` **no** puede editar/borrar a otro `admin` o superior.
- Un `admin` con `gameAdminFor` solo administra los juegos listados; no puede ver/crear para juegos fuera de su scope.
- Un `admin` sin `gameAdminFor` es admin de todos los juegos de esa comunidad.

## Cambios por capa

### 1. Backend — helpers de autorización (`server/utils/communityScope.js`)

Crear funciones nuevas y deprecar las que lean `user.role` global:

```js
// Devuelve la membership activa del usuario en la comunidad solicitada.
export function getMembership(user, communityId) { ... }

// Devuelve el rol efectivo del usuario en la comunidad.
export function communityRole(user, communityId) { ... }

// Indica si el usuario es superadmin o community_admin de la comunidad.
export function isCommunityAdmin(user, communityId) { ... }

// Indica si el usuario es admin (con o sin scope) de la comunidad.
export function isAdminInCommunity(user, communityId) { ... }

// Indica si puede administrar un juego específico en la comunidad.
export function canAdminGame(user, communityId, gameId) { ... }

// Devuelve el nivel jerárquico en una comunidad.
export function adminLevelInCommunity(user, communityId) { ... }

// Indica si `caller` puede gestionar la cuenta/membresía de `target` en la comunidad.
export function canManageUserInCommunity(caller, target, communityId) { ... }

// Devuelve el participantId del usuario en la comunidad.
export function participantIdFor(user, communityId) { ... } // ya existe; ajustar para usar memberships
```

Mantener `isInUserScope` para validar que el usuario pertenezca a la comunidad.

### 2. Backend — `server/routes/auth.js`

Separar dos conceptos:

#### A. Gestión de cuenta global (`/api/auth/users/:id`)

Solo permite cambiar:

- `username`
- `password`
- `role` a `superadmin` (solo superadmin puede)
- `isActive` (solo superadmin)

Restricciones:

- Solo el propio usuario (autenticado) o `superadmin` puede editar username/password.
- Un `community_admin` **no** puede tocar username/password de otro usuario.
- Un `community_admin` **no** puede cambiar el `role` global de nadie.

#### B. Gestión de membresía (`/api/auth/users/:id/memberships/:communityId`)

Nueva ruta para cambiar `role` y `gameAdminFor` dentro de una comunidad.

```js
PUT /api/auth/users/:id/memberships/:communityId
body: { role, gameAdminFor }
```

Permisos:

- `superadmin`: puede asignar cualquier rol incluyendo `community_admin`.
- `community_admin` de la comunidad: puede asignar `user` o `admin`. **No** puede asignar `community_admin` ni `superadmin`.
- `community_admin` no puede editar a otro `community_admin` o `superadmin`.
- Un `admin` normal **no** puede editar roles.

### 3. Backend — `server/routes/participants.js`

- `POST /:id/join-request` y `POST /:id/invite` deben crear/actualizar la `membership` del usuario.
- `POST /membership-requests/:id/resolve` al aceptar debe crear la membership con `role: 'user'` por defecto.
- `DELETE /:id/communities/:cid` al salir de una comunidad debe marcar `isActive: false` en la membership, no borrar el registro (para conservar historial y no reventar FKs).
- Todas las demás rutas deben usar `getMembership`/`canAdminGame`/`isAdminInCommunity` en lugar de `user.role`/`user.gameAdminFor`.

### 4. Backend — `server/routes/communities.js`

- Al crear una comunidad, el creador recibe una `membership` con `role: 'community_admin'`.
- `PUT /:id` debe seguir siendo solo `superadmin` o el `community_admin` de esa comunidad.
- Verificar que `ownerAdminId` siga siendo consistente con las memberships.

### 5. Backend — resto de rutas

Actualizar `duels.js`, `tournaments.js`, `leagues.js`, `ranking.js`, `rankedMatches.js` para que lean el rol y `gameAdminFor` de la `membership` correspondiente a la comunidad del recurso.

Cambio mecánico: donde hoy se hace `if (user.role === 'admin' && user.gameAdminFor.includes(gameId))`, reemplazar por `if (canAdminGame(user, communityId, gameId))`.

### 6. Frontend — `AuthContext`

- `isAdmin` y `isSuperAdmin` deben seguir funcionando globalmente (`superadmin` global, `admin`/`community_admin` en cualquier comunidad).
- Añadir helpers:
  - `userRoleInCommunity(communityId)`
  - `canAdminCommunity(communityId)`
  - `canAdminGameInCommunity(communityId, gameId)`
  - `isCommunityAdmin(communityId)`
- El `user` guardado en `localStorage` debe actualizarse tras login y tras cambios de membresía.

### 7. Frontend — `ParticipantProfile.tsx`

La sección **Account Management** debe dividirse en:

#### A. Si es el propio usuario o `superadmin`
- Username (editable)
- Cambiar password (opcional)
- Estado activo / rol global (`superadmin`)

#### B. Si es admin de la comunidad actual
- Rol en **esta comunidad** (`user`, `admin`, `community_admin` — con restricciones de jerarquía)
- `gameAdminFor` en **esta comunidad** (grid/checkbox de juegos)
- Botón guardar cambios de membresía

Ocultar siempre:
- Username/password cuando el editor es un `community_admin` o `admin` de la comunidad.
- El selector de `community_admin` para un `community_admin` que no sea `superadmin`.

### 8. Frontend — `ParticipantsPage.tsx`

- Al crear un participante, el `communityId` debe ser el de la comunidad actual.
- El nuevo participante se vincula al usuario creador o a un usuario existente mediante `participantId` en una membership.
- Los controles de admin deben usarse con `canAdminCommunity(currentCommunity.id)` y `canAdminGameInCommunity(currentCommunity.id, gameId)`.

### 9. Frontend — `CommunityDashboard.tsx` y `CommunitiesPage.tsx`

- El botón "Editar comunidad" debe depender de `isCommunityAdmin(currentCommunity.id)`.
- El acceso a solicitudes de ingreso debe ser para `superadmin` o admin (`community_admin` o `admin` sin scope) de esa comunidad.

### 10. Frontend — `Header.tsx`

- Enlaces admin visibles si el usuario tiene rol admin en la comunidad actual, no si es admin global.

## Migración de datos existente

### Paso 1 — Backup

Guardar copia de:

- `data/users.json`
- `data/participants.json`
- `data/communities.json`
- `data/membership_requests.json`

### Paso 2 — Transformar `users.json`

Para cada usuario que no sea `superadmin`:

```js
const homeCommunityId = user.communityId || DEFAULT_COMMUNITY_ID;
const legacyRole = user.role && user.role !== 'user' ? user.role : null;

for (const m of user.memberships) {
  // Si es la home y tenía un rol admin global, lo hereda ahí.
  // Si es cualquier otra membresía, se considera user a menos que ya tuviera algo.
  if (m.communityId === homeCommunityId && legacyRole) {
    m.role = legacyRole; // community_admin | admin
    m.gameAdminFor = user.gameAdminFor || [];
  } else {
    m.role = m.role || 'user';
    m.gameAdminFor = m.gameAdminFor || [];
  }
}

// Si no existe la home membership, crearla con el rol legacy si lo hubiera.
if (!user.memberships.some(m => m.communityId === homeCommunityId)) {
  user.memberships.push({
    participantId: user.participantId,
    communityId: homeCommunityId,
    isActive: true,
    role: legacyRole || 'user',
    gameAdminFor: legacyRole ? (user.gameAdminFor || []) : []
  });
}

// El user ya no tiene rol global; su rol vive en memberships.
user.role = null;
```

Para `superadmin` se mantiene `role: 'superadmin'`. Sus `memberships` pueden estar vacías o tener memberships de conveniencia, pero `superadmin` siempre tiene acceso total.

### Paso 3 — Asegurar `ownerAdminId` en `communities.json`

Para cada comunidad, verificar que el usuario listado en `ownerAdminId` tenga una membership con `role: 'community_admin'`. Si no, crearla.

### Paso 4 — `membership_requests.json`

No requiere cambios estructurales, solo asegurar que al aceptarse se cree la membership con `role: 'user'`.

## Orden de implementación recomendado

1. **Backend helpers** (`communityScope.js`): funciones de membresía sin romper las actuales. Convivir con `user.role`/`user.gameAdminFor` mediante fallback.
2. **Migración de datos** (`scripts/migrateMembershipRoles.js` o manual): transformar `users.json` y `communities.json`.
3. **Rutas de auth** (`auth.js`): separar edición de cuenta global vs. edición de membresía.
4. **Rutas de participantes** (`participants.js`): crear memberships al aceptar solicitudes; marcar inactivas al salir.
5. **Rutas de comunidad y eventos** (`communities.js`, `duels.js`, `tournaments.js`, `leagues.js`, `ranking.js`): reemplazar `user.role` por helpers de membresía.
6. **Frontend AuthContext**: agregar helpers por comunidad.
7. **Frontend `ParticipantProfile`**: dividir Account Management en global vs. membership.
8. **Frontend `ParticipantsPage` y `CommunityDashboard`**: usar helpers por comunidad.
9. **Typecheck + pruebas**.

## Cómo no romper el login

- El login sigue usando `username` + `password`.
- El JWT incluye `userId`.
- `AuthContext` recarga el usuario completo al iniciar sesión y actualiza `localStorage`.
- `user.role === 'superadmin'` sigue siendo el único rol global; todo lo demás se resuelve por `memberships`.

## Tests mínimos para validar

1. Un `community_admin` en Comunidad A edita el rol de un usuario en Comunidad A; el mismo usuario en Comunidad B sigue siendo `user`.
2. El `community_admin` no puede cambiar username/password de otro usuario.
3. Un usuario con `admin` en Comunidad A y `user` en Comunidad B:
   - En Comunidad A ve controles admin.
   - En Comunidad B no los ve.
4. Un `admin` con `gameAdminFor: ['ssbu']` en Comunidad A:
   - Puede crear torneos de SSBU.
   - No puede crear torneos de SF6.
   - En Comunidad B, si no tiene `admin`, no ve nada.
5. Al aceptar una solicitud de ingreso, la membership creada tiene `role: 'user'` y `isActive: true`.
6. Al hacer F5 en el perfil de un participante de otra comunidad, se carga correctamente usando `memberships`.

## Archivos afectados principales

- `server/utils/communityScope.js`
- `server/routes/auth.js`
- `server/routes/participants.js`
- `server/routes/communities.js`
- `server/routes/duels.js`
- `server/routes/tournaments.js`
- `server/routes/leagues.js`
- `server/routes/ranking.js`
- `server/routes/rankedMatches.js`
- `src/contexts/AuthContext.tsx`
- `src/contexts/CommunityContext.tsx`
- `src/pages/Participants/ParticipantProfile.tsx`
- `src/pages/Participants/ParticipantsPage.tsx`
- `src/pages/CommunityDashboard/CommunityDashboard.tsx`
- `src/pages/Communities/CommunitiesPage.tsx`
- `src/components/Header/Header.tsx`
- `data/users.json` (migración)
- `data/communities.json` (consistencia de `ownerAdminId`)

## Nota final

Este refactor es grande pero es el único modo de resolver de raíz el problema que describes: **cuentas globales vs. permisos por comunidad**. Hacer parches parciales en `auth.js` o `ParticipantProfile` sin mover `role` a `membership` seguirá dejando agujeros.

---

## Revisión post-plan: gaps encontrados antes de implementar

Tras revisar el código real (`jwtMiddleware.js`, `AuthContext.tsx`, `auth.js`, `communities.js`), aparecen 8 huecos concretos que el plan original no cubría. Hay que resolverlos **antes** de tocar código, si no el refactor va a romper cosas a mitad de camino.

### Gap 1 — Los middlewares `requireAdmin`/`requireCommunityAdmin`/`requireSuperAdmin` quedan rotos

`server/utils/jwtMiddleware.js` filtra **antes** de que la ruta sepa a qué comunidad pertenece el recurso:

```js
export function requireAdmin(req, res, next) {
  if (!req.user || !ALL_ADMIN_ROLES.includes(req.user.role)) { ... } // usa req.user.role GLOBAL
}
```

Se usa como gate duro en `auth.js`, `participants.js`, `duels.js`, `tournaments.js`, `rankedMatches.js`, `ranking.js`, `leagues.js` (32 usos). Tras el refactor, `req.user.role` será `null` para cualquier admin que no sea `superadmin`, así que **todos los admins de comunidad quedarían bloqueados en el gate antes de llegar a la lógica de la ruta**.

**Solución:** crear un gate "grueso" nuevo que solo verifica que el usuario sea admin de **alguna** comunidad (o superadmin), y dejar que la ruta haga el chequeo fino con `communityId` real:

```js
export function requireAnyAdmin(req, res, next) {
  const u = req.user;
  if (u?.role === 'superadmin') return next();
  const hasAdminSomewhere = (u?.memberships ?? []).some(
    m => m.isActive !== false && ['admin', 'community_admin'].includes(m.role)
  );
  if (!hasAdminSomewhere) return res.status(403).json({ error: 'Admin access required' });
  next();
}
```

`requireAdmin` se reemplaza por `requireAnyAdmin` en todas las rutas listadas arriba. El chequeo preciso (¿es admin de ESTA comunidad/juego?) ya se hace dentro del handler en la mayoría de rutas (patrón que ya existe hoy con `canAdminGame`), así que el gate solo necesita descartar usuarios sin ningún rol admin.

`requireCommunityAdmin` no se usa en ninguna ruta actualmente (código muerto) — se puede actualizar igual por consistencia o eliminar.

### Gap 2 — `AuthContext` global (`isAdmin`, `isSuperAdmin`, `isCommunityOwner`, `isCommunityAdminAssistant`) tiene mucho más radio de impacto del listado

El plan original solo mencionaba tocar `AuthContext.tsx`, `ParticipantProfile.tsx`, `ParticipantsPage.tsx`, `CommunityDashboard.tsx`, `CommunitiesPage.tsx`, `Header.tsx`. Grep real de `user.role` / `isAdmin` / `gameAdminFor` en `src/` da **16 archivos**, incluyendo varios no listados:

- `src/components/AdminRoute/AdminRoute.tsx` — gate de ruta (`/c/:id/participants`, etc.) usa `isAdmin` global.
- `src/pages/Dashboard/Dashboard.tsx`
- `src/pages/CreateTournament/CreateTournament.tsx`
- `src/pages/Leagues/CreateLeague.tsx`
- `src/pages/Events/Ranked/ActiveChallenges.tsx`
- `src/pages/Events/Ranked/RecordMatchTab.tsx`
- `src/services/auth/authService.ts`

**Definición que hay que fijar explícitamente** (el plan no lo aclaraba):

- `isAdmin` (global, en `AuthContext`) pasa a significar **"admin de alguna comunidad, o superadmin"** — sirve solo como gate grueso de rutas (`AdminRoute`) y para decidir si se muestra la sección de administración en la navegación.
- Todo lo que hoy depende de "soy admin de MI comunidad actual" debe usar el helper ya existente `canAdminCurrentCommunity` de `CommunityContext` (que ya combina rol + pertenencia), ajustado para leer el rol desde la `membership` de `currentCommunity.id` en vez de `user.role` global. Esto ya es el patrón correcto — solo hay que redirigir su fuente de datos.
- Cada uno de los 7 archivos extra debe auditarse fila por fila: decidir si el uso actual de `user.role`/`isAdmin` debería ser el gate grueso (queda igual) o el gate fino por comunidad (cambia a `canAdminCurrentCommunity` / `canAdminGame`).

### Gap 3 — Duplicación de "home" (`user.communityId` / `user.participantId` / `user.role` planos) vs. `memberships`

Esto es exactamente la clase de bug que ya nos mordió dos veces hoy (perfil "No account" y "Participant not found" tras aceptar una membership) por tener el mismo dato en dos lugares que se desincronizan.

**Hallazgo concreto:** `POST /api/auth/users` (crear cuenta) hoy **NO** crea ninguna entrada en `memberships` — el rol/gameAdminFor/comunidad "home" viven *solo* en los campos planos del user. Si el refactor mueve el rol a `memberships` pero esta ruta se queda sin tocar, cualquier cuenta nueva creada después de migrar quedaría sin membership real y por tanto sin permisos.

**Recomendación (cambio al plan):** no mantener el home como caso especial. Tratarlo como **una membership más**:

- `POST /api/auth/users` debe crear también la entrada correspondiente en `memberships` (misma comunidad, mismo rol, mismo `gameAdminFor`), no solo los campos planos.
- Los helpers (`getMembership`, `communityRole`, `canAdminGame`, etc.) deben ser la **única** fuente de verdad, incluso para la comunidad home. Los campos planos `user.role`/`user.communityId`/`user.gameAdminFor` quedan solo como cache de conveniencia (para saber a qué comunidad redirigir por default) pero nunca se leen para autorizar nada.
- Esto elimina de raíz la clase de bug de "dos fuentes de verdad desincronizadas".

### Gap 4 — Cambio de firma de `canAdminGame` no está enumerado

El plan dice "cambio mecánico" pero no lista los call sites reales. Verificados por grep, hay que tocar como mínimo:

- `server/routes/duels.js`
- `server/routes/tournaments.js`
- `server/routes/leagues.js`
- `server/routes/ranking.js`
- `server/routes/rankedMatches.js`
- `server/routes/participants.js`
- `server/routes/auth.js` (función interna `adminSharesGameWithUser`, que reimplementa una versión ad-hoc de esta misma lógica y también hay que migrarla)

Antes de implementar, correr `grep -rn "canAdminGame\|gameAdminFor" server/` y armar la lista exacta de líneas a tocar, para no dejar ninguna con la firma vieja (2 args) mezclada con la nueva (3 args) — eso compilaría en JS sin error y fallaría silenciosamente en producción.

### Gap 5 — `gameAdminFor` obsoleto cuando cambia el rol

Si un `admin` con `gameAdminFor: ['ssbu']` es ascendido a `community_admin` y luego regresado a `admin`, sin limpieza explícita recuperaría el scope viejo. Regla a agregar:

> Cada vez que `membership.role` cambia a algo distinto de `'admin'`, `membership.gameAdminFor` se limpia a `[]`. Si vuelve a `'admin'`, empieza sin scope (admin de todos los juegos) hasta que se le asigne explícitamente.

### Gap 6 — Múltiples `community_admin` por comunidad: confirmar que es intencional

El modelo por membership permite naturalmente que una comunidad tenga más de un `community_admin` (co-owners). Esto es coherente con "el creador no siempre es quien administra" (ver Gap 7), pero hay que decirlo explícitamente en las reglas de negocio para que el frontend no asuma "solo puede haber un dueño".

### Gap 7 — `ownerAdminId` no siempre es un admin real

Verificado en `server/routes/communities.js`: `POST /api/communities` es `requireSuperAdmin`-only, y `ownerAdminId` se guarda como `req.user.userId`, es decir, **el superadmin que creó la comunidad**, no necesariamente la persona que la va a administrar. Asignar `community_admin` a alguien es una acción aparte y posterior (vía gestión de membership).

**Bug ya corregido en el script de migración** (`scripts/migrateMembershipRoles.js`): la primera versión le creaba una membership `community_admin` a cualquier `ownerAdminId`, incluyendo superadmins que solo "de paso" crearon la comunidad. Se agregó un `if (owner.role === 'superadmin') continue;` para evitar ensuciar sus `memberships` con entradas innecesarias.

### Gap 8 — Reasignación de "home" si se desactiva esa membership

Si un usuario sale de su comunidad home (`DELETE /:id/communities/:cid` con `cid === user.communityId`), hoy esa ruta ya bloquea "no puedes salir de tu home community". Falta decidir: ¿se permite alguna vez cambiar de home?, y si es así, ¿qué pasa si la única membership activa que le queda es otra comunidad? Regla a agregar: si se permite salir del home, `user.communityId` se recalcula a la primera membership activa restante, o `null` si no queda ninguna.

### Confirmaciones positivas (no son gaps, pero vale la pena dejarlas explícitas)

- El JWT y `/me` ya recalculan `communityIds` / `participantByCommunity` dinámicamente (`getUserCommunityIds`, `getParticipantByCommunity` en `auth.js`) — no hay que tocar esa parte, y el objeto `memberships` completo ya viaja al frontend vía `safeUser()`, así que el frontend no necesita un endpoint nuevo para leer rol/gameAdminFor por comunidad.
- `requireAuth` siempre relee al usuario desde la base de datos y sobreescribe el rol del JWT (`req.user = {...decoded, ...user}`), así que **no hace falta forzar re-login** tras la migración: en el próximo request cada usuario ya ve su nuevo rol por membership.
- El frontend solo cachea el **token** en `localStorage`, no el objeto `user` completo (`authService.ts`), así que no hay riesgo de un `user.role` viejo quedando pegado en caché del navegador.

## Alternativa considerada y descartada

Se evaluó un enfoque más liviano: dejar `user.role` como "rol por defecto" y solo agregar overrides por comunidad cuando difieran del default. Se descarta porque reintroduce exactamente el problema de "dos fuentes de verdad" que causó los bugs de esta sesión (perfil sin cuenta vinculada, participante no encontrado tras F5). El modelo de membership como única fuente de verdad (Gap 3) es más código de migración inicial, pero elimina una clase entera de bugs futuros y es el que se recomienda.

## Checklist actualizado antes de escribir código

1. Confirmar las reglas de negocio de los Gaps 5, 6 y 8 (limpieza de `gameAdminFor`, múltiples `community_admin`, reasignación de home).
2. Agregar `requireAnyAdmin` a `jwtMiddleware.js` y reemplazar los 32 usos de `requireAdmin` listados.
3. Modificar `POST /api/auth/users` (Gap 3) para crear también la `membership` de la comunidad home, no solo campos planos.
4. Enumerar y migrar los 7 call sites de `canAdminGame`/`gameAdminFor` (Gap 4), incluyendo `adminSharesGameWithUser` en `auth.js`.
5. Redefinir `isAdmin`/`isSuperAdmin`/`isCommunityOwner`/`isCommunityAdminAssistant` en `AuthContext` con la semántica del Gap 2, y auditar los 16 archivos frontend (no solo los 6 originalmente listados).
6. Corregir `ownerAdminId` en la migración para no crear memberships falsas a superadmins (ya corregido en el script).
7. Ejecutar migración, typecheck, y las pruebas de la sección "Tests mínimos" ya definida más arriba.

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

# Integración con start.gg API

## Resumen de la API

start.gg (anteriormente smash.gg) proporciona una **API GraphQL** para acceder a datos de torneos.

### Endpoint
- **URL Base**: `https://api.start.gg/gql/alpha`
- **Tipo**: GraphQL
- **Autenticación**: API Key requerida (header `Authorization: Bearer <token>`)

### Documentación Oficial
- Referencia API: https://developer.start.gg/reference
- Explorer GraphQL: https://developer.start.gg/explorer
- Ejemplos: https://github.com/smashgg/developer-portal

## Casos de Uso para Nuestro Proyecto

### 1. Importar Resultados de Torneo Completado

**Query para obtener standings (posiciones finales):**

```graphql
query EventStandings($eventId: ID!, $page: Int!, $perPage: Int!) {
  event(id: $eventId) {
    id
    name
    standings(query: {
      perPage: $perPage,
      page: $page
    }){
      nodes {
        placement
        entrant {
          id
          name
          participants {
            player {
              id
              gamerTag
            }
          }
        }
      }
    }
  }
}
```

**Variables:**
```json
{
  "eventId": 78790,
  "page": 1,
  "perPage": 64
}
```

**Respuesta esperada:**
```json
{
  "data": {
    "event": {
      "id": 78790,
      "name": "Melee Singles",
      "standings": {
        "nodes": [
          {
            "placement": 1,
            "entrant": {
              "id": 1977436,
              "name": "PG | Zain",
              "participants": [
                {
                  "player": {
                    "id": 12345,
                    "gamerTag": "Zain"
                  }
                }
              ]
            }
          }
        ]
      }
    }
  }
}
```

### 2. Obtener Información del Torneo

**Query para datos básicos:**

```graphql
query TournamentBySlug($slug: String!) {
  tournament(slug: $slug) {
    id
    name
    slug
    startAt
    endAt
    city
    countryCode
    events {
      id
      name
      slug
      videogame {
        id
        name
      }
    }
  }
}
```

**Variables:**
```json
{
  "slug": "genesis-9"
}
```

### 3. Obtener Sets/Matches Individuales

**Query para ver matches con resultados:**

```graphql
query EventSets($eventId: ID!, $page: Int!, $perPage: Int!) {
  event(id: $eventId) {
    id
    name
    sets(
      page: $page
      perPage: $perPage
      sortType: STANDARD
    ) {
      pageInfo {
        total
        totalPages
      }
      nodes {
        id
        fullRoundText
        displayScore
        winnerId
        slots {
          entrant {
            id
            name
          }
        }
        games {
          winnerId
          selections {
            entrant {
              id
            }
            selectionValue
          }
        }
      }
    }
  }
}
```

**Nota sobre personajes:**
- Los personajes usados están en `games[].selections[].selectionValue`
- Cada game dentro de un set puede tener diferentes personajes

## Plan de Implementación

### Fase 1: Modo Manual (Prioridad Alta)
✅ Permitir crear torneo ingresando solo posiciones finales
- Input: Lista de participantes con placement
- Opcional: Personajes usados por cada uno
- Genera podio y asigna puntos ELO según posición
- No requiere bracket

### Fase 2: Integración start.gg (Prioridad Media)
- Crear servicio `startggService.ts`
- Implementar autenticación con API key
- Query para obtener standings por eventId o slug
- Mapear datos de start.gg a nuestro modelo
- UI para importar: pegar URL de torneo → extraer slug → fetch data → preview → confirmar

### Fase 3: Sincronización Avanzada (Futuro)
- Importar bracket completo (no solo standings)
- Importar personajes usados por match
- Webhook para actualizaciones en tiempo real
- Vincular cuentas start.gg con participantes locales

## Consideraciones Técnicas

### API Key
- Requiere cuenta de desarrollador en start.gg
- Key debe guardarse en `.env.local` como `VITE_STARTGG_API_KEY`
- No exponer en frontend (usar backend como proxy)

### Rate Limits
- start.gg tiene límites de requests
- Implementar caché de respuestas
- Considerar batch requests

### Mapeo de Datos

**start.gg → Nuestro Sistema:**
- `entrant.name` → `participant.name`
- `placement` → posición final para puntos ELO
- `games[].selections[].selectionValue` → `characterId`
- `event.videogame.name` → `gameId` (requiere mapeo manual)

### Juegos Soportados

Mapeo inicial de IDs de start.gg a nuestros gameIds:
- Super Smash Bros. Ultimate (id: 1386) → `ssbu`
- Super Smash Bros. Melee (id: 1) → `ssbm`
- Street Fighter 6 (id: 43868) → `sf6`
- Tekken 8 (id: 53945) → `tekken8`
- (Expandir según necesidad)

## Ejemplo de Flujo de Usuario

### Importar desde start.gg:
1. Usuario va a "Crear Torneo"
2. Selecciona "Importar desde start.gg"
3. Pega URL: `https://start.gg/tournament/genesis-9/event/melee-singles`
4. Sistema extrae slug y eventId
5. Hace query a start.gg API
6. Muestra preview de standings
7. Usuario confirma
8. Sistema crea torneo local con:
   - Nombre del evento
   - Participantes con posiciones finales
   - Puntos ELO asignados
   - Podio generado

### Modo Manual:
1. Usuario va a "Crear Torneo"
2. Selecciona "Modo Manual (Solo Posiciones)"
3. Ingresa nombre del torneo y juego
4. Agrega participantes con sus posiciones:
   - Krux - 1er lugar
   - Gino - 2do lugar
   - Alexis - 3er lugar
   - etc.
5. Opcionalmente agrega personajes usados
6. Confirma
7. Sistema asigna puntos y crea podio

## Referencias
- [start.gg Developer Portal](https://developer.start.gg)
- [GraphQL Explorer](https://developer.start.gg/explorer)
- [GitHub Examples](https://github.com/smashgg/developer-portal/tree/master/docs/examples)

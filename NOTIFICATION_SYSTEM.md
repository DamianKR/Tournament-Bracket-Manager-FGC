# Sistema de Notificaciones

## Arquitectura

### Backend (Servidor)

El servidor ejecuta checks periódicos para generar notificaciones:

```javascript
// server.js
runNotificationChecks(); // Al iniciar
setInterval(runNotificationChecks, 15 * 60 * 1000); // Cada 15 minutos
```

#### Tipos de notificaciones generadas:

1. **League Week Start** (`notifyLeagueWeekStart`)
   - Se ejecuta cada 15 minutos
   - Revisa todas las ligas activas
   - Si una semana ya empezó (o está a punto de empezar en los próximos 30 min) Y no se ha notificado:
     - Crea una notificación para cada participante con sus oponentes de la semana
     - Marca la semana como notificada en `league.notifiedWeeks[]`

2. **Expiring Duels** (`notifyExpiringDuels`)
   - Notifica 3 días antes de que expire un duelo

3. **Expiring League Matches** (`notifyExpiringLeagueMatches`)
   - Notifica 3 días antes de que expire un match de liga

### Frontend (Cliente)

El cliente hace polling periódico para obtener notificaciones:

```typescript
// NotificationContext.tsx
const POLL_INTERVAL_MS = 60 * 1000; // Cada 1 minuto
```

#### Flujo de notificaciones en el cliente:

1. **Al iniciar sesión:**
   - Si hay 1 notificación no leída: muestra toast con el mensaje
   - Si hay múltiples: muestra toast de resumen

2. **Durante la sesión (cada 1 minuto):**
   - Hace polling al servidor
   - Si detecta notificaciones nuevas: muestra toast
   - Actualiza el badge del bell icon

3. **Toasts:**
   - Se muestran arriba a la derecha
   - Desaparecen automáticamente después de 10 segundos
   - Se pueden cerrar manualmente con X
   - Se apilan si llegan múltiples

## Timing y Delays

### Peor caso de delay (antes de las mejoras):
- Servidor check: cada 1 hora
- Cliente polling: cada 30 segundos
- **Delay máximo: 1 hora + 30 segundos**

### Peor caso de delay (después de las mejoras):
- Servidor check: cada 15 minutos
- Cliente polling: cada 1 minuto
- **Delay máximo: 15 minutos + 1 minuto = 16 minutos**

### Ejemplo real:
```
Liga empieza:           2:00 AM
Servidor ejecuta check: 2:15 AM (primer check después de las 2 AM)
Notificaciones creadas: 2:15 AM
Cliente hace polling:   2:16 AM (máximo 1 minuto después)
Usuario ve notif:       2:16 AM

Delay total: ~16 minutos
```

## Ventana de notificación anticipada

Las notificaciones de inicio de semana se pueden enviar hasta **30 minutos antes** del inicio real:

```javascript
const NOTIFICATION_WINDOW_MINUTES = 30;
const notificationTime = new Date(weekStart.getTime() - 30 * 60 * 1000);
```

Esto significa que si el servidor ejecuta un check a las 1:45 AM y la liga empieza a las 2:00 AM, las notificaciones se envían inmediatamente.

## Mejoras futuras posibles

1. **WebSockets / Server-Sent Events:**
   - Notificaciones en tiempo real sin polling
   - Delay: < 1 segundo

2. **Push Notifications:**
   - Notificaciones del navegador incluso cuando la app está cerrada
   - Requiere service worker

3. **Scheduled Jobs más precisos:**
   - Usar una librería como `node-cron` para ejecutar exactamente a las horas programadas
   - Calcular dinámicamente cuándo debe ejecutarse el próximo check

4. **Notificaciones por email/SMS:**
   - Para eventos importantes (liga empieza, match expira)
   - Requiere integración con servicio de email/SMS

## Logs útiles

Para debugging, el servidor loguea:

```
[notifyLeagueWeekStart] Notified X participants for league "Liga Name" week Y
```

Revisa los logs del servidor para confirmar cuándo se enviaron las notificaciones.

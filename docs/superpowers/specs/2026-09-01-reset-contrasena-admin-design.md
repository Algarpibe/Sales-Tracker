# Restablecer contraseña desde administración — Diseño

**Contexto:** La app no tiene ningún flujo de recuperación de contraseña. Cuando un usuario pierde la suya, la única salida es entrar a la base de datos y escribir el hash a mano. Eso ya salió caro una vez: un `UPDATE` manual dejó `account.password` con 13 caracteres de texto plano en vez de un hash bcrypt de 60, y `bcrypt.compare` falló siempre — el login quedó roto sin que nada lo avisara.

**Goal:** Que un administrador pueda restablecer la contraseña de un usuario de su empresa desde `/admin/users`, sin tocar la base de datos y sin montar infraestructura de email.

**Arquitectura:** Acción de servidor que genera una contraseña temporal, la hashea con bcrypt cost 12, revoca las sesiones del usuario y marca `must_change_password`. El middleware retiene a ese usuario en `/settings` hasta que la cambie. El flag se limpia solo, desde un hook de base de datos de better-auth.

**Tech:** better-auth 1.6.20 (`databaseHooks.account.update.after`), bcryptjs, Drizzle, Next 16 middleware.

---

## Decisiones (aprobadas)

- **Reset por administrador, sin email.** El proyecto no tiene ninguna infraestructura de correo (ni nodemailer, ni Resend, ni SMTP). Un flujo self-service estándar no es un formulario: es elegir proveedor, verificar dominio con SPF/DKIM y gestionar secretos nuevos en EasyPanel. Para un equipo interno con un admin disponible, eso es desproporcionado hoy.
- **El cambio se fuerza.** Sin forzarlo, el administrador conoce la contraseña con la que ese usuario sigue entrando indefinidamente: una credencial compartida de facto.
- **El flujo por email queda para Fase 4**, junto con los "informes por email" del ROADMAP, para no montar el correo dos veces ni a medias.

## 0. Evidencia que condiciona el diseño

Hechos verificados en el código, no supuestos:

1. **Ya se puede cambiar la contraseña.** `src/app/(dashboard)/settings/_components/security-form.tsx` usa `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })`, con mínimo de 10 caracteres y confirmación. **No hay que construirlo.** El usuario cambiará la temporal usándola como "contraseña actual".
2. **Existe una regla de rate limit para un endpoint que no está habilitado.** `src/lib/auth/auth.ts:82` define `"/forget-password": { window: 60, max: 3 }`, pero no hay `sendResetPassword` configurado y better-auth no habilita ese endpoint sin él. Es una guarda sobre una puerta cerrada. No se toca en este trabajo, pero conviene saber que no protege nada hoy.
3. **`databaseHooks.account.update.after` existe en better-auth 1.6.20.** Verificado con una sonda de tipos y su control negativo: un hook inventado (`frobnicate`) falla con `TS2353 ... does not exist in type`, mientras que `account.update.after` typechequea. El proyecto ya usa este mecanismo con `databaseHooks.user.create.after`.
4. **El middleware ya consulta `profiles` en cada request** (`src/middleware.ts:17-24`). Añadir una columna a ese `select` no cuesta una consulta extra.
5. **`minPasswordLength: 10`** en `auth.ts`. La temporal generada debe cumplirlo.

## 1. Migración `0008_must_change_password.sql`

> **Renumerada.** Este spec reservaba el `0007`, pero ese número lo ocupó `0007_historical_customer_sales.sql`, ya aplicado en producción. Usar `0008`.

```sql
ALTER TABLE profiles ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
```

`DEFAULT false` es deliberado: sin él, todos los usuarios existentes quedarían atrapados en el redirect forzado en cuanto se despliegue.

Se añade también a `src/db/schema.ts`. La ejecuta el operador a mano en el Postgres Client, como las seis anteriores.

## 2. Acción `resetUserPassword(userId)`

En `src/actions/admin-actions.ts`, siguiendo el patrón ya establecido por `approveUser` y `deactivateUser`: `assertSameCompany` → `requireRole("admin")` → `runAction` → `AppError` → `revalidatePath`.

Cuatro efectos, en una transacción:

1. Genera una contraseña temporal con `crypto.randomBytes` (≥10 caracteres, alfabeto sin caracteres ambiguos como `l`, `1`, `O`, `0`, porque alguien va a tener que dictarla o teclearla).
2. `bcrypt.hash(temp, 12)` — mismo coste que `auth.ts` — y la escribe en `account.password` donde `userId = $1 AND providerId = 'credential'`.
3. `UPDATE profiles SET must_change_password = true`.
4. **Borra las filas de `session` de ese usuario.**

El paso 4 no es opcional: sin él, un usuario con la sesión abierta sigue navegando con la contraseña vieja revocada y esquiva el reset entero.

La temporal se devuelve **una sola vez** en el `ActionResult`. No se persiste en claro en ningún sitio, no se escribe en el logger y no aparece en ningún mensaje de error.

## 3. Middleware

Se añade `must_change_password` al `select` que ya existe en `src/middleware.ts:17-24` — sin consulta adicional — y una guarda nueva.

**El orden importa**, porque es código crítico de autenticación:

1. Sin sesión → `/login` (existente)
2. No aprobado / rechazado / inactivo → `/waiting-approval` (existente)
3. **`must_change_password` activo y la ruta no es `/settings` → `/settings`** (nuevo)
4. Aprobado en página de auth → `/home` (existente)

La guarda nueva va **después** de la de aprobación: un usuario no aprobado debe seguir yendo a `/waiting-approval`, no a `/settings`.

El `matcher` del middleware ya excluye `api/auth`, así que la llamada a `changePassword` no queda atrapada por su propio redirect.

## 4. Cómo se limpia el flag

Con `databaseHooks.account.update.after` en `auth.ts`: cuando se actualiza una cuenta con `providerId === "credential"`, se pone `must_change_password = false` para su `userId`.

**Alternativa descartada y por qué:** una acción de servidor que el cliente llame tras el éxito de `changePassword` sería un agujero — cualquier usuario autenticado podría limpiarse el flag sin haber cambiado nada.

**Supuesto explícito:** el hook se dispara ante *cualquier* actualización de la cuenta, no solo un cambio de contraseña. En esta app es seguro porque el único proveedor configurado es `credential` y nada más actualiza esa fila. Si algún día se añade un proveedor OAuth, esta lógica hay que revisarla.

## 5. UI

**`/admin/users`** — botón "Restablecer contraseña" por usuario, con diálogo de confirmación que deja claro que la contraseña actual dejará de funcionar y que se cerrarán sus sesiones. Al confirmar, un segundo diálogo muestra la temporal con botón de copiar y el aviso de que **no se volverá a mostrar**.

**`/settings`** — cuando `must_change_password` está activo, un aviso visible explicando por qué el usuario ha llegado ahí y que no podrá navegar hasta cambiarla. El `SecurityForm` no se modifica.

## 6. Tests

- **Unitario** del generador de temporales: longitud ≥10, alfabeto sin caracteres ambiguos, dos llamadas no devuelven lo mismo.
- **Unitario** de la acción: que un admin no pueda resetear a un usuario de otra empresa (`assertSameCompany`), y que un no-admin no pueda llamarla.
- **E2E** del ciclo completo: el admin resetea → el usuario entra con la temporal → lo redirigen a `/settings` → la cambia → navega libre.

### Advertencia sobre el presupuesto de logins

El E2E añade **un login** al presupuesto de 5 por minuto de `"/sign-in/email"`. La suite pasa de 3 a 4 de 5, a uno del límite.

**Decisión:** el test del ciclo de reset usa un **tercer usuario semilla dedicado** (`e2e-reset@example.test`), y su login se hace en `auth.setup.ts`, dentro del proyecto `setup` que ya va con `retries: 0`. Así el gasto queda contabilizado en un único sitio, junto a los otros dos, en vez de repartido por los specs — que es como se pierde la cuenta y aparecen 429 intermitentes.

Sube el presupuesto a 4 de 5. **No se resuelve subiendo el límite en `auth.ts`.** Si algún día hiciera falta un quinto login, la respuesta correcta es replantear los tests, no debilitar el rate limiting.

## 7. Seguridad

- El repositorio es **público**: ninguna contraseña temporal, ni de ejemplo, puede acabar en fixtures, docs o mensajes de commit.
- La temporal viaja del servidor al navegador del admin una vez, por HTTPS, dentro del `ActionResult`. No se guarda.
- Un admin puede resetear su propia contraseña; no se bloquea. Es coherente y no abre nada que el rol no permita ya.

## 8. Fuera de alcance

- Flujo self-service por email (Fase 4, con la infraestructura de los informes).
- Caducidad de la temporal. Se descartó: obliga a la misma migración y no resuelve el problema de fondo, porque un usuario que entra dentro del plazo y no cambia la contraseña deja el agujero abierto igual. El cambio forzado sí lo cierra.
- Segundo factor.
- Registro de auditoría de quién reseteó a quién. Merece existir, pero es un trabajo aparte con su propia tabla.

## 9. Criterios de aceptación

1. Un admin restablece la contraseña de otro usuario de su empresa desde `/admin/users` y ve la temporal una vez.
2. Las sesiones activas de ese usuario quedan revocadas: si tenía la app abierta, en la siguiente navegación va a `/login`.
3. Ese usuario entra con la temporal y **no puede salir de `/settings`** hasta cambiarla.
4. Tras cambiarla, navega con normalidad y el flag queda en `false` **verificado en la base de datos**, no solo por la UI.
5. Un admin de otra empresa no puede resetear a ese usuario; un usuario con rol `editor` o `lector` tampoco.
6. `account.password` contiene siempre un hash bcrypt de 60 caracteres con prefijo `$2`. Nunca texto plano.
7. Gates intactos: typecheck limpio, lint en 10 warnings exactos, vitest sin regresiones, suite E2E en verde.

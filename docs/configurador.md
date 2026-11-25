# Guía del Configurador

Esto lo hace una sola persona (el Configurador de Horus) para cada instancia de cliente. El administrador de la pyme **no** puede cambiar roles ni crear accesos por su cuenta.

Cada cliente tiene su propio proyecto de Firebase. Nada se comparte entre clientes.

## 1. Preparar el proyecto de Firebase (una vez por cliente)

1. Crear el proyecto en la consola de Firebase y una app web (de ahí salen los valores `VITE_FIREBASE_*`).
2. **Authentication → Método de acceso:** activar *Correo electrónico y contraseña*.
3. **Firestore Database:** crearla en modo producción. Región recomendada para Argentina: `southamerica-east1` (São Paulo).
4. Copiar `.env.example` a `.env.<cliente>` y completar la configuración web. Esos valores no son secretos.

## 2. Clave de cuenta de servicio (para los scripts)

Los scripts de `scripts/` usan el Admin SDK y necesitan una clave de la instancia.

1. Consola de Firebase → **Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada**.
2. Guardar el `.json` **fuera de la carpeta del repositorio**, o dentro con un nombre que termine en `-adminsdk.json` (`.gitignore` ya lo excluye).
3. Pasar la ruta con `--key` o con la variable `GOOGLE_APPLICATION_CREDENTIALS`.

Esa clave da control total del proyecto: no se sube al repositorio, no se pega en chats ni se manda por mail. Cuando termines, borrala o revocala desde la misma pantalla.

## 3. Publicar las reglas de seguridad

Las reglas (`firestore.rules`) son la barrera real de permisos; la pantalla solo oculta lo que no corresponde.

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project demo
```

Antes de publicar, correr las pruebas de las reglas (usan el emulador, no tocan datos reales):

```bash
npm run test:rules
```

## 4. Dejar lista la instancia

Primero simulación (no escribe nada) y después `--apply`:

```bash
npm run provision -- --company "Nombre de la empresa" --admin-email admin@empresa.com --admin-name "Nombre Apellido" --key ruta/clave.json
npm run provision -- --company "Nombre de la empresa" --admin-email admin@empresa.com --admin-name "Nombre Apellido" --key ruta/clave.json --apply
```

Crea la configuración inicial (`settings/main`: ventana de edición de 7 días, reglas de horas extra, jornada por defecto), carga los feriados nacionales y da de alta al primer administrador. Si no pasás `--password`, genera una contraseña inicial y la muestra una sola vez.

Se puede repetir sin riesgo: no pisa una configuración existente (salvo `--reset-settings`) y no toca feriados ya cargados.

Opciones útiles: `--saturday lct|flat_50` (sábado: 50% hasta las 13 y 100% después, o 50% todo el día).

## 5. Altas y cambios de rol

```bash
npm run create-user -- --email persona@empresa.com --name "Nombre Apellido" --role employee --supervisor jefe@empresa.com --key ruta/clave.json
npm run set-role -- --email persona@empresa.com --role supervisor --key ruta/clave.json
```

- Roles: `admin`, `supervisor`, `employee`. El rol vive en un *custom claim* del token; el campo `role` de `users/{uid}` es solo informativo.
- `set-role` cierra las sesiones abiertas de esa persona para que el cambio se aplique al volver a entrar.
- Más adelante, con el plan Blaze, el alta se hará desde la app con una Cloud Function (`inviteUser`). Hasta entonces, por script.

## 6. Cómo se prueba sin tocar datos reales

- `npm run test:rules`: 57 pruebas de las reglas contra el emulador de Firestore.
- Los scripts también corren contra los emuladores: con `FIRESTORE_EMULATOR_HOST` y `FIREBASE_AUTH_EMULATOR_HOST` definidos no piden clave y escriben en el emulador.
- Para probar la app contra los emuladores: build con `VITE_USE_EMULATORS=true`.

## Qué es real y qué es de muestra hoy

| Pieza | Estado |
|---|---|
| Inicio de sesión con email y contraseña, rol por custom claim, cierre de sesión | Real |
| Cargar horas, corregir un registro observado, borrar un borrador | Real: `time_entries` bajo las reglas |
| Mis horas | Real |
| Aprobaciones (aprobar, aprobar varios, observar con nota) | Real: al aprobar se calculan y congelan `hours` y `breakdown` con la jornada de la persona, los feriados y las reglas de la empresa |
| Inicio (resumen del mes, pendientes, totales del equipo) | Real |
| Proyectos (alta, activar/desactivar, horas aprobadas) | Real |
| Licencias: solicitar, retirar, aprobar o rechazar con motivo, registrar ausencias injustificadas | Real: las vacaciones se cuentan en días corridos y el resto en días hábiles de la jornada de la persona, sin feriados. Al aprobar, la ausencia pasa sola al calendario y a la planilla |
| Calendario del equipo | Real: todos ven quién está ausente; el tipo de licencia lo ven solo supervisor y administrador |
| Reportes: planilla del mes con horas aprobadas, avisos de lo que falta y descarga en Excel/CSV | Real: el resumen y el detalle suman lo mismo; lo no aprobado no entra y se avisa.  |
| Reglas de seguridad de Firestore | Reales y probadas (62 pruebas de reglas y 99 de lógica) |
| Alta de usuarios, cambio de rol, configuración inicial y feriados | Real, por script |
| Mi semana, Directorio, Configuración | Datos de ejemplo (con una cuenta real se muestra un aviso arriba) |

Quién aprueba qué: el supervisor aprueba a quienes lo tienen como `supervisorId`; el administrador aprueba a todos, incluidos los supervisores y sus propias horas.

## Si algo "no aparece"

- Abajo del menú lateral hay una línea `v <commit> · <fecha>`: es la versión que tiene el navegador. Si no coincide con el último commit publicado, hay una pestaña vieja: recargar con Ctrl+Shift+R.
- Una sesión de demo muestra la etiqueta `DEMO · NO SE GUARDA` junto al rol.
- Los mensajes de error de carga incluyen el código técnico entre paréntesis, por ejemplo `(permission-denied)` o `(failed-precondition)` (falta un índice). Abrir F12, pestaña Consola, muestra el detalle.

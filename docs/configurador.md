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

## Qué es real hoy

Todas las pantallas leen y escriben en Firestore con una cuenta real. Solo la entrada "Entrá a la demo" (build de demostración) usa datos de ejemplo.

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
| Directorio y ficha del empleado: puesto, área, legajo, supervisor, estado, CUIL/DNI/teléfono/modalidad (solo admin) y jornada propia | Real. Las altas siguen por script hasta tener el plan Blaze. El CUIL se valida (11 dígitos; si el dígito verificador no coincide es solo un aviso) |
| Configuración: nombre, logo y colores; jornada general; tramos y franjas de horas extra (validadas: cada tipo de día cubierto las 24 h); guardia; ventana de edición; calendario de feriados | Real. Los cambios rigen hacia adelante: lo ya aprobado conserva sus horas |
| Sueldos en el legajo (módulo activable) | Real: sueldo mensual o valor hora según el modelo de pago, con historial de vigencias (quién y cuándo). Solo lo lee el administrador y solo con el módulo activo; ni el supervisor, ni la propia persona, ni el Configurador lo ven |
| Rendimiento (módulo activable): costos contra facturación por proyecto, por persona y por mes | Real: tarifa de cobro por hora y marca "facturable" en cada proyecto (los internos tienen costo sin ingreso); costo con el sueldo vigente en la fecha de cada registro, el recargo de las horas extra y un % de cargas configurable. Solo administrador y con el módulo activo |
| Liquidación de sueldos (módulo activable): liquidación asistida del mes, recibo para imprimir o guardar como PDF, parámetros y conceptos editables, exportación CSV y cierre de período | Real: las novedades (horas normales y extra por tramo, inasistencias injustificadas, vacaciones) salen solas de las horas y licencias aprobadas; el resto se carga a mano. Solo administrador y con el módulo activo |
| Reportes: planilla del mes con horas aprobadas, avisos de lo que falta y descarga en Excel/CSV | Real: el resumen y el detalle suman lo mismo; lo no aprobado no entra y se avisa.  |
| Reglas de seguridad de Firestore | Reales y probadas (94 pruebas de reglas y 179 de lógica) |
| Alta de usuarios, cambio de rol, configuración inicial y feriados | Real, por script |
| Mi semana: grilla de lunes a domingo con feriados y licencias, carga por día, corrección y envío de borradores | Real |

Quién aprueba qué: el supervisor aprueba a quienes lo tienen como `supervisorId`; el administrador aprueba a todos, incluidos los supervisores y sus propias horas.

## Si algo "no aparece"

- Abajo del menú lateral hay una línea `v <commit> · <fecha>`: es la versión que tiene el navegador. Si no coincide con el último commit publicado, hay una pestaña vieja: recargar con Ctrl+Shift+R.
- Una sesión de demo muestra la etiqueta `DEMO · NO SE GUARDA` junto al rol.
- Los mensajes de error de carga incluyen el código técnico entre paréntesis, por ejemplo `(permission-denied)` o `(failed-precondition)` (falta un índice). Abrir F12, pestaña Consola, muestra el detalle.

## Bajas de personal

Poner a alguien como **inactivo** en su ficha le corta el acceso de inmediato: las reglas de Firestore consultan `users/{uid}.active` en cada pedido, así que no hace falta esperar a que venza su sesión. La persona ve un aviso al intentar entrar y sus registros se conservan. Para cerrar también la cuenta de acceso (que no pueda ni iniciar sesión), el Configurador puede deshabilitarla desde la consola de Firebase, en Authentication.

## Marca de la empresa: dos lugares

- `src/config/tenant.config.ts` es la marca con la que **abre** la app (pantalla de entrada): nombre, logo y colores del cliente. Se cambia en código y se publica.
- En **Configuración → Empresa** el administrador puede cambiar nombre, logo (una dirección https) y colores una vez dentro. Eso se guarda en `settings/main` y pisa a la marca del código para todo el equipo.
- Los tramos de hora extra no se pueden borrar desde la pantalla, porque las horas ya aprobadas guardan el identificador del tramo (por ejemplo `ot50`). Si algún día falta un tramo usado, la planilla lo avisa.

## Consola del Configurador, módulos y modelo de pago

El Configurador entra por la pestaña **Configurador** de la pantalla de entrada (en el build de demo es la tercera pestaña; en un build normal es el enlace "Acceso del Configurador" debajo del formulario). Más adelante se puede separar en otro enlace o esconder: hoy es solo una pestaña.

Qué hace la consola:

- **Módulos activables**: Sueldos en el legajo, Rendimiento y Liquidación de sueldos. Rendimiento y Liquidación necesitan Sueldos en el legajo (al prender uno se prende la base; al apagar la base se apagan los que dependen).
- **Modelo de pago** de la pyme: *por jornada* (sueldo mensual) o *por hora*.

Lo que se guarda va en `settings/features`. **Solo lo escribe el Configurador**: las reglas de Firestore lo exigen (claim `configurator`) y el administrador de la pyme tiene prohibido escribirlo, aunque lo intente desde la consola del navegador. Un módulo apagado no tiene pantallas y sus datos quedan bloqueados en la base. El administrador de la pyme no ve esta consola ni la lista de módulos: solo ve las pantallas de los que están activos.

Crear la cuenta del Configurador (una vez por instancia):

```bash
npm run create-configurator -- --email vos@tuproveedor.com --key ruta/clave.json
```

La cuenta tiene el claim `configurator` y **ningún rol de la pyme**: entra solo por la pestaña Configurador, no ve datos de la empresa (solo el nombre) y no puede entrar como administrador.

## Módulos: Sueldos, Rendimiento y Liquidación

Los activa el Configurador (consola, pestaña **Configurador**). Todo lo que guardan está bloqueado por las reglas de Firestore mientras el módulo esté apagado, y lo lee **solo el administrador**: nunca el supervisor, ni la propia persona, ni el Configurador.

| Dato | Dónde | Módulo |
|---|---|---|
| Sueldo o valor hora de cada persona, con historial de vigencias, y convenio / obra social / hijos | `employee_pay/{uid}` | Sueldos en el legajo |
| Tarifa de cobro por hora y marca "facturable" de cada proyecto | `project_rates/{código}` | Rendimiento |
| Cargas patronales y horas del mes | `settings/costing` | Rendimiento |
| Parámetros y conceptos de la liquidación | `settings/payroll` | Liquidación |
| Un recibo por persona y mes | `payslips/{uid}_{AAAA-MM}` | Liquidación |
| Período cerrado | `payroll_periods/{AAAA-MM}` | Liquidación |

**Modelo de pago.** *Por jornada*: el legajo guarda un sueldo mensual; el costo por hora es sueldo ÷ horas del mes. *Por hora*: el legajo guarda un valor hora y el sueldo del mes sale de multiplicarlo por las horas normales aprobadas. Las horas extra se valorizan con el recargo de cada tramo en ambos modelos.

**Cierre de período.** Con el mes cerrado, las reglas rechazan crear, cambiar o borrar recibos de ese mes. El administrador puede reabrirlo (queda registrado quién y cuándo).

### Lo que la liquidación NO es

Es una liquidación **asistida**, no una liquidación legal. El motor viene de LiquiSu y se corrigió el SAC (50 % de la mejor remuneración del semestre, proporcional a los meses) y el divisor de las inasistencias (parámetro). Pero:

- **Ganancias es simplificado**: alícuota única sobre el excedente del mínimo no imponible, no la escala progresiva anual.
- Cada convenio puede pedir reglas propias (base del valor hora, adicionales, topes): los divisores y las opciones son parámetros, pero hay que validarlos con el contador.
- Las contribuciones patronales son un porcentaje informativo: no van en el recibo.
- Se usa el sueldo vigente al **final** del mes; un aumento a mitad de mes no se prorratea.

Cada recibo lo dice al pie. Antes de ofrecerlo a un cliente conviene que un contador valide los parámetros por defecto con su convenio.

### Recibo en PDF

El recibo se imprime con el botón "Imprimir / guardar como PDF" del navegador (se oculta todo lo demás y sale en blanco y negro). No hay un generador de PDF propio: es una decisión para no mantener otro motor de documentos.

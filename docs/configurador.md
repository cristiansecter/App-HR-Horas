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
| Rendimiento (módulo activable): costos contra facturación por proyecto, por persona y por mes | Real: costos por proyecto, persona y mes; costo con el sueldo vigente en la fecha de cada registro, el recargo de las horas extra y un % de cargas configurable. Solo administrador y con el módulo activo. La facturación (ingresos y margen) es otro módulo: *Facturación por proyecto* |
| Seguimiento de liquidaciones (módulo activable): anotación del mes, detalle para imprimir o guardar como PDF, publicación para que cada persona vea el suyo, parámetros y conceptos editables, exportación CSV y cierre de período | Real: las novedades (horas normales y extra por tramo, inasistencias injustificadas, vacaciones) salen solas de las horas y licencias aprobadas; el resto se carga a mano. Solo administrador y con el módulo activo |
| Asignar proyectos: el administrador (a cualquiera) y el supervisor (a su equipo) deciden en qué proyectos carga horas cada persona | Real: grilla personas × proyectos, "asignar a todos" y filtro de la carga de horas; las reglas lo exigen aunque se intente saltear la pantalla |
| Organigrama (Configuración): árbol de arriba hacia abajo por niveles (administradores en una fila, supervisores en otra y empleados en otra, unidos con líneas), con arrastrar y soltar y panel "reporta a" | Real: cambia el supervisor de cada persona (solo el administrador). Los roles siguen siendo del Configurador |
| Reportes: planilla del mes con horas aprobadas, avisos de lo que falta y descarga en Excel/CSV | Real: el resumen y el detalle suman lo mismo; lo no aprobado no entra y se avisa.  |
| Reglas de seguridad de Firestore | Reales y probadas (110 pruebas de reglas y 194 de lógica) |
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

El Configurador entra por la pestaña **Configurador** de la pantalla de entrada (en el build de demo es la tercera pestaña; en un build normal es el enlace "Acceso del Configurador" debajo del formulario) y **solo con su cuenta de Google**: no hay usuario ni contraseña para esta consola. El único correo autorizado está en `src/config/configurator.ts` y en `isConfigurator()` de `firestore.rules`; las reglas exigen ese correo exacto, verificado, en una sesión iniciada con Google.

Qué hace la consola:

- **Módulos activables**: Sueldos en el legajo, Rendimiento, Seguimiento de liquidaciones, Facturación por proyecto y Dedicación y proyección. Rendimiento y Seguimiento necesitan Sueldos en el legajo; Facturación por proyecto necesita Rendimiento; Dedicación y proyección no necesita ninguno. Al prender uno se prende su base y al apagar la base se apagan los que dependen. Los atajos "Consultoría" y "Fábrica o producción por jornada" prenden o apagan el conjunto típico de cada rubro.
- **Permisos**: *Los supervisores ven los sueldos de su equipo* (apagado por defecto; necesita Sueldos en el legajo, y se apaga solo si se apaga ese módulo). Con el permiso, cada supervisor tiene una pantalla de solo lectura "Sueldos del equipo" con el sueldo vigente y el historial de las personas que tiene a cargo. No ve a otros equipos, ni su propio sueldo, ni costos, ni liquidaciones, ni el Directorio. Las reglas de Firestore lo hacen cumplir (`settings/features.supervisorsSeePay`).
- **Corregir sueldos**: en la ficha, cada vigencia tiene lápiz (corrige fecha y monto) y tachito (la borra, con confirmación). Solo el administrador; la carga original se conserva y queda anotado quién corrigió y cuándo. Rendimiento recalcula los costos con el valor corregido; los recibos ya publicados no cambian.
- **Modelo de pago** de la pyme: *por jornada* (sueldo mensual) o *por hora*.

Lo que se guarda va en `settings/features`. **Solo lo escribe el Configurador**: el administrador de la pyme tiene prohibido escribirlo, aunque lo intente desde la consola del navegador. Un módulo apagado no tiene pantallas y sus datos quedan bloqueados en la base. El administrador de la pyme no ve esta consola ni la lista de módulos: solo ve las pantallas de los que están activos.

**No uses el correo del Configurador como usuario de una empresa.** Al entrar con Google, Firebase puede vincular las dos cuentas y descartar la contraseña de la cuenta común. Los scripts de alta lo rechazan.

### Facturación por proyecto
- **Por hora**: tarifa general del proyecto y, si hace falta, una tarifa distinta para algunas personas (por ejemplo un consultor senior). La tarifa de la persona reemplaza a la general solo para ella.
- **Precio cerrado**: valor total y horas estimadas. Cada mes se reconoce ingreso proporcional a las horas aprobadas (valor total ÷ horas estimadas por hora) y **nunca más que el valor total**: pasadas las horas estimadas, lo que se siga trabajando es costo sin ingreso y la pantalla lo avisa.
- **Interno**: tiene costo y no genera ingreso.
- Con el módulo apagado, Rendimiento muestra solo costos (sin ingresos, margen ni tarifas). Los documentos viejos con `billable`/`hourlyRate` se leen como "por hora" o "interno".

### Dedicación y proyección
- **Asignar proyectos**: con el módulo activo, cada asignación lleva un **porcentaje de dedicación** (1 a 100, por defecto 100 = tiempo completo). Si una persona suma más de 100 % entre proyectos, se avisa (no se bloquea).
- **Proyección** (administrador: toda la empresa; supervisor: su equipo; sin importes): por cada proyecto con personas asignadas y por mes, se reparten horas entre ellas. Para cada persona muestra el % asignado, las **horas disponibles** (su jornada menos feriados y licencias aprobadas), las **horas proyectadas** (editables), las **trabajadas** (solo aprobadas) y el **desvío**.
- Atajos para cargar: *Horas a repartir* + "Repartir según %" o "Partes iguales" (de a media hora, sin perder horas por redondeo), y "Sugerir por disponibilidad" (% × horas disponibles). Cada proyecto se guarda con su botón.
- Datos: `assignments/{proyecto}_{persona}.allocationPct` y `projections/{proyecto}_{persona}_{AAAA-MM}` ({hours}). Solo se proyecta a personas con el proyecto asignado; la persona puede leer su propia proyección.
- No depende de ningún otro módulo. El atajo "Consultoría" lo prende junto con Facturación por proyecto.

## Módulos: Sueldos, Rendimiento y Seguimiento de liquidaciones

Los activa el Configurador (consola, pestaña **Configurador**). Todo lo que guardan está bloqueado por las reglas de Firestore mientras el módulo esté apagado, y lo lee **solo el administrador**: nunca el supervisor, ni la propia persona, ni el Configurador.

| Dato | Dónde | Módulo |
|---|---|---|
| Sueldo o valor hora de cada persona, con historial de vigencias, y convenio / obra social / hijos | `employee_pay/{uid}` | Sueldos en el legajo |
| Permiso de los supervisores para ver sueldos de su equipo | `settings/features.supervisorsSeePay` | Sueldos en el legajo |
| Cómo se factura cada proyecto: por hora (tarifa general + tarifas por persona), precio cerrado (valor total + horas estimadas) o interno | `project_rates/{código}` | Facturación por proyecto |
| Cargas patronales y horas del mes | `settings/costing` | Rendimiento |
| Porcentaje de dedicación de cada asignación y horas proyectadas por proyecto, persona y mes | `assignments/*.allocationPct`, `projections/{proyecto}_{persona}_{mes}` | Dedicación y proyección |
| Parámetros y conceptos del seguimiento | `settings/payroll` | Seguimiento de liquidaciones |
| Un detalle por persona y mes (con datos congelados y estado de publicación) | `payslips/{uid}_{AAAA-MM}` | Seguimiento de liquidaciones |
| Período cerrado | `payroll_periods/{AAAA-MM}` | Seguimiento de liquidaciones |

**Modelo de pago.** *Por jornada*: el legajo guarda un sueldo mensual; el costo por hora es sueldo ÷ horas del mes. *Por hora*: el legajo guarda un valor hora y el sueldo del mes sale de multiplicarlo por las horas normales aprobadas. Las horas extra se valorizan con el recargo de cada tramo en ambos modelos.

**Cierre de período.** Con el mes cerrado, las reglas rechazan crear, cambiar o borrar recibos de ese mes. El administrador puede reabrirlo (queda registrado quién y cuándo).

### Cómo se presenta: anotación y seguimiento, no liquidación legal

El módulo se ofrece como una **forma de anotación y seguimiento digital**: para que la empresa lleve y vea en la plataforma los números de cada mes. **No es una herramienta de liquidación legal y no reemplaza el trabajo del contador.** Cada detalle impreso lo aclara al pie y la pantalla lo dice en el encabezado.

Alcance y límites:

- **Ganancias es simplificado**: alícuota única sobre el excedente del mínimo no imponible, no la escala progresiva anual.
- Cada convenio puede pedir reglas propias (base del valor hora, adicionales, topes): los divisores y las opciones son parámetros editables, pero conviene validarlos con el contador de cada cliente.
- El SAC usa el 50 % de la mejor remuneración del semestre, proporcional a los meses; el divisor de las inasistencias es un parámetro.
- Las contribuciones patronales son un porcentaje informativo: no van en el detalle de la persona.
- Se usa el sueldo vigente al **final** del mes; un aumento a mitad de mes no se prorratea.

### Mis liquidaciones (cada persona ve la suya)

El administrador **publica** las liquidaciones de un mes cuando están revisadas y la propia persona ve solo la suya en *Mis liquidaciones*. Las reglas impiden pedir las no publicadas o las de otras personas. Si un detalle se vuelve a guardar con cambios, queda sin publicar hasta que se publique otra vez. Publicar o retirar la publicación se puede hacer con el período cerrado.

Cada detalle guarda una copia de los datos de la persona (nombre, CUIL, legajo, puesto, ingreso, convenio): si después cambia su ficha, el detalle de ese mes no cambia.

### Recibo en PDF

El detalle se imprime con el botón "Imprimir / guardar como PDF" del navegador (se oculta todo lo demás y sale en blanco y negro). No hay un generador de PDF propio: es una decisión para no mantener otro motor de documentos.

## Cargar horas y licencias por otra persona

Además de que cada persona cargue lo suyo, **el supervisor (a su equipo) y el administrador (a cualquiera)** pueden cargar por ella, por ejemplo si no puede hacerlo.

- **Horas:** en "Cargar horas" aparece "Cargar para". Las horas quedan a nombre de la persona y anotadas como cargadas por quien las cargó. "Cargar y enviar" las deja pendientes en Aprobaciones; "Cargar y aprobar" las carga y las aprueba en un paso. El proyecto tiene que estar asignado a la persona (si la empresa exige asignación). Quien carga por otro puede usar días anteriores sin el límite de la ventana, pero no fechas futuras.
- **Licencias:** en Aprobaciones, "Registrar licencia de una persona" (vacaciones, enfermedad, estudio, asunto personal o ausencia injustificada). Queda aprobada desde el registro, aparece en el calendario del equipo y la persona la ve marcada como registrada por un superior. No deja registrar dos veces el mismo período.
- Lo hace cumplir Firestore (reglas `time_entries` y `leave_requests`), no solo la pantalla: un supervisor no puede cargar por alguien de otro equipo, ni usar un proyecto no asignado a la persona, ni dejar el registro como aprobado de entrada.

## Documentos: certificados y recibos

Pantalla **Documentos** (para todos los roles), un repositorio simple dentro de la misma base.

- **Certificados** (por ejemplo médicos): los sube cada persona (los suyos), su supervisor (los suyos y los de su equipo) y el administrador (de cualquiera). Los leen la persona, **su supervisor** (aprueba la licencia y necesita verificarlo) y el administrador; nadie más. Al solicitar una licencia (o al registrarla por otra persona) se puede adjuntar el certificado, y quien aprueba lo abre desde la fila de la licencia.
- **Recibos**: los sube solo el administrador, con el mes que corresponde. Los leen la persona y el administrador; **el supervisor no los ve** (tienen importes).
- Borra quien lo subió o el administrador. Los documentos no se editan: para corregir uno se borra y se vuelve a subir.
- **Límite de tamaño:** 700 KB por archivo. Se aceptan PDF y fotos JPG, PNG o WebP. Las fotos se achican solas a JPG para que entren; un PDF más pesado se rechaza con un aviso. SVG y otros formatos quedan afuera.
- **Dónde se guardan:** los archivos van dentro de Firestore (`documents` para los datos y `document_files` para el contenido, aparte para no bajarlo al listar). Cloud Storage de Firebase ya no está en el plan gratuito; cuando la empresa pase a Blaze se puede migrar a Storage sin cambiar lo que ve la gente. En el plan gratuito, Firestore da 1 GiB: con archivos de unos 300 KB alcanza para miles de documentos.

## Proyectos asignados y organigrama

**Asignar proyectos.** Por defecto cada persona carga horas **solo en los proyectos que le asignaron**. El administrador asigna a cualquiera (incluido él) y el supervisor, a las personas que tiene a cargo, desde *Asignar proyectos*. Las reglas de Firestore lo exigen: un empleado no puede cargar horas en un proyecto sin asignación aunque lo intente por fuera de la pantalla. Corregir otros datos de un registro viejo sigue funcionando aunque después se le quite el proyecto; lo que se bloquea es cargar horas nuevas ahí.

Una empresa chica puede preferir no asignar nada: en *Configuración → Jornada y horas extra* se apaga "Cada persona carga horas solo en los proyectos que le asignan" y todos cargan en cualquier proyecto activo. El provisionamiento deja el valor en `assigned`; `--project-access open` lo deja abierto. Una instancia que ya existía y no tiene el campo se comporta como `assigned`.

**Organigrama.** En *Configuración → Organigrama* el administrador ve el árbol de la empresa (administrador → supervisores → empleados) y cambia a quién reporta cada persona: arrastrándola sobre su nuevo supervisor, o haciendo clic en ella y eligiendo "Reporta a". No deja formar círculos ni poner a alguien bajo un empleado. Quien aprueba las horas y licencias de una persona, y quien le asigna proyectos, es su supervisor.

**Qué no se cambia desde acá: los roles.** Quién es administrador o supervisor lo asigna el Configurador con `npm run set-role` (el rol vive en el token de la persona y solo se puede escribir con el Admin SDK). Hacerlo desde la aplicación requiere el plan Blaze y una Cloud Function; queda como mejora para ese momento.

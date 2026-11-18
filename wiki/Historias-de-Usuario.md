# Historias de usuario

Las historias y comportamientos de esta página se documentan a partir de las validaciones y funciones encontradas en los módulos JavaScript del repositorio.

## HU-01 — Registro de participante

**Como** visitante, **quiero** crear una cuenta de participante, **para** acceder a los torneos y realizar pronósticos.

**Reglas y validaciones observadas**
- Nombre completo de mínimo 3 caracteres.
- Documento numérico de 6 a 10 dígitos, sin puntos.
- Correo con formato válido y que no esté registrado.
- Contraseña de mínimo 8 caracteres, con al menos una letra y un número.
- Confirmación de contraseña igual a la contraseña ingresada.
- La cuenta se crea con rol participante y saldo inicial de 0 créditos.

**Criterios de aceptación**
1. Si los datos cumplen las validaciones, se crea la cuenta.
2. Si el correo ya existe, el sistema informa el error y no duplica la cuenta.
3. Si hay campos inválidos, se muestran los errores correspondientes.
4. La cuenta nueva no recibe créditos automáticamente.

## HU-02 — Inicio de sesión y control por roles

**Como** usuario registrado, **quiero** iniciar y cerrar sesión, **para** utilizar únicamente las funciones permitidas para mi rol.

**Reglas observadas**
- La autenticación de demostración compara correo y contraseña.
- El mensaje de error no distingue si falló el correo o la contraseña.
- Roles implementados: participante, administrador y auditor.
- La sesión vence después de 5 minutos de inactividad.
- Las acciones restringidas verifican el rol antes de ejecutarse.

**Criterios de aceptación**
1. Un usuario válido ingresa y visualiza el menú de su rol.
2. Un usuario inválido recibe un mensaje genérico de credenciales incorrectas.
3. Una sesión inactiva durante más de 5 minutos se cierra.
4. Un usuario sin permisos no puede ejecutar funciones restringidas.

## HU-03 — Asignación inicial de créditos

**Como** administrador, **quiero** asignar créditos iniciales a un participante, **para** habilitar su participación en los pronósticos.

**Reglas observadas**
- Solo el administrador puede realizar la asignación.
- El participante debe existir y tener rol participante.
- La cantidad debe ser un entero positivo.
- La asignación inicial solo puede aplicarse una vez por participante.
- Se registra cantidad, fecha, administrador responsable y código de operación.

**Criterios de aceptación**
1. Se registra una asignación válida y aumenta el saldo del participante.
2. No se permite asignar cero, negativos ni valores decimales.
3. No se permite repetir la asignación inicial.
4. La operación queda en el historial.

## HU-04 — Crear torneo

**Como** administrador, **quiero** crear torneos deportivos, **para** organizar los eventos disponibles en la plataforma.

**Reglas observadas**
- Nombre de mínimo 3 caracteres.
- Deportes disponibles: fútbol, baloncesto, voleibol y fútbol sala.
- Se requiere fecha de inicio y fecha de fin.
- La fecha final no puede ser anterior a la inicial.
- El torneo se crea en estado programado y registra quién lo creó.

**Criterios de aceptación**
1. El administrador puede guardar un torneo con datos válidos.
2. El sistema rechaza fechas incoherentes o datos obligatorios faltantes.
3. El torneo aparece en el listado.

## HU-05 — Crear evento deportivo 1X2

**Como** administrador, **quiero** registrar un partido dentro de un torneo, **para** habilitar pronósticos con costo y premio en créditos.

**Reglas observadas**
- El evento pertenece a un torneo existente.
- Se requiere equipo local y visitante, que deben ser distintos.
- Las opciones son Local (1), Empate (X) y Visitante (2).
- Se define apertura, cierre e inicio del partido.
- La regla temporal es: apertura < cierre ≤ inicio del partido.
- Costo y premio deben ser enteros positivos.
- El estado depende de la hora: programado, abierto o cerrado.

**Criterios de aceptación**
1. Un administrador registra un evento válido asociado a un torneo.
2. No se aceptan equipos iguales ni fechas fuera del orden permitido.
3. El evento presenta las tres opciones 1X2, el costo, el premio y sus fechas.

## HU-06 — Consultar torneos y eventos

**Como** usuario, **quiero** consultar los torneos y sus eventos, **para** conocer los partidos y el estado de los periodos de pronóstico.

**Reglas observadas**
- Los eventos se agrupan dentro de su torneo.
- Se ordenan por fecha de inicio del partido.
- Se muestra estado, equipos, fecha del partido, cierre, costo y premio.
- La vista de participante muestra también su saldo disponible.
- Las fechas se presentan en hora de Colombia.

**Criterios de aceptación**
1. El usuario puede consultar los torneos registrados.
2. Cada torneo muestra sus eventos asociados.
3. El usuario identifica si un evento está programado, abierto o cerrado.

## HU-07 — Registrar pronóstico en evento abierto

**Como** participante, **quiero** seleccionar Local, Empate o Visitante en un evento abierto, **para** registrar mi predicción del resultado.

**Reglas observadas**
- Solo un participante autenticado puede pronosticar.
- El evento debe existir y estar abierto.
- La opción elegida debe pertenecer al evento.
- Solo se admite un pronóstico por participante y evento.
- El sistema solicita confirmar la selección antes de registrarla.

**Criterios de aceptación**
1. El participante puede seleccionar una de las opciones 1X2 durante el periodo abierto.
2. No se registra un pronóstico antes de la apertura ni después del cierre.
3. No se permite un segundo pronóstico para el mismo evento.

## HU-08 — Débito único y control de saldo

**Como** participante, **quiero** que el costo se descuente una sola vez al confirmar mi pronóstico, **para** evitar cobros duplicados y saldos negativos.

**Reglas observadas**
- Se verifica el saldo antes de confirmar.
- El costo se registra como movimiento de débito negativo.
- El pronóstico, el débito y la llave de idempotencia se guardan en la misma operación de persistencia.
- Si se reenvía una solicitud con la misma llave, se devuelve el pronóstico original y no se vuelve a cobrar.
- No se permite que el saldo sea insuficiente.

**Criterios de aceptación**
1. Con saldo suficiente, el pronóstico se registra y se descuenta el costo.
2. Con saldo insuficiente, no se registra el pronóstico ni el débito.
3. Un reintento de la misma solicitud no genera un segundo débito.
4. El saldo nunca debe quedar negativo por el registro del pronóstico.

## HU-09 — Consultar saldo y movimientos

**Como** participante, **quiero** consultar mi saldo y los movimientos asociados, **para** verificar el uso de mis créditos.

**Como** auditor, **quiero** consultar los movimientos de los participantes, **para** revisar la trazabilidad de las operaciones.

**Reglas observadas**
- El saldo se calcula sumando los movimientos registrados.
- El participante solo puede consultar sus propios movimientos.
- El auditor puede consultar movimientos de los participantes.
- Se muestra fecha, tipo, cantidad, código de operación y detalle.
- Los movimientos contemplan asignación inicial, débito por pronóstico y premio (tipo previsto en el modelo).

**Criterios de aceptación**
1. El saldo coincide con la suma del historial.
2. El participante no puede consultar movimientos de otra persona.
3. El auditor puede seleccionar un participante y consultar su historial.
4. Cada movimiento muestra su referencia de operación.

## HU-10 — Cierre automático del periodo de pronósticos

**Como** administrador y participante, **quiero** que los eventos cambien de estado automáticamente al llegar su hora de cierre, **para** impedir pronósticos fuera del plazo.

**Reglas observadas**
- Antes de la apertura: programado.
- Desde la apertura y antes del cierre: abierto.
- Desde la hora de cierre: cerrado.
- La aplicación revisa vencimientos cada 10 segundos y también antes de acciones relevantes.
- Los eventos cerrados dejan de aceptar pronósticos.

**Criterios de aceptación**
1. El evento cambia a abierto al llegar la apertura.
2. El evento cambia a cerrado al llegar el cierre.
3. Una vez cerrado, los controles de pronóstico quedan bloqueados y el registro es rechazado.
4. El estado se actualiza sin que el usuario tenga que recargar manualmente la página.

## Consideraciones

- Los créditos son unidades internas de participación, sin valor monetario: no se compran, venden ni canjean por dinero.
- En el código se indica que los pronósticos no se editan ni eliminan.
- La HU-10 también aparece asociada a la regla de no modificación/eliminación en un comentario de diseño; el comportamiento implementado principal de esa HU es el cierre automático.

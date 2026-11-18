# Pruebas y criterios de aceptación

Esta guía propone pruebas manuales basadas en los controles y reglas que aparecen en el código. No representa un reporte de ejecución automatizada.

## Cuentas de demostración

| Correo | Contraseña | Rol / estado |
|---|---|---|
| laura@demo.co | Demo2026 | Participante con 100 créditos |
| andres@demo.co | Demo2026 | Participante sin asignación inicial |
| admin@matchpoint.co | Admin2026 | Administrador |
| auditor@matchpoint.co | Audit2026 | Auditor |

Los datos de demostración se crean cuando la aplicación no encuentra una base local inicializada. Si ya existen datos en el navegador, puede ser necesario limpiar el almacenamiento local para volver a generarlos.

## Casos de prueba sugeridos

| ID | Escenario | Resultado esperado |
|---|---|---|
| CP-01 | Registrar participante con todos los datos válidos | Cuenta creada con rol participante y saldo 0 |
| CP-02 | Registrar con documento no numérico o longitud inválida | Registro rechazado con mensaje de validación |
| CP-03 | Registrar un correo ya existente | Registro rechazado sin duplicar usuario |
| CP-04 | Iniciar sesión con credenciales incorrectas | Mensaje genérico de credenciales incorrectas |
| CP-05 | Mantener sesión inactiva más de 5 minutos | Sesión cerrada al comprobar la actividad/vencimiento |
| CP-06 | Intentar crear torneo como participante | Acción denegada por rol |
| CP-07 | Crear torneo con fechas válidas | Torneo guardado en estado programado |
| CP-08 | Crear torneo con fecha final anterior a la inicial | Formulario rechazado |
| CP-09 | Crear evento con apertura posterior al cierre | Evento rechazado |
| CP-10 | Crear evento con equipo local igual al visitante | Evento rechazado |
| CP-11 | Consultar eventos de un torneo | Eventos listados con fecha, estado, costo y premio |
| CP-12 | Registrar pronóstico en evento programado | Operación rechazada |
| CP-13 | Registrar pronóstico en evento abierto con saldo suficiente | Pronóstico guardado y costo debitado |
| CP-14 | Registrar pronóstico con saldo insuficiente | No se guarda pronóstico ni débito |
| CP-15 | Intentar pronosticar dos veces el mismo evento | Segundo pronóstico rechazado |
| CP-16 | Reintentar el mismo envío después de un corte simulado | Se recupera el pronóstico original sin segundo débito |
| CP-17 | Consultar saldo e historial | Saldo igual a la suma de movimientos |
| CP-18 | Participante intenta consultar movimientos de otro | Acceso denegado |
| CP-19 | Auditor consulta movimientos de un participante | Historial visible con códigos de operación |
| CP-20 | Alcanzar la hora de cierre del evento | Evento cerrado y controles de pronóstico bloqueados |

## Datos de demostración incluidos

La inicialización crea un torneo de ejemplo de fútbol y eventos en diferentes estados temporales para probar la interfaz. También crea un movimiento de asignación y un pronóstico de ejemplo para la cuenta de Laura.

## Limitaciones

- Los casos anteriores son una guía de verificación; no se afirma que se hayan ejecutado todos.
- El almacenamiento es local por navegador, por lo que los datos no se sincronizan entre usuarios o dispositivos.
- No se identificó una integración con una API deportiva externa ni un proceso de liquidación automática de premios en la versión inspeccionada.
- El modelo contempla movimientos de tipo premio, pero el código revisado no muestra un flujo completo de resolución de resultados y acreditación automática de premios.

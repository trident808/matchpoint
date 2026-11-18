# Reglas de negocio

## Roles y permisos

| Funcionalidad | Participante | Administrador | Auditor |
|---|:---:|:---:|:---:|
| Registrarse | Sí | No aplica | No aplica |
| Iniciar/cerrar sesión | Sí | Sí | Sí |
| Consultar torneos y eventos | Sí | Sí | Sí |
| Crear torneos | No | Sí | No |
| Crear eventos | No | Sí | No |
| Asignar créditos iniciales | No | Sí | No |
| Registrar pronósticos | Sí | No | No |
| Consultar saldo propio | Sí | No aplica | No aplica |
| Consultar movimientos propios | Sí | No aplica | No aplica |
| Consultar movimientos de participantes | No | No | Sí |

## Créditos

- Los créditos no representan dinero.
- No se compran, venden ni canjean por dinero.
- Un participante comienza con saldo 0.
- El administrador puede realizar una sola asignación inicial por participante.
- La cantidad asignada debe ser un entero positivo.
- El saldo se calcula sumando los movimientos.
- Un pronóstico genera un débito por el costo definido en el evento.
- No se permite registrar un pronóstico si el saldo no cubre el costo.

## Eventos

- Cada evento pertenece a un torneo.
- Las opciones de pronóstico son fijas: Local (1), Empate (X) y Visitante (2).
- La apertura debe ser anterior al cierre.
- El cierre debe ser igual o anterior al inicio del partido.
- El evento está programado antes de la apertura, abierto durante el periodo y cerrado desde la hora de cierre.
- Un evento cerrado no admite nuevos pronósticos.

## Pronósticos

- Solo los participantes autenticados pueden pronosticar.
- Se admite un pronóstico por participante y evento.
- El pronóstico no se puede modificar ni eliminar desde la funcionalidad revisada.
- El débito se asocia al pronóstico mediante un código de operación.
- Una solicitud repetida con la misma llave de idempotencia no vuelve a descontar créditos.

## Sesiones y seguridad de la demostración

- La sesión se cierra después de 5 minutos sin actividad.
- La aplicación comprueba permisos antes de ejecutar funciones restringidas.
- Los datos y la sesión se almacenan en el navegador.
- El hash de contraseña del código no convierte esta demostración en un sistema de autenticación de servidor. Para producción se necesitaría autenticación y almacenamiento seguros del lado del servidor.

## Tiempo

- La zona horaria utilizada para presentar y procesar fechas es `America/Bogota` (UTC−5).
- La aplicación revisa el cierre de eventos cada 10 segundos y antes de registrar pronósticos o listar eventos.

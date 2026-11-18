# MatchPoint — Wiki del proyecto

Bienvenido a la documentación de MatchPoint, una plataforma web académica de pronósticos deportivos que utiliza créditos internos sin valor monetario.

## Objetivo

Permitir que participantes registrados consulten torneos y eventos deportivos, realicen un pronóstico 1X2 dentro del periodo habilitado y consulten sus créditos y movimientos. Los administradores gestionan torneos, eventos y asignaciones iniciales. El auditor consulta los movimientos para verificar su trazabilidad.

## Alcance funcional documentado

- Registro e inicio de sesión por roles.
- Asignación inicial de créditos por parte del administrador.
- Creación y consulta de torneos y eventos deportivos.
- Pronósticos 1X2: local, empate o visitante.
- Débito de créditos al registrar un pronóstico.
- Consulta del saldo y del historial de movimientos.
- Auditoría de movimientos.
- Apertura y cierre automático de eventos según fechas y horas.

## Navegación de esta Wiki

- [Historias de usuario](Historias-de-Usuario)
- [Arquitectura y módulos](Arquitectura)
- [Reglas de negocio](Reglas-de-Negocio)
- [Pruebas y criterios de aceptación](Pruebas)

## Estado técnico observado

La versión revisada utiliza HTML, CSS y JavaScript, y guarda los datos en `localStorage` del navegador. Por tanto, esta entrega corresponde a una implementación de demostración local: no se debe presentar como una aplicación con base de datos centralizada ni autenticación de servidor.

## Distribución del trabajo reflejada en el código

| Módulo | Responsable indicado en el código | Historias |
|---|---|---|
| Cuentas, acceso y créditos | Integrante 1 | HU-01, HU-02, HU-03, HU-09 |
| Torneos y eventos | Integrante 2 | HU-04, HU-05, HU-06, HU-10 |
| Pronósticos | Integrante 3 | HU-07, HU-08 |
| Integración | Módulo compartido | Enrutamiento, menú por rol, eventos y datos de demostración |

Los nombres personales de los integrantes no aparecen en los archivos revisados; por eso se conservan las denominaciones que utiliza el código.

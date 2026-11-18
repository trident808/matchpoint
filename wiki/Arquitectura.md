# Arquitectura y módulos

## Tecnologías observadas

- HTML para la estructura de la interfaz.
- CSS para los estilos compartidos.
- JavaScript para lógica, validaciones, navegación y eventos.
- `localStorage` como almacenamiento persistente local del navegador.
- Web Crypto API (`crypto.subtle.digest`) para calcular el hash de las contraseñas cuando está disponible, con una alternativa de demostración si no lo está.

No se identificó en la versión revisada una API, servidor o base de datos centralizada.

## Estructura del repositorio

```text
matchpoint/
├── README.md
├── index.html
├── matchpoint/
│   ├── css/
│   │   └── estilos.css
│   └── js/
│       ├── core.js
│       ├── cuentas.js
│       ├── torneos.js
│       ├── pronosticos.js
│       └── app.js
└── wiki/
    ├── Home.md
    ├── Historias-de-Usuario.md
    ├── Arquitectura.md
    ├── Reglas-de-Negocio.md
    └── Pruebas.md
```

## Responsabilidad de los módulos

### core.js — Núcleo compartido
- Define el almacén de datos y la estructura inicial.
- Carga y guarda información en `localStorage`.
- Proporciona utilidades para identificadores, escape de HTML, hash de contraseñas, fechas y códigos de operación.
- Define los registros compartidos `views`, `forms` y `actions`.
- Centraliza los errores de aplicación y de red simulada.

### cuentas.js — Integrante 1
- Registro de participantes.
- Inicio y cierre de sesión.
- Control de roles y vencimiento por inactividad.
- Asignación inicial de créditos.
- Cálculo de saldo y consulta de movimientos.

### torneos.js — Integrante 2
- Creación de torneos.
- Creación de eventos deportivos 1X2.
- Listado de torneos y eventos.
- Cálculo de estado de eventos según apertura y cierre.
- Cierre automático de periodos vencidos.

### pronosticos.js — Integrante 3
- Validación de pronósticos.
- Selección de opción Local, Empate o Visitante.
- Verificación de saldo suficiente.
- Registro del débito asociado.
- Control de reintentos mediante llave de idempotencia.

### app.js — Integración
- Construye el menú según el rol.
- Enruta las vistas.
- Gestiona eventos de formularios y botones.
- Actualiza la sesión y revisa cierres de eventos cada 10 segundos.
- Carga datos de demostración cuando no hay datos guardados.

## Orden de carga

El archivo `index.html` carga primero `core.js`, después los módulos de cuentas, torneos y pronósticos, y finalmente `app.js`. Este orden permite que los módulos utilicen las funciones compartidas y que la integración encuentre sus vistas, formularios y acciones.

## Flujo general

1. El usuario abre la página.
2. El núcleo carga los datos locales.
3. Si no existen datos, la aplicación crea información de demostración.
4. El usuario inicia sesión.
5. La aplicación identifica su rol y presenta el menú correspondiente.
6. El participante consulta eventos y registra pronósticos; el administrador administra torneos, eventos y créditos; el auditor consulta movimientos.
7. Cada cambio se guarda en el almacenamiento local del navegador.

# Operación de Abarrotes El Pedernal

## Instalación definitiva en una sola tablet

La versión instalada en la tablet no debe apuntar a una Mac ni a una IP privada.
La API y MySQL deben alojarse en un servicio con HTTPS y disponibilidad permanente.
Antes de generar el APK definitivo, sustituye `apiUrl` en
`src/environments/environment.android.ts` por el dominio público de la API.

La tablet conserva una copia de productos, clientes y caja después del primer acceso
correcto. Si pierde internet:

1. El usuario previamente validado puede iniciar sesión en modo sin conexión.
2. Caja permite abrir un turno local y registrar ventas.
3. Cada venta recibe un UUID, se conserva en la tablet y descuenta la existencia local.
4. Al recuperar conexión se abre el turno remoto si hace falta y las ventas se envían
   una sola vez; el servidor rechaza duplicados.
5. Caja no permite cerrar mientras queden ventas por sincronizar.

WhatsApp, timbrado fiscal, respaldos remotos y recargas requieren internet. No borres
los datos de la aplicación ni desinstales el APK cuando existan ventas pendientes.

## Infraestructura en la nube y costo operativo

Para la operación real se utiliza **Railway** como plataforma de alojamiento. Dentro
del proyecto existen dos servicios:

- **API AbarrotesElPedernal:** ejecuta el backend desarrollado con Node.js y Express,
  autentica usuarios, valida las operaciones y coordina ventas, caja, inventario,
  compras, clientes, fiados, reportes y respaldos.
- **MySQL:** conserva permanentemente la información del negocio. La API se comunica
  con esta base mediante la red privada de Railway; las credenciales se almacenan
  como variables protegidas y no se incluyen en el código ni en la aplicación.

La tablet se conecta mediante HTTPS al dominio público de la API. La API procesa la
solicitud y consulta o actualiza MySQL. Este diseño evita depender de una computadora
encendida dentro del establecimiento y permite utilizar el sistema desde cualquier
red con acceso a Internet.

Cuando la conexión se interrumpe, la tablet mantiene disponibles el usuario
previamente validado, el catálogo, los clientes y el estado de caja. Las ventas se
guardan localmente con un identificador único y se sincronizan al recuperar conexión,
evitando su registro duplicado. Las funciones externas, como WhatsApp, recargas y
operaciones fiscales, esperan hasta que vuelva Internet.

Railway ofrece actualmente una prueba limitada por tiempo o crédito. Al concluirla,
la empresa deberá mantener un plan activo para conservar la API, MySQL y la
sincronización en línea. Antes de la entrega deben acordarse:

1. El responsable y propietario de la cuenta de Railway.
2. El método de pago y el plan autorizado por la empresa.
3. El resguardo de las credenciales administrativas.
4. La supervisión del consumo y disponibilidad de los servicios.
5. La programación y revisión periódica de respaldos.

Si el servicio se suspende, la tablet puede conservar temporalmente las ventas
offline, pero no podrá sincronizarlas ni utilizar las funciones que requieren el
servidor hasta que Railway vuelva a estar activo.

### Despliegue recomendado

El backend incluye `Dockerfile` y `railway.json`. En Railway:

1. Crea un proyecto y agrega MySQL.
2. Conecta este repositorio completo; `railway.json` utilizará `backend/Dockerfile`.
3. Define `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` y `DB_NAME` usando las
   variables del servicio MySQL.
4. Define `JWT_SECRET` con una cadena aleatoria extensa y `FRONTEND_URL` con
   `http://localhost,https://localhost,capacitor://localhost`.
5. Inicializa el esquema con `npm run init-db`, crea los usuarios y activa respaldos
   automáticos del proveedor.
6. Genera un dominio HTTPS, colócalo en `environment.android.ts`, ejecuta
   `npm run android:sync` y genera el APK firmado.

## Arranque diario en desarrollo local

La Mac tiene registrados MySQL y la API como servicios de inicio automático. La API
se recupera sola si llega a cerrarse. Para comprobarla desde cualquier equipo de la
red del negocio abre:

```bash
http://192.168.120.230:3000/api/health
```

Debe aparecer un estado `ok`. La Mac debe permanecer encendida, conectada a la red
del negocio y con la dirección `192.168.120.230` reservada en el módem/router.

`npm run dev:all` sigue disponible para trabajar en la versión web durante el desarrollo.

## Verificación

```bash
npm run verify
npm run build
```

`verify` comprueba TypeScript, sintaxis del servidor y conexión real de login, clientes, caja, compras, reportes, estadísticas, respaldos y bitácora. La compilación productiva queda en `www/`.

## Flujo diario recomendado

1. La cajera abre su turno con el fondo inicial.
2. Registra las ventas desde Caja. Los importes se calculan en el servidor y el inventario se descuenta dentro de la misma transacción.
3. El gerente recibe mercancía desde Compras. Esto aumenta existencias y actualiza el último costo.
4. Las cancelaciones se realizan desde Reportes y requieren perfil Administrador o Gerente. Los productos regresan al inventario y queda registro en caja y bitácora.
5. La cajera captura el efectivo contado y cierra el turno. El sistema conserva esperado, contado y diferencia.
6. El administrador descarga un respaldo SQL al terminar el día.

## Funciones profesionales

- **Código de barras:** en Caja, enfoca “Escanear código”, utiliza el lector y presiona Enter. El lector actúa como teclado.
- **Venta suspendida:** conserva el carrito sin descontar inventario; puede recuperarse desde la misma Caja.
- **Pago mixto:** distribuye el total entre efectivo, tarjeta y transferencia. La API rechaza diferencias.
- **Modo sin conexión:** una venta sin red se guarda con UUID único y se sincroniza al reconectar. Caja no puede cerrarse mientras existan ventas pendientes.
- **Cortes:** Corte X es informativo y no cierra; Corte Z se imprime al cerrar y contiene diferencia de efectivo.
- **Tickets:** desde Reportes puede imprimirse o reimprimirse el ticket térmico de una venta.
- **Devoluciones:** Administrador o Gerente puede devolver partidas parciales desde Reportes; el inventario y reembolso se ajustan dentro de una transacción.
- **Lotes y caducidad:** se capturan al recibir Compras. Inventario alerta a 30 días y resalta vencidos o próximos a 7 días.
- **Mermas y conteo:** Inventario permite registrar merma con motivo y ajustar existencias mediante conteo físico auditable.
- **Pedido sugerido:** Compras propone cantidades para productos iguales o inferiores al stock mínimo.
- **Promociones:** el módulo Promociones administra porcentaje, precio especial, 2×1 y 3×2; el servidor calcula el descuento.
- **Fiados:** se seleccionan clientes existentes, se respeta su crédito disponible y los abonos se registran en Caja.
- **Seguridad:** bloqueo por intentos, cambio de contraseña, sesión vencida y cierre por 30 minutos de inactividad.
- **Apariencia y accesibilidad:** tema claro, oscuro o automático, contraste adaptado, mensajes de estado y controles táctiles.

## Respaldos

- El botón **Descargar respaldo MySQL** usa `mysqldump` y protege todas las tablas.
- Conserva copias fuera de la computadora de caja.
- Antes de restaurar, crea una copia nueva.
- La restauración requiere un administrador, archivo `.sql`, confirmación escrita y confirmación visual.
- Configura `OFFSITE_BACKUP_DIR` con la ruta de un disco externo o carpeta sincronizada
  para crear una segunda copia automática. El respaldo se considera fallido si esa
  copia configurada no puede escribirse.

## Seguridad

- Cambia inmediatamente las contraseñas iniciales desde **Mi cuenta**.
- Las contraseñas se almacenan como hash bcrypt en MySQL.
- Cinco accesos fallidos bloquean nuevos intentos durante 15 minutos.
- Una respuesta de sesión vencida limpia la sesión local automáticamente.
- En producción utiliza HTTPS, un `JWT_SECRET` aleatorio y acceso restringido a MySQL.

## CFDI

El control fiscal consulta ventas y compras reales. La emisión permanece bloqueada mientras no estén configuradas estas variables en `backend/.env`:

```text
PAC_PROVIDER=
PAC_API_URL=
PAC_API_KEY=
```

Contratar un PAC no es sustituible con código local. Después de elegir proveedor debe implementarse su contrato de API específico y realizar pruebas en su ambiente de pruebas antes de emitir CFDI reales.

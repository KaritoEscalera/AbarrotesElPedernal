# Operación de Abarrotes El Pedernal

## Arranque diario

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

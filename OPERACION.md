# Operación de Abarrotes El Pedernal

## Arranque diario

Desde la raíz del proyecto ejecuta:

```bash
npm run dev:all
```

El comando comprueba MySQL y levanta la API y Angular. Mantén la terminal abierta. Para detener ambos procesos usa `Ctrl+C`.

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

## Respaldos

- El botón **Descargar respaldo MySQL** usa `mysqldump` y protege todas las tablas.
- Conserva copias fuera de la computadora de caja.
- Antes de restaurar, crea una copia nueva.
- La restauración requiere un administrador, archivo `.sql`, confirmación escrita y confirmación visual.

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

# Versión de entrega

- Producto: Abarrotes El Pedernal
- Versión: 1.0.0
- Fecha de cierre técnico: 26 de julio de 2026
- Frontend: Angular 20 + Ionic 8
- API: Node.js + Express
- Base de datos: MySQL

## Alcance

Punto de venta, caja y cortes, inventario, compras, proveedores, clientes, fiados,
promociones, recargas, devoluciones, estadísticas, reportes, usuarios, bitácora,
respaldos, operación sin conexión y control fiscal interno.

## Exclusiones externas

- Timbrado CFDI hasta contratar y configurar un PAC.
- HTTPS/VPN hasta definir dominio o red de acceso.
- Copia externa hasta configurar `OFFSITE_BACKUP_DIR`.
- Validación física final de lector, impresora y UPS en la tienda.

## Comandos de liberación

```bash
npm run verify
npm test -- --watch=false --browsers=ChromeHeadless
npm run build
```


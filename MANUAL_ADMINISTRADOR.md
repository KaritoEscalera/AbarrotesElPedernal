# Manual de Administrador

## Cada día

- Revisar alertas, cajas abiertas y ventas pendientes.
- Verificar existencias bajas, caducidades, fiados vencidos y recargas.
- Revisar diferencias de Corte Z.
- Confirmar en **Respaldos** que API, MySQL, disco y última copia estén correctos.

## Cada semana

- Verificar la integridad SHA-256 de un respaldo.
- Copiar un respaldo fuera de la Mac.
- Revisar bitácora de cancelaciones, devoluciones, mermas y usuarios.
- Revisar cuentas inactivas y permisos.
- Realizar un conteo físico por familias de productos.

## Usuarios

Cada persona debe tener cuenta propia y el menor permiso necesario. Desactiva
cuentas de quien deje de trabajar. Conserva al menos un Administrador activo.

## Operaciones críticas

Cancelaciones, devoluciones, mermas, conteos y restauraciones deben contener un
motivo real. El historial no se elimina aunque un catálogo sea archivado.

## Respaldo y restauración

Configura `OFFSITE_BACKUP_DIR`. Una restauración solo debe hacerse fuera del horario
de venta, después de crear otra copia y probar el archivo en una base de ensayo.

## Seguridad

- Cambiar contraseñas iniciales.
- Mantener MySQL fuera de internet.
- Usar VPN y HTTPS para acceso remoto.
- Mantener macOS, navegador y dependencias actualizados.
- Proteger la Mac con contraseña, cifrado y UPS.

## CFDI

Sin PAC configurado, el módulo fiscal crea control y borradores, pero no comprobantes
fiscales válidos. No ofrecer timbrado hasta completar pruebas con el PAC contratado.


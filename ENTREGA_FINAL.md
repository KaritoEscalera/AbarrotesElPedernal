# Entrega final y puesta en operación

Este documento debe completarse antes de usar el sistema con dinero e inventario reales.

## Datos de instalación

- Tienda:
- Equipo servidor:
- Dirección IP reservada:
- Equipo de caja:
- Impresora térmica:
- Lector de códigos:
- Responsable administrador:
- Fecha de puesta en operación:
- Versión instalada:

## Aceptación operativa

Marcar cada prueba únicamente después de realizarla con el equipo de la tienda.

- [ ] Inicio de sesión de Administrador, Gerente y Cajera.
- [ ] Los permisos impiden que Cajera acceda a funciones administrativas.
- [ ] Apertura de caja con fondo inicial.
- [ ] Venta en efectivo y cálculo correcto del cambio.
- [ ] Venta con tarjeta y referencia obligatoria.
- [ ] Venta con transferencia y referencia obligatoria.
- [ ] Pago mixto cuya suma coincide exactamente con el total.
- [ ] Venta fiada respetando límite y vencimientos.
- [ ] Abono a fiado reflejado en caja y estado de cuenta.
- [ ] Venta suspendida y recuperación posterior.
- [ ] Dos equipos intentan vender la última unidad; no aparece stock negativo.
- [ ] Doble clic o reenvío de la misma venta no genera dos ventas.
- [ ] Venta sin red queda pendiente y se sincroniza una sola vez.
- [ ] No se permite cerrar caja con ventas pendientes.
- [ ] Cancelación repone inventario y genera bitácora.
- [ ] Devolución parcial repone únicamente la cantidad devuelta.
- [ ] Entrada de mercancía actualiza existencia y costo.
- [ ] Merma y conteo físico generan movimiento auditable.
- [ ] Corte X no cierra la caja.
- [ ] Corte Z registra denominaciones, diferencia y observaciones.
- [ ] Ticket impreso legible con la impresora definitiva.
- [ ] Lector de código agrega el producto correcto.
- [ ] Estadísticas, reportes y exportaciones coinciden con las ventas.

## Continuidad y recuperación

- [ ] MySQL y la API arrancan automáticamente al encender la Mac.
- [ ] `/api/health` responde `ok` desde el equipo de caja.
- [ ] Se genera un respaldo automático diario.
- [ ] El administrador descargó una copia manual.
- [ ] Existe una copia desconectada o en nube fuera de la Mac.
- [ ] Se verificó la integridad SHA-256.
- [ ] Se restauró una copia en una base de prueba y se validaron ventas e inventario.
- [ ] Hay un regulador o UPS para el servidor, módem e impresora.
- [ ] Se documentó quién atiende una falla y cómo contactarlo.

## Seguridad

- [ ] Se eliminaron o cambiaron todas las contraseñas iniciales.
- [ ] Cada persona utiliza su propia cuenta.
- [ ] `JWT_SECRET` es aleatorio y no está versionado.
- [ ] MySQL no está expuesto a internet.
- [ ] El acceso remoto, si existe, utiliza VPN y HTTPS.
- [ ] La Mac tiene usuario protegido, bloqueo automático y cifrado de disco.
- [ ] Se probó cierre de sesión por inactividad.
- [ ] Se revisó la bitácora de accesos y operaciones críticas.

## Operación fiscal

El módulo SAT es control interno mientras no exista un PAC configurado y probado.

- [ ] La tienda confirmó si requiere emisión CFDI desde este sistema.
- [ ] Si se requiere, se contrataron PAC y certificados.
- [ ] Se validó CFDI 4.0 en el ambiente de pruebas del PAC.
- [ ] Se probaron emisión, descarga XML/PDF y cancelación.
- [ ] Si no se incluye, la interfaz indica claramente que no emite comprobantes fiscales.

## Firmas de aceptación

Responsable de la tienda: ____________________  Fecha: __________

Responsable de instalación: __________________  Fecha: __________

Observaciones:


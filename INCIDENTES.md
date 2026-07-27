# Guía rápida de incidentes

## No hay internet o la API no responde

1. No cerrar la pestaña si existe una venta en proceso.
2. Revisar el aviso de ventas pendientes en Caja.
3. Confirmar que la Mac servidor y el módem estén encendidos.
4. Abrir `http://192.168.120.230:3000/api/health`.
5. Al recuperar la conexión, pulsar **Reintentar ahora**.
6. No cerrar caja hasta que el contador de pendientes llegue a cero.

## Se apagó el equipo durante una venta

1. Encender servidor, módem y caja.
2. Esperar a que MySQL y la API inicien.
3. Ingresar nuevamente y revisar historial de ventas.
4. Si aparece una venta pendiente, sincronizarla; el UUID evita duplicarla.
5. Comparar ticket, caja e inventario antes de repetir el cobro.

## La impresora no responde

La venta puede estar registrada aunque no exista ticket. Verificar primero el historial
y utilizar **Reimprimir ticket**. Nunca repetir una venta únicamente porque no imprimió.

## El inventario no coincide

No modificar directamente MySQL. Usar **Conteo físico** en Inventario, capturar el
motivo y revisar movimientos y bitácora.

## Falló un respaldo

1. No borrar respaldos anteriores.
2. Revisar espacio libre y permisos del directorio configurado.
3. Crear una copia manual desde Respaldos.
4. Copiarla a un medio externo y verificarla.

## Restauración

La restauración reemplaza información. Debe realizarla un administrador, después de
crear una copia nueva y fuera del horario de venta. Primero debe ensayarse sobre una
base de prueba.


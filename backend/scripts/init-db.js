import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';

const connection = await mysql.createConnection({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  multipleStatements: true,
});

try {
  const scriptUrl = new URL('../../database/AbarrotesElPedernal.sql', import.meta.url);
  const sourceSql = await readFile(scriptUrl, 'utf8');
  const databaseName = String(config.database.database);
  const escapedDatabase = `\`${databaseName.replaceAll('`', '``')}\``;
  const sql = sourceSql.replace(
    /CREATE DATABASE IF NOT EXISTS `AbarrotesElPedernal`[\s\S]*?USE `AbarrotesElPedernal`;/,
    `USE ${escapedDatabase};`,
  );
  await connection.query(sql);
  const [saldoColumns] = await connection.query(
    "SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema=? AND table_name='saldos_clientes' AND column_name='monto_usado'",
    [databaseName],
  );
  if (Number(saldoColumns[0].total) === 0) {
    await connection.query(`ALTER TABLE ${escapedDatabase}.saldos_clientes ADD COLUMN monto_usado DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER monto`);
  }
  const [sessionColumns] = await connection.query(
    "SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema=? AND table_name='usuarios' AND column_name='sesion_version'",
    [databaseName],
  );
  if (Number(sessionColumns[0].total) === 0) {
    await connection.query(`ALTER TABLE ${escapedDatabase}.usuarios ADD COLUMN sesion_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER password_hash`);
  }
  const [deletedUserColumns] = await connection.query(
    "SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema=? AND table_name='usuarios' AND column_name='eliminado_en'",
    [databaseName],
  );
  if (Number(deletedUserColumns[0].total) === 0) {
    await connection.query(`ALTER TABLE ${escapedDatabase}.usuarios ADD COLUMN eliminado_en DATETIME NULL AFTER activo, ADD INDEX idx_usuarios_eliminado (eliminado_en)`);
  }
  const providerColumns = [
    ['ultima_compra', 'DATE NULL AFTER dia_entrega'],
    ['proxima_entrega', 'DATE NULL AFTER ultima_compra'],
    ["estado_pedido", "ENUM('SIN_PEDIDO','PENDIENTE','RECIBIDO','ATRASADO') NOT NULL DEFAULT 'SIN_PEDIDO' AFTER proxima_entrega"],
    ['saldo_pendiente', 'DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER estado_pedido'],
  ];
  for (const [column, definition] of providerColumns) {
    const [rows] = await connection.query(
      "SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema=? AND table_name='proveedores' AND column_name=?",
      [databaseName, column],
    );
    if (Number(rows[0].total) === 0) await connection.query(`ALTER TABLE ${escapedDatabase}.proveedores ADD COLUMN ${column} ${definition}`);
  }
  await connection.query(`ALTER TABLE ${escapedDatabase}.compras MODIFY COLUMN metodo_pago ENUM('EFECTIVO','TARJETA','TERMINAL','TRANSFERENCIA','CREDITO','MIXTO','OTRO') NOT NULL DEFAULT 'CREDITO'`);
  await connection.query(`ALTER TABLE ${escapedDatabase}.movimientos_caja MODIFY COLUMN metodo ENUM('EFECTIVO','TARJETA','TERMINAL','TRANSFERENCIA','FIADO','OTRO') NOT NULL`);
  // Corrección confirmada por la tienda: esta compra se pagó en efectivo de caja,
  // pero una versión anterior del cliente omitió el desglose del pago.
  await connection.query(`
    INSERT INTO ${escapedDatabase}.compra_pagos(compra_id,origen,metodo,monto)
    SELECT c.id,'CAJA','EFECTIVO',c.total
    FROM ${escapedDatabase}.compras c
    WHERE c.folio='C-1785957097705' AND c.total=50.00 AND c.metodo_pago='EFECTIVO'
      AND NOT EXISTS (SELECT 1 FROM ${escapedDatabase}.compra_pagos cp WHERE cp.compra_id=c.id)
  `);
  const [reconciled] = await connection.query(`
    INSERT INTO ${escapedDatabase}.movimientos_caja
      (sesion_caja_id,usuario_id,tipo,categoria,descripcion,metodo,monto,referencia,creado_en)
    SELECT
      (SELECT sc.id FROM ${escapedDatabase}.sesiones_caja sc
       WHERE sc.fecha_apertura<=c.fecha_compra
         AND (sc.fecha_cierre IS NULL OR sc.fecha_cierre>=c.fecha_compra)
       ORDER BY sc.fecha_apertura DESC LIMIT 1),
      c.usuario_id,'SALIDA','COMPRA',
      CONCAT('Pago a proveedor ',c.proveedor_id,' · compra ',COALESCE(c.folio,c.id)),
      cp.metodo,cp.monto,COALESCE(c.folio,CONCAT('C-',c.id)),c.fecha_compra
    FROM ${escapedDatabase}.compra_pagos cp
    JOIN ${escapedDatabase}.compras c ON c.id=cp.compra_id
    WHERE cp.origen='CAJA'
      AND (SELECT sc.id FROM ${escapedDatabase}.sesiones_caja sc
           WHERE sc.fecha_apertura<=c.fecha_compra
             AND (sc.fecha_cierre IS NULL OR sc.fecha_cierre>=c.fecha_compra)
           ORDER BY sc.fecha_apertura DESC LIMIT 1) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM ${escapedDatabase}.movimientos_caja mc
        WHERE mc.categoria='COMPRA'
          AND mc.referencia=COALESCE(c.folio,CONCAT('C-',c.id))
          AND mc.metodo=cp.metodo AND mc.monto=cp.monto
      )
  `);
  if (Number(reconciled.affectedRows) > 0) console.log(`Movimientos de compras desde caja recuperados: ${reconciled.affectedRows}`);
  const [tables] = await connection.query(
    "SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'",
    [databaseName],
  );
  console.log(`Base ${databaseName} inicializada correctamente con ${tables[0].total} tablas.`);
} catch (error) {
  console.error(`No fue posible inicializar la base: ${error.message}`);
  process.exitCode = 1;
} finally {
  await connection.end();
}

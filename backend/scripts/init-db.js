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
  const [purchaseMovementColumns] = await connection.query(
    "SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema=? AND table_name='movimientos_caja' AND column_name='compra_id'",
    [databaseName],
  );
  if (Number(purchaseMovementColumns[0].total) === 0) {
    await connection.query(`ALTER TABLE ${escapedDatabase}.movimientos_caja ADD COLUMN compra_id BIGINT UNSIGNED NULL AFTER venta_id`);
  }
  const [purchaseMovementConstraints] = await connection.query(
    "SELECT COUNT(*) AS total FROM information_schema.table_constraints WHERE table_schema=? AND table_name='movimientos_caja' AND constraint_name='fk_mov_caja_compra' AND constraint_type='FOREIGN KEY'",
    [databaseName],
  );
  if (Number(purchaseMovementConstraints[0].total) === 0) {
    await connection.query(`ALTER TABLE ${escapedDatabase}.movimientos_caja ADD CONSTRAINT fk_mov_caja_compra FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE SET NULL`);
  }
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

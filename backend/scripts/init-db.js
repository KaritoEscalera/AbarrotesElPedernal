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
  const sql = await readFile(scriptUrl, 'utf8');
  await connection.query(sql);
  const [saldoColumns] = await connection.query(
    "SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema='AbarrotesElPedernal' AND table_name='saldos_clientes' AND column_name='monto_usado'",
  );
  if (Number(saldoColumns[0].total) === 0) {
    await connection.query('ALTER TABLE AbarrotesElPedernal.saldos_clientes ADD COLUMN monto_usado DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER monto');
  }
  const [tables] = await connection.query(
    "SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = 'AbarrotesElPedernal' AND table_type = 'BASE TABLE'",
  );
  console.log(`Base AbarrotesElPedernal inicializada correctamente con ${tables[0].total} tablas.`);
} catch (error) {
  console.error(`No fue posible inicializar la base: ${error.message}`);
  process.exitCode = 1;
} finally {
  await connection.end();
}

import { verifyDatabase, pool } from '../src/database.js';

try {
  const result = await verifyDatabase();
  const [tables] = await pool.query('SHOW TABLES');
  console.log(`Conexión correcta con ${result.databaseName}. Tablas encontradas: ${tables.length}.`);
  process.exitCode = 0;
} catch (error) {
  console.error(`Error de conexión: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}

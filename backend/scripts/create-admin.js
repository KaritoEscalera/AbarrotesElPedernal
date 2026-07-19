import bcrypt from 'bcryptjs';
import { pool } from '../src/database.js';

const [nombre, correo, password] = process.argv.slice(2);
if (!nombre || !correo || !password || password.length < 8) {
  console.error('Uso: npm run create-admin -- "Nombre" correo@dominio.com "ContraseñaSegura"');
  process.exit(1);
}

try {
  const [roles] = await pool.execute("SELECT id FROM roles WHERE nombre = 'Administrador' LIMIT 1");
  if (!roles[0]) throw new Error('No existe el rol Administrador. Ejecuta primero el script SQL.');
  const hash = await bcrypt.hash(password, 12);
  await pool.execute('INSERT INTO usuarios (rol_id, nombre, correo, password_hash) VALUES (?, ?, ?, ?)', [roles[0].id, nombre.trim(), correo.trim().toLowerCase(), hash]);
  console.log(`Administrador ${correo.trim().toLowerCase()} creado correctamente.`);
} catch (error) {
  console.error(error.code === 'ER_DUP_ENTRY' ? 'Ese correo ya está registrado.' : error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

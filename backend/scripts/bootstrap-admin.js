import bcrypt from 'bcryptjs';
import { pool } from '../src/database.js';

const nombre = String(process.env.BOOTSTRAP_ADMIN_NAME ?? 'Migración segura').trim();
const correo = String(process.env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim().toLowerCase();
const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '');

try {
  if (!correo && !password) {
    console.log('Usuario temporal de migración omitido.');
  } else {
    if (!correo || password.length < 12) throw new Error('BOOTSTRAP_ADMIN_EMAIL y una contraseña de al menos 12 caracteres son obligatorios.');
    const [[role]] = await pool.execute("SELECT id FROM roles WHERE nombre='Administrador' LIMIT 1");
    if (!role) throw new Error('No existe el rol Administrador.');
    const hash = await bcrypt.hash(password, 12);
    await pool.execute(
      `INSERT INTO usuarios(rol_id,nombre,correo,password_hash,activo)
       VALUES(?,?,?,?,TRUE)
       ON DUPLICATE KEY UPDATE rol_id=VALUES(rol_id),nombre=VALUES(nombre),password_hash=VALUES(password_hash),activo=TRUE`,
      [role.id, nombre, correo, hash],
    );
    console.log('Usuario temporal de migración preparado.');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

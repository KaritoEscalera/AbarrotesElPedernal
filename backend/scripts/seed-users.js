import bcrypt from 'bcryptjs';
import { pool } from '../src/database.js';

const users = [
  ['Administrador', 'admin@pedernal.com', '123456', 'Administrador'],
  ['Gerente', 'gerente@pedernal.com', '123456', 'Gerente'],
  ['Cajera', 'cajera@pedernal.com', '123456', 'Cajera'],
];

try {
  for (const [nombre, correo, password, rol] of users) {
    const [roles] = await pool.execute('SELECT id FROM roles WHERE nombre=? LIMIT 1', [rol]);
    const hash = await bcrypt.hash(password, 12);
    await pool.execute(
      `INSERT INTO usuarios(rol_id,nombre,correo,password_hash) VALUES(?,?,?,?)
       ON DUPLICATE KEY UPDATE rol_id=VALUES(rol_id),nombre=VALUES(nombre),password_hash=VALUES(password_hash),activo=TRUE`,
      [roles[0].id, nombre, correo, hash],
    );
  }
  console.log('Usuarios iniciales sincronizados correctamente.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await pool.end(); }

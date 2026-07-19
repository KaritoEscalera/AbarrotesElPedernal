import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../database.js';
import { config } from '../config.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res, next) => {
  try {
    const correo = String(req.body?.correo ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    if (!correo || !password) return res.status(400).json({ error: 'Correo y contraseña son obligatorios.' });

    const [rows] = await pool.execute(
      `SELECT u.id, u.nombre, u.correo, u.password_hash, u.activo, r.nombre AS rol
       FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.correo = ? LIMIT 1`,
      [correo],
    );
    const usuario = rows[0];
    if (!usuario || !usuario.activo || !(await bcrypt.compare(password, usuario.password_hash))) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    await pool.execute('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = ?', [usuario.id]);
    const token = jwt.sign({ sub: usuario.id, nombre: usuario.nombre, rol: usuario.rol }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
    return res.json({ token, usuario: { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol } });
  } catch (error) {
    return next(error);
  }
});

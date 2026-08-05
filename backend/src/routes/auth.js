import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../database.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

authRouter.post('/login', async (req, res, next) => {
  try {
    const correo = String(req.body?.correo ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    if (!correo || !password) return res.status(400).json({ error: 'Correo y contraseña son obligatorios.' });
    const key = `${req.ip}:${correo}`;
    const now = Date.now();
    const recent = (attempts.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
    if (recent.length >= MAX_ATTEMPTS) return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.' });

    const [rows] = await pool.execute(
      `SELECT u.id, u.nombre, u.correo, u.password_hash, u.sesion_version, u.activo, r.nombre AS rol
       FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.correo = ? LIMIT 1`,
      [correo],
    );
    const usuario = rows[0];
    if (!usuario || !usuario.activo || !(await bcrypt.compare(password, usuario.password_hash))) {
      recent.push(now);
      attempts.set(key, recent);
      await pool.execute(
        `INSERT INTO bitacora(usuario_id,modulo,accion,descripcion,ip) VALUES(NULL,'Autenticación','LOGIN_FALLIDO',?,?)`,
        [`Intento fallido para ${correo}`, req.ip],
      );
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    attempts.delete(key);
    await pool.execute('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = ?', [usuario.id]);
    await pool.execute(
      `INSERT INTO bitacora(usuario_id,modulo,accion,descripcion,ip) VALUES(?,'Autenticación','LOGIN','Inicio de sesión correcto',?)`,
      [usuario.id, req.ip],
    );
    const token = jwt.sign({ sub: usuario.id, nombre: usuario.nombre, rol: usuario.rol, version: Number(usuario.sesion_version) }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
    return res.json({ token, usuario: { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol } });
  } catch (error) {
    return next(error);
  }
});

authRouter.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const actual = String(req.body?.passwordActual ?? '');
    const nueva = String(req.body?.passwordNueva ?? '');
    if (nueva.length < 8 || !/[A-Za-z]/.test(nueva) || !/\d/.test(nueva)) return res.status(400).json({ error: 'La contraseña nueva debe tener al menos 8 caracteres, letras y números.' });
    const [[user]] = await pool.execute('SELECT password_hash FROM usuarios WHERE id=? AND activo=TRUE', [req.user.sub]);
    if (!user || !(await bcrypt.compare(actual, user.password_hash))) return res.status(401).json({ error: 'La contraseña actual no es correcta.' });
    if (await bcrypt.compare(nueva, user.password_hash)) return res.status(400).json({ error: 'La contraseña nueva debe ser diferente.' });
    const hash = await bcrypt.hash(nueva, 12);
    await pool.execute('UPDATE usuarios SET password_hash=?,sesion_version=sesion_version+1 WHERE id=?', [hash, req.user.sub]);
    await pool.execute(`INSERT INTO bitacora(usuario_id,modulo,accion,descripcion) VALUES(?,'Seguridad','CAMBIO_PASSWORD','El usuario cambió su contraseña')`, [req.user.sub]);
    return res.status(204).end();
  } catch (error) { return next(error); }
});

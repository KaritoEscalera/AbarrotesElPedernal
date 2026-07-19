import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole('Administrador'));

usersRouter.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT u.id, u.nombre, u.correo, r.nombre AS rol, u.activo, u.ultimo_acceso, u.creado_en FROM usuarios u JOIN roles r ON r.id = u.rol_id ORDER BY u.nombre`);
    return res.json(rows);
  } catch (error) { return next(error); }
});

usersRouter.post('/', async (req, res, next) => {
  try {
    const { nombre, correo, password, rol } = req.body ?? {};
    if (!nombre?.trim() || !correo?.trim() || String(password ?? '').length < 8 || !rol) return res.status(400).json({ error: 'Nombre, correo, rol y contraseña de al menos 8 caracteres son obligatorios.' });
    const hash = await bcrypt.hash(String(password), 12);
    const [roleRows] = await pool.execute('SELECT id FROM roles WHERE nombre = ? LIMIT 1', [rol]);
    if (!roleRows[0]) return res.status(400).json({ error: 'El rol no es válido.' });
    const [result] = await pool.execute('INSERT INTO usuarios (rol_id, nombre, correo, password_hash) VALUES (?, ?, ?, ?)', [roleRows[0].id, nombre.trim(), correo.trim().toLowerCase(), hash]);
    return res.status(201).json({ id: result.insertId, nombre: nombre.trim(), correo: correo.trim().toLowerCase(), rol, activo: true });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe un usuario con ese correo.' });
    return next(error);
  }
});

usersRouter.patch('/:id/status', async (req, res, next) => {
  try {
    const activo = Boolean(req.body?.activo);
    if (Number(req.params.id) === Number(req.user.sub) && !activo) return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta.' });
    await pool.execute('UPDATE usuarios SET activo=? WHERE id=?', [activo, req.params.id]);
    return res.status(204).end();
  } catch (error) { return next(error); }
});

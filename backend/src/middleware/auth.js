import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../database.js';

export async function requireAuth(req, res, next) {
  const authorization = req.headers.authorization ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Debes iniciar sesión.' });

  try {
    req.user = jwt.verify(token, config.jwtSecret);
    const [[account]]=await pool.execute('SELECT activo,sesion_version FROM usuarios WHERE id=?',[req.user.sub]);
    if(!account?.activo||Number(account.sesion_version)!==Number(req.user.version??0))return res.status(401).json({error:'La sesión fue cerrada por seguridad. Inicia sesión nuevamente.'});
    return next();
  } catch {
    return res.status(401).json({ error: 'La sesión expiró o no es válida.' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => roles.includes(req.user?.rol)
    ? next()
    : res.status(403).json({ error: 'No tienes permiso para realizar esta acción.' });
}

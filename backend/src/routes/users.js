import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole('Administrador'));

usersRouter.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT u.id, u.nombre, u.correo, r.nombre AS rol, u.activo, u.ultimo_acceso, u.creado_en FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.eliminado_en IS NULL ORDER BY u.nombre`);
    return res.json(rows);
  } catch (error) { return next(error); }
});

usersRouter.post('/', async (req, res, next) => {
  try {
    const { nombre, correo, password, rol } = req.body ?? {};
    if (!nombre?.trim() || !correo?.trim() || String(password ?? '').length < 10 || !/[A-Z]/.test(password)||!/[a-z]/.test(password)||!(/\d/.test(password)) || !rol) return res.status(400).json({ error: 'La contraseña debe tener 10 caracteres, mayúscula, minúscula y número.' });
    const hash = await bcrypt.hash(String(password), 12);
    const [roleRows] = await pool.execute('SELECT id FROM roles WHERE nombre = ? LIMIT 1', [rol]);
    if (!roleRows[0]) return res.status(400).json({ error: 'El rol no es válido.' });
    const [result] = await pool.execute('INSERT INTO usuarios (rol_id, nombre, correo, password_hash) VALUES (?, ?, ?, ?)', [roleRows[0].id, nombre.trim(), correo.trim().toLowerCase(), hash]);
    await pool.execute(`INSERT INTO bitacora(usuario_id,modulo,accion,descripcion,entidad,entidad_id) VALUES(?,'Usuarios','CREAR',?,'USUARIO',?)`,[req.user.sub,`Alta de ${correo.trim().toLowerCase()} con rol ${rol}`,result.insertId]);
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
    const [result] = await pool.execute('UPDATE usuarios SET activo=?,sesion_version=sesion_version+1 WHERE id=? AND eliminado_en IS NULL', [activo, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'El usuario no existe.' });
    await pool.execute(`INSERT INTO bitacora(usuario_id,modulo,accion,descripcion,entidad,entidad_id) VALUES(?,'Usuarios','CAMBIAR_ESTADO',?,'USUARIO',?)`,[req.user.sub,activo?'Cuenta activada':'Cuenta desactivada',req.params.id]);
    return res.status(204).end();
  } catch (error) { return next(error); }
});

usersRouter.put('/:id',async(req,res,next)=>{
  try{
    const nombre=String(req.body?.nombre??'').trim(),correo=String(req.body?.correo??'').trim().toLowerCase(),rol=String(req.body?.rol??'').trim(),password=String(req.body?.password??'');
    if(!nombre||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)||!rol)return res.status(400).json({error:'Nombre, correo y rol válidos son obligatorios.'});
    if(password&&(password.length<10||!/[A-Z]/.test(password)||!/[a-z]/.test(password)||!/\d/.test(password)))return res.status(400).json({error:'La contraseña nueva debe tener 10 caracteres, mayúscula, minúscula y número.'});
    const [[role]]=await pool.execute('SELECT id FROM roles WHERE nombre=?',[rol]);if(!role)return res.status(400).json({error:'El rol no es válido.'});
    let result;
    if(password){const hash=await bcrypt.hash(password,12);[result]=await pool.execute('UPDATE usuarios SET nombre=?,correo=?,rol_id=?,password_hash=?,sesion_version=sesion_version+1 WHERE id=? AND eliminado_en IS NULL',[nombre,correo,role.id,hash,req.params.id]);}
    else [result]=await pool.execute('UPDATE usuarios SET nombre=?,correo=?,rol_id=? WHERE id=? AND eliminado_en IS NULL',[nombre,correo,role.id,req.params.id]);
    if(!result.affectedRows)return res.status(404).json({error:'El usuario no existe.'});
    await pool.execute(`INSERT INTO bitacora(usuario_id,modulo,accion,descripcion,entidad,entidad_id) VALUES(?,'Usuarios','EDITAR',?,'USUARIO',?)`,[req.user.sub,`Cuenta actualizada: ${correo}`,req.params.id]);
    return res.status(204).end();
  }catch(error){if(error?.code==='ER_DUP_ENTRY')return res.status(409).json({error:'Ya existe un usuario con ese correo.'});return next(error);}
});

usersRouter.delete('/:id',async(req,res,next)=>{
  try{
    if(Number(req.params.id)===Number(req.user.sub))return res.status(400).json({error:'No puedes eliminar tu propia cuenta.'});
    const [result]=await pool.execute("UPDATE usuarios SET activo=FALSE,eliminado_en=NOW(),correo=CONCAT('eliminado-',id,'-',UNIX_TIMESTAMP(),'@pedernal.invalid'),sesion_version=sesion_version+1 WHERE id=? AND eliminado_en IS NULL",[req.params.id]);
    if(!result.affectedRows)return res.status(404).json({error:'El usuario no existe o ya fue eliminado.'});
    await pool.execute(`INSERT INTO bitacora(usuario_id,modulo,accion,descripcion,entidad,entidad_id) VALUES(?,'Usuarios','ELIMINAR','Cuenta eliminada; se conservó su historial','USUARIO',?)`,[req.user.sub,req.params.id]);
    return res.status(204).end();
  }catch(error){return next(error);}
});

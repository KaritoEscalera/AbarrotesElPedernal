import { Router } from 'express';
import { pool } from '../database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const businessRouter = Router();
businessRouter.use(requireAuth);

businessRouter.get('/dashboard', async (req, res, next) => {
  try {
    const esCajera = req.user.rol === 'Cajera';
    const filtroUsuario = esCajera ? ' AND v.usuario_id = ?' : '';
    const parametros = esCajera ? [req.user.sub] : [];
    const [hoyRows, semanaRows, stockRows, fiadosRows, ventasRows, cajaRows] = await Promise.all([
      pool.execute(`SELECT COALESCE(SUM(v.total), 0) AS total, COUNT(*) AS operaciones FROM ventas v WHERE v.estado='COMPLETADA' AND DATE(v.fecha_venta)=CURRENT_DATE${filtroUsuario}`, parametros),
      pool.execute(`SELECT COALESCE(SUM(v.total), 0) AS total FROM ventas v WHERE v.estado='COMPLETADA' AND v.fecha_venta>=DATE_SUB(CURRENT_DATE, INTERVAL WEEKDAY(CURRENT_DATE) DAY)${filtroUsuario}`, parametros),
      pool.query('SELECT COUNT(*) AS total FROM productos WHERE activo=TRUE AND stock_actual<=stock_minimo'),
      pool.query("SELECT COUNT(*) AS total FROM fiados WHERE estado NOT IN ('LIQUIDADO','CANCELADO') AND saldo_pendiente>0"),
      pool.execute(`SELECT v.folio, v.total, COALESCE(vp.metodo, 'OTRO') AS metodo, DATE_FORMAT(v.fecha_venta,'%H:%i') AS hora FROM ventas v LEFT JOIN venta_pagos vp ON vp.venta_id=v.id WHERE v.estado='COMPLETADA'${filtroUsuario} ORDER BY v.fecha_venta DESC LIMIT 5`, parametros),
      pool.execute("SELECT id, estado, fondo_inicial AS fondoInicial, fecha_apertura AS fechaApertura FROM sesiones_caja WHERE usuario_apertura_id=? AND estado='ABIERTA' ORDER BY fecha_apertura DESC LIMIT 1", [req.user.sub]),
    ]);
    return res.json({
      ventasDia: Number(hoyRows[0][0].total),
      numeroVentas: Number(hoyRows[0][0].operaciones),
      ventasSemana: Number(semanaRows[0][0].total),
      productosBajos: Number(stockRows[0][0].total),
      fiadosPendientes: Number(fiadosRows[0][0].total),
      caja: cajaRows[0][0] ?? null,
      ultimasVentas: ventasRows[0],
    });
  } catch (error) { next(error); }
});

businessRouter.get('/clients', async (_req, res, next) => {
  try { const [rows] = await pool.query(`SELECT c.id, c.nombre, c.telefono, c.correo, c.direccion, c.activo, COALESCE(SUM(f.saldo_pendiente),0) AS adeudo FROM clientes c LEFT JOIN fiados f ON f.cliente_id=c.id AND f.estado NOT IN ('LIQUIDADO','CANCELADO') GROUP BY c.id ORDER BY c.nombre`); res.json(rows); } catch (e) { next(e); }
});
businessRouter.post('/clients', async (req, res, next) => {
  try { const { nombre, telefono, correo = null, direccion = null } = req.body; if (!nombre?.trim() || !telefono?.trim()) return res.status(400).json({ error: 'Nombre y teléfono son obligatorios.' }); const [result] = await pool.execute('INSERT INTO clientes (nombre,telefono,correo,direccion) VALUES (?,?,?,?)',[nombre.trim(),telefono.trim(),correo?.trim()||null,direccion?.trim()||null]); res.status(201).json({ id: result.insertId }); } catch(e){ next(e); }
});

businessRouter.get('/products', async (_req,res,next)=>{ try { const [rows]=await pool.query(`SELECT p.id,p.codigo_barras AS codigo,p.nombre,c.nombre AS categoria,p.stock_actual AS stock,p.stock_minimo AS stockMinimo,p.costo,p.precio_venta AS precioVenta,p.tasa_iva AS tasaIva,p.activo FROM productos p LEFT JOIN categorias c ON c.id=p.categoria_id ORDER BY p.nombre`); res.json(rows); }catch(e){next(e);} });
businessRouter.post('/products', requireRole('Administrador','Gerente'), async(req,res,next)=>{ try { const {codigo,nombre,categoria,stock=0,stockMinimo=0,costo=0,precioVenta,tasaIva=0}=req.body; const [cats]=await pool.execute('SELECT id FROM categorias WHERE nombre=? LIMIT 1',[categoria]); let categoriaId=cats[0]?.id; if(!categoriaId){const [cat]=await pool.execute('INSERT INTO categorias(nombre) VALUES(?)',[categoria]);categoriaId=cat.insertId;} const [result]=await pool.execute('INSERT INTO productos(categoria_id,codigo_barras,nombre,stock_actual,stock_minimo,costo,precio_venta,tasa_iva) VALUES(?,?,?,?,?,?,?,?)',[categoriaId,codigo||null,nombre,stock,stockMinimo,costo,precioVenta,tasaIva]);res.status(201).json({id:result.insertId}); }catch(e){next(e);} });
businessRouter.patch('/products/:id/stock', requireRole('Administrador','Gerente'), async(req,res,next)=>{ const connection=await pool.getConnection(); try { await connection.beginTransaction(); const [[p]]=await connection.execute('SELECT stock_actual FROM productos WHERE id=? FOR UPDATE',[req.params.id]); if(!p) return res.status(404).json({error:'Producto no encontrado.'}); const cantidad=Number(req.body.cantidad); const nuevo=Number(p.stock_actual)+cantidad; if(!Number.isFinite(cantidad)||cantidad===0||nuevo<0) return res.status(400).json({error:'El ajuste de existencia no es válido.'}); await connection.execute('UPDATE productos SET stock_actual=? WHERE id=?',[nuevo,req.params.id]); await connection.execute(`INSERT INTO movimientos_inventario(producto_id,usuario_id,tipo,cantidad,stock_anterior,stock_nuevo,motivo) VALUES(?,?,?,?,?,?,?)`,[req.params.id,req.user.sub,cantidad>0?'ENTRADA':'SALIDA',Math.abs(cantidad),p.stock_actual,nuevo,req.body.motivo||'Ajuste desde aplicación']); await connection.commit();res.json({stock:nuevo}); }catch(e){await connection.rollback();next(e);}finally{connection.release();} });

businessRouter.get('/providers', async(_req,res,next)=>{try{const [rows]=await pool.query(`SELECT id,empresa,contacto AS nombre,telefono,correo,producto_principal AS productoPrincipal,dia_entrega AS diaEntrega,estado FROM proveedores WHERE estado<>'ARCHIVADO' ORDER BY empresa`);res.json(rows);}catch(e){next(e);}});
businessRouter.post('/providers',requireRole('Administrador','Gerente'),async(req,res,next)=>{try{const p=req.body;const [r]=await pool.execute(`INSERT INTO proveedores(empresa,contacto,telefono,correo,producto_principal,dia_entrega,estado) VALUES(?,?,?,?,?,?,?)`,[p.empresa,p.nombre,p.telefono,p.correo||null,p.productoPrincipal||null,p.diaEntrega||null,'ACTIVO']);res.status(201).json({id:r.insertId});}catch(e){next(e);}});
businessRouter.put('/providers/:id',requireRole('Administrador','Gerente'),async(req,res,next)=>{try{const p=req.body;await pool.execute(`UPDATE proveedores SET empresa=?,contacto=?,telefono=?,correo=?,producto_principal=?,dia_entrega=?,estado=? WHERE id=?`,[p.empresa,p.nombre,p.telefono,p.correo||null,p.productoPrincipal||null,p.diaEntrega||null,String(p.estado).toUpperCase(),req.params.id]);res.status(204).end();}catch(e){next(e);}});
businessRouter.delete('/providers/:id',requireRole('Administrador','Gerente'),async(req,res,next)=>{try{await pool.execute("UPDATE proveedores SET estado='ARCHIVADO' WHERE id=?",[req.params.id]);res.status(204).end();}catch(e){next(e);}});

businessRouter.get('/credits',async(_req,res,next)=>{try{const [rows]=await pool.query(`SELECT f.id,c.nombre AS cliente,c.telefono,f.deuda_original AS deudaOriginal,f.saldo_pendiente AS saldoPendiente,COALESCE((SELECT a.monto FROM fiado_abonos a WHERE a.fiado_id=f.id ORDER BY a.creado_en DESC LIMIT 1),0) AS ultimoAbono,c.limite_credito AS limite,DATE_FORMAT(f.fecha_registro,'%Y-%m-%d') AS fechaRegistro,DATE_FORMAT(f.fecha_limite,'%Y-%m-%d') AS fechaLimite,f.estado FROM fiados f JOIN clientes c ON c.id=f.cliente_id ORDER BY f.fecha_registro DESC`);res.json(rows);}catch(e){next(e);}});
businessRouter.post('/credits',async(req,res,next)=>{try{const f=req.body;const [clients]=await pool.execute('SELECT id FROM clientes WHERE telefono=? LIMIT 1',[f.telefono]);let clientId=clients[0]?.id;if(!clientId){const [r]=await pool.execute('INSERT INTO clientes(nombre,telefono,limite_credito) VALUES(?,?,?)',[f.cliente,f.telefono,f.limite||0]);clientId=r.insertId;}const [r]=await pool.execute(`INSERT INTO fiados(cliente_id,usuario_id,fecha_limite,deuda_original,saldo_pendiente) VALUES(?,?,?,?,?)`,[clientId,req.user.sub,f.fechaLimite,f.deudaOriginal,f.deudaOriginal]);res.status(201).json({id:r.insertId});}catch(e){next(e);}});
businessRouter.post('/credits/:id/payments',async(req,res,next)=>{const c=await pool.getConnection();try{await c.beginTransaction();const [[f]]=await c.execute('SELECT saldo_pendiente FROM fiados WHERE id=? FOR UPDATE',[req.params.id]);const monto=Number(req.body.monto);if(!f||monto<=0||monto>f.saldo_pendiente)return res.status(400).json({error:'Abono inválido.'});await c.execute(`INSERT INTO fiado_abonos(fiado_id,usuario_id,monto,metodo,referencia) VALUES(?,?,?,?,?)`,[req.params.id,req.user.sub,monto,req.body.metodo||'EFECTIVO',req.body.referencia||null]);const saldo=f.saldo_pendiente-monto;await c.execute(`UPDATE fiados SET saldo_pendiente=?,estado=? WHERE id=?`,[saldo,saldo===0?'LIQUIDADO':'PENDIENTE',req.params.id]);await c.commit();res.json({saldoPendiente:saldo});}catch(e){await c.rollback();next(e);}finally{c.release();}});

businessRouter.get('/audit',requireRole('Administrador'),async(_req,res,next)=>{try{const [rows]=await pool.query(`SELECT b.id,b.modulo,b.accion,b.descripcion,b.creado_en AS fecha,u.nombre AS usuario FROM bitacora b LEFT JOIN usuarios u ON u.id=b.usuario_id ORDER BY b.creado_en DESC LIMIT 500`);res.json(rows);}catch(e){next(e);}});
businessRouter.get('/statistics',requireRole('Administrador','Gerente'),async(_req,res,next)=>{try{const [[sales]]=await pool.query(`SELECT COALESCE(SUM(total),0) total,COUNT(*) operaciones FROM ventas WHERE estado='COMPLETADA' AND fecha_venta>=DATE_SUB(NOW(),INTERVAL 30 DAY)`);const [daily]=await pool.query(`SELECT * FROM vista_ventas_diarias WHERE fecha>=DATE_SUB(CURRENT_DATE,INTERVAL 30 DAY) ORDER BY fecha`);const [[credits]]=await pool.query(`SELECT COALESCE(SUM(saldo_pendiente),0) pendiente,COALESCE(SUM(CASE WHEN fecha_limite<CURRENT_DATE THEN saldo_pendiente ELSE 0 END),0) vencido FROM fiados WHERE estado NOT IN('LIQUIDADO','CANCELADO')`);res.json({sales,daily,credits});}catch(e){next(e);}});

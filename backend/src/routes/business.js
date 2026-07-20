import express, { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pool } from '../database.js';
import { config } from '../config.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const businessRouter = Router();
businessRouter.use(requireAuth);

function mysqlProcess(command, extraArgs = [], input = null) {
  return new Promise((resolve, reject) => {
    const args = ['-h', config.database.host, '-P', String(config.database.port), '-u', config.database.user, ...extraArgs];
    const child = spawn(command, args, { env: { ...process.env, MYSQL_PWD: config.database.password } });
    const output = []; const errors = []; let size = 0;
    child.stdout.on('data', (chunk) => { size += chunk.length; if (size > 100 * 1024 * 1024) child.kill(); else output.push(chunk); });
    child.stderr.on('data', (chunk) => errors.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(Buffer.concat(output)) : reject(new Error(Buffer.concat(errors).toString() || `${command} terminó con código ${code}`)));
    if (input !== null) child.stdin.end(input); else child.stdin.end();
  });
}

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

businessRouter.get('/audit',requireRole('Administrador'),async(_req,res,next)=>{try{const [rows]=await pool.query(`SELECT b.id,b.modulo,b.accion,b.descripcion,b.creado_en AS fecha,COALESCE(u.nombre,'Sistema') AS usuario,COALESCE(r.nombre,'Sin rol') AS rol FROM bitacora b LEFT JOIN usuarios u ON u.id=b.usuario_id LEFT JOIN roles r ON r.id=u.rol_id ORDER BY b.creado_en DESC LIMIT 500`);res.json(rows);}catch(e){next(e);}});
businessRouter.get('/statistics',requireRole('Administrador','Gerente'),async(_req,res,next)=>{try{const [[sales]]=await pool.query(`SELECT COALESCE(SUM(total),0) total,COUNT(*) operaciones FROM ventas WHERE estado='COMPLETADA' AND fecha_venta>=DATE_SUB(NOW(),INTERVAL 30 DAY)`);const [daily]=await pool.query(`SELECT * FROM vista_ventas_diarias WHERE fecha>=DATE_SUB(CURRENT_DATE,INTERVAL 30 DAY) ORDER BY fecha`);const [[credits]]=await pool.query(`SELECT COALESCE(SUM(saldo_pendiente),0) pendiente,COALESCE(SUM(CASE WHEN fecha_limite<CURRENT_DATE THEN saldo_pendiente ELSE 0 END),0) vencido FROM fiados WHERE estado NOT IN('LIQUIDADO','CANCELADO')`);res.json({sales,daily,credits});}catch(e){next(e);}});

businessRouter.get('/analytics', requireRole('Administrador','Gerente'), async (_req, res, next) => {
  try {
    const [salesResult, productsResult, creditsResult] = await Promise.all([
      pool.query(
        `SELECT DATE_FORMAT(v.fecha_venta,'%Y-%m-%d') AS fecha,HOUR(v.fecha_venta) AS hora,
                vd.importe AS total,(vd.costo_unitario*vd.cantidad) AS costo,
                CASE COALESCE(vp.metodo,'OTRO') WHEN 'EFECTIVO' THEN 'Efectivo' WHEN 'TARJETA' THEN 'Tarjeta'
                  WHEN 'TRANSFERENCIA' THEN 'Transferencia' WHEN 'FIADO' THEN 'Fiado' ELSE 'Otro' END AS metodo,
                COALESCE(c.nombre,'Sin categoría') AS categoria,p.nombre AS producto,vd.cantidad AS unidades
         FROM ventas v JOIN venta_detalles vd ON vd.venta_id=v.id JOIN productos p ON p.id=vd.producto_id
         LEFT JOIN categorias c ON c.id=p.categoria_id
         LEFT JOIN venta_pagos vp ON vp.id=(SELECT MIN(vp2.id) FROM venta_pagos vp2 WHERE vp2.venta_id=v.id)
         WHERE v.estado='COMPLETADA' AND v.fecha_venta>=DATE_SUB(CURRENT_DATE,INTERVAL 1 YEAR)
         ORDER BY v.fecha_venta`,
      ),
      pool.query(
        `SELECT p.nombre AS producto,COALESCE(c.nombre,'Sin categoría') AS categoria,p.stock_actual AS stock,
                p.stock_minimo AS minimo,COALESCE(SUM(CASE WHEN v.estado='COMPLETADA' THEN vd.cantidad ELSE 0 END),0) AS vendidos,
                p.precio_venta AS precio,p.costo,
                COALESCE(DATEDIFF(CURRENT_DATE,MAX(CASE WHEN v.estado='COMPLETADA' THEN DATE(v.fecha_venta) END)),999) AS diasSinVenta,
                COALESCE((SELECT SUM(mi.cantidad) FROM movimientos_inventario mi WHERE mi.producto_id=p.id AND mi.tipo='MERMA' AND mi.creado_en>=DATE_SUB(CURRENT_DATE,INTERVAL 30 DAY)),0) AS merma
         FROM productos p LEFT JOIN categorias c ON c.id=p.categoria_id LEFT JOIN venta_detalles vd ON vd.producto_id=p.id
         LEFT JOIN ventas v ON v.id=vd.venta_id WHERE p.activo=TRUE GROUP BY p.id ORDER BY p.nombre`,
      ),
      pool.query(
        `SELECT c.nombre AS cliente,f.saldo_pendiente AS saldo,(f.fecha_limite<CURRENT_DATE AND f.saldo_pendiente>0) AS vencido,
                COALESCE(SUM(a.monto),0) AS abonos
         FROM fiados f JOIN clientes c ON c.id=f.cliente_id LEFT JOIN fiado_abonos a ON a.fiado_id=f.id
         WHERE f.estado<>'CANCELADO' GROUP BY f.id ORDER BY f.fecha_registro DESC`,
      ),
    ]);
    return res.json({ sales: salesResult[0], products: productsResult[0], credits: creditsResult[0] });
  } catch (error) { return next(error); }
});

businessRouter.get('/reports', requireRole('Administrador','Gerente'), async (_req, res, next) => {
  try {
    const [salesResult, inventoryResult, creditsResult] = await Promise.all([
      pool.query(
        `SELECT v.id,v.folio,v.fecha_venta AS fecha,u.nombre AS usuario,
                COALESCE(GROUP_CONCAT(DISTINCT vp.metodo ORDER BY vp.metodo SEPARATOR ', '),'OTRO') AS metodoPago,
                COALESCE(SUM(vd.cantidad),0) AS productos,v.total
         FROM ventas v JOIN usuarios u ON u.id=v.usuario_id
         LEFT JOIN venta_pagos vp ON vp.venta_id=v.id LEFT JOIN venta_detalles vd ON vd.venta_id=v.id
         WHERE v.estado='COMPLETADA' GROUP BY v.id ORDER BY v.fecha_venta DESC LIMIT 5000`,
      ),
      pool.query(
        `SELECT p.id,COALESCE(p.codigo_barras,p.sku,'') AS codigo,p.nombre AS producto,
                COALESCE(c.nombre,'Sin categoría') AS categoria,p.stock_actual AS stock,
                p.stock_minimo AS stockMinimo,p.precio_venta AS precioVenta
         FROM productos p LEFT JOIN categorias c ON c.id=p.categoria_id WHERE p.activo=TRUE ORDER BY p.nombre`,
      ),
      pool.query(
        `SELECT f.id,c.nombre AS cliente,f.fecha_registro AS fecha,f.deuda_original AS deudaOriginal,
                COALESCE(SUM(a.monto),0) AS abonos,f.saldo_pendiente AS saldoPendiente,
                CASE WHEN f.saldo_pendiente>0 AND f.fecha_limite<CURRENT_DATE THEN 'VENCIDO' ELSE f.estado END AS estado
         FROM fiados f JOIN clientes c ON c.id=f.cliente_id LEFT JOIN fiado_abonos a ON a.fiado_id=f.id
         GROUP BY f.id ORDER BY f.fecha_registro DESC`,
      ),
    ]);
    return res.json({ sales: salesResult[0], inventory: inventoryResult[0], credits: creditsResult[0] });
  } catch (error) { return next(error); }
});

businessRouter.get('/backups', requireRole('Administrador'), async (_req, res, next) => {
  try { const [rows] = await pool.query(`SELECT id,nombre_archivo AS nombre, tipo,tamanio_bytes AS tamanio,estado,creado_en AS fecha,mensaje_error AS error FROM respaldos ORDER BY creado_en DESC LIMIT 100`); return res.json(rows); }
  catch (error) { return next(error); }
});

businessRouter.get('/fiscal', requireRole('Administrador'), async (_req, res, next) => {
  try {
    const [[settings]] = await pool.query(`SELECT rfc,nombre_razon_social AS nombre,codigo_postal AS codigoPostal,tipo_persona AS tipoPersona,regimen_fiscal AS regimen,tasa_isr_preliminar AS tasaIsr FROM configuracion_fiscal WHERE id=1`);
    const [ledger] = await pool.query(
      `SELECT * FROM (
        SELECT v.id,DATE_FORMAT(v.fecha_venta,'%Y-%m-%d') fecha,'Ingreso' tipo,CONCAT('Venta ',v.folio) concepto,'Ventas' categoria,
               COALESCE(vp.metodo,'OTRO') metodoPago,v.folio referencia,v.subtotal,v.impuestos iva,0 retenciones,v.total,'Caja' origen
        FROM ventas v LEFT JOIN venta_pagos vp ON vp.id=(SELECT MIN(vp2.id) FROM venta_pagos vp2 WHERE vp2.venta_id=v.id) WHERE v.estado='COMPLETADA'
        UNION ALL
        SELECT -c.id,DATE_FORMAT(c.fecha_compra,'%Y-%m-%d'),'Egreso',CONCAT('Compra ',COALESCE(c.folio,c.id)),'Compras',c.metodo_pago,COALESCE(c.folio,''),c.subtotal,c.impuestos,0,c.total,'Caja'
        FROM compras c WHERE c.estado IN('RECIBIDA','PARCIAL')
       ) movimientos ORDER BY fecha DESC LIMIT 5000`,
    );
    return res.json({ settings: settings ?? null, ledger, pac: { configured: Boolean(config.pac.provider && config.pac.apiUrl && config.pac.apiKey), provider: config.pac.provider || null } });
  } catch (error) { return next(error); }
});

businessRouter.put('/fiscal', requireRole('Administrador'), async (req, res, next) => {
  try {
    const f = req.body ?? {}; const rfc = String(f.rfc ?? '').trim().toUpperCase(); const nombre = String(f.nombre ?? '').trim(); const codigoPostal = String(f.codigoPostal ?? '').trim();
    const tipoPersona = String(f.tipoPersona ?? '').toUpperCase(); const regimen = String(f.regimen ?? '').trim(); const tasaIsr = Number(f.tasaIsr ?? 0);
    if (!/^([A-ZÑ&]{3,4})\d{6}[A-Z0-9]{3}$/.test(rfc) || !nombre || !/^\d{5}$/.test(codigoPostal) || !['FISICA','MORAL'].includes(tipoPersona) || !regimen || tasaIsr < 0 || tasaIsr > 100) return res.status(400).json({ error: 'La configuración fiscal no es válida.' });
    await pool.execute(
      `INSERT INTO configuracion_fiscal(id,rfc,nombre_razon_social,tipo_persona,codigo_postal,regimen_fiscal,tasa_isr_preliminar,actualizado_por)
       VALUES(1,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE rfc=VALUES(rfc),nombre_razon_social=VALUES(nombre_razon_social),tipo_persona=VALUES(tipo_persona),codigo_postal=VALUES(codigo_postal),regimen_fiscal=VALUES(regimen_fiscal),tasa_isr_preliminar=VALUES(tasa_isr_preliminar),actualizado_por=VALUES(actualizado_por)`,
      [rfc,nombre,tipoPersona,codigoPostal,regimen,tasaIsr,req.user.sub],
    );
    await pool.execute(`INSERT INTO bitacora(usuario_id,modulo,accion,descripcion) VALUES(?,'Fiscal','CONFIGURAR','Actualización de datos fiscales')`, [req.user.sub]);
    return res.status(204).end();
  } catch (error) { return next(error); }
});

businessRouter.post('/cfdi', requireRole('Administrador'), async (_req, res) => {
  if (!config.pac.provider || !config.pac.apiUrl || !config.pac.apiKey) return res.status(503).json({ error: 'La emisión CFDI está bloqueada hasta configurar un PAC autorizado.' });
  return res.status(501).json({ error: `El adaptador de ${config.pac.provider} requiere definir el contrato específico de su API.` });
});

businessRouter.get('/backups/export', requireRole('Administrador'), async (req, res, next) => {
  let backupId;
  try {
    const name = `abarrotes-pedernal-${new Date().toISOString().replace(/[:.]/g,'-')}.sql`;
    const [record] = await pool.execute(`INSERT INTO respaldos(usuario_id,nombre_archivo,tipo,version_esquema,estado) VALUES(?,?,'MANUAL','1','CREANDO')`, [req.user.sub, name]);
    backupId = record.insertId;
    const dump = await mysqlProcess('mysqldump', ['--single-transaction','--routines','--triggers','--set-gtid-purged=OFF','--default-character-set=utf8mb4', config.database.database]);
    await pool.execute("UPDATE respaldos SET tamanio_bytes=?,estado='COMPLETADO' WHERE id=?", [dump.length, backupId]);
    await pool.execute(`INSERT INTO bitacora(usuario_id,modulo,accion,descripcion,entidad,entidad_id) VALUES(?,'Respaldos','EXPORTAR',?,'RESPALDO',?)`, [req.user.sub, name, backupId]);
    res.setHeader('Content-Type', 'application/sql; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    return res.send(dump);
  } catch (error) {
    if (backupId) await pool.execute("UPDATE respaldos SET estado='FALLIDO',mensaje_error=? WHERE id=?", [String(error.message).slice(0,500), backupId]).catch(() => undefined);
    return next(error);
  }
});

businessRouter.post('/backups/import', requireRole('Administrador'), express.text({ type: ['application/sql','text/plain'], limit: '50mb' }), async (req, res, next) => {
  try {
    if (req.headers['x-confirm-restore'] !== 'RESTAURAR') return res.status(400).json({ error: 'Falta la confirmación de restauración.' });
    const sql = String(req.body ?? '');
    if (sql.length < 100 || !sql.includes('CREATE TABLE') || !sql.includes('usuarios')) return res.status(400).json({ error: 'El archivo SQL no parece pertenecer a este sistema.' });
    await mysqlProcess('mysql', ['--default-character-set=utf8mb4', config.database.database], sql);
    await pool.execute(`INSERT INTO bitacora(usuario_id,modulo,accion,descripcion) VALUES(?,'Respaldos','RESTAURAR','Restauración SQL ejecutada por administrador')`, [req.user.sub]);
    return res.json({ restored: true });
  } catch (error) { return next(error); }
});

businessRouter.get('/cash/current', async (req, res, next) => {
  try {
    const [[session]] = await pool.execute(
      `SELECT id, estado, fondo_inicial AS fondoInicial, fecha_apertura AS fechaApertura
       FROM sesiones_caja WHERE usuario_apertura_id=? AND estado='ABIERTA'
       ORDER BY fecha_apertura DESC LIMIT 1`,
      [req.user.sub],
    );
    if (!session) return res.json({ session: null, totals: null, movements: [] });
    const [totalsResult, movementsResult] = await Promise.all([
      pool.execute(
        `SELECT
          COALESCE(SUM(CASE WHEN tipo='INGRESO' AND metodo='EFECTIVO' THEN monto ELSE 0 END),0) AS ingresosEfectivo,
          COALESCE(SUM(CASE WHEN tipo='SALIDA' AND metodo='EFECTIVO' THEN monto ELSE 0 END),0) AS salidasEfectivo,
          COALESCE(SUM(CASE WHEN categoria='VENTA' THEN monto ELSE 0 END),0) AS ventas
         FROM movimientos_caja WHERE sesion_caja_id=?`,
        [session.id],
      ),
      pool.execute(
        `SELECT id,tipo,categoria,descripcion,metodo,monto,referencia,creado_en AS fecha
         FROM movimientos_caja WHERE sesion_caja_id=? ORDER BY creado_en DESC LIMIT 100`,
        [session.id],
      ),
    ]);
    const totals = totalsResult[0][0];
    const movements = movementsResult[0];
    return res.json({
      session,
      totals: {
        ventas: Number(totals.ventas),
        efectivoEsperado: Number(session.fondoInicial) + Number(totals.ingresosEfectivo) - Number(totals.salidasEfectivo),
      },
      movements,
    });
  } catch (error) { return next(error); }
});

businessRouter.post('/cash/open', async (req, res, next) => {
  try {
    const fondoInicial = Number(req.body?.fondoInicial);
    if (!Number.isFinite(fondoInicial) || fondoInicial < 0) return res.status(400).json({ error: 'El fondo inicial no es válido.' });
    const [[open]] = await pool.execute("SELECT id FROM sesiones_caja WHERE usuario_apertura_id=? AND estado='ABIERTA' LIMIT 1", [req.user.sub]);
    if (open) return res.status(409).json({ error: 'Ya tienes una caja abierta.' });
    const [result] = await pool.execute('INSERT INTO sesiones_caja(usuario_apertura_id,fondo_inicial) VALUES(?,?)', [req.user.sub, fondoInicial]);
    await pool.execute(
      `INSERT INTO bitacora(usuario_id,modulo,accion,descripcion) VALUES(?,?,?,?)`,
      [req.user.sub, 'Caja', 'APERTURA', `Apertura con fondo de $${fondoInicial.toFixed(2)}`],
    );
    return res.status(201).json({ id: result.insertId });
  } catch (error) { return next(error); }
});

businessRouter.post('/cash/movements', async (req, res, next) => {
  try {
    const monto = Number(req.body?.monto);
    const tipo = String(req.body?.tipo ?? '').toUpperCase();
    const descripcion = String(req.body?.descripcion ?? '').trim();
    if (!['INGRESO', 'SALIDA'].includes(tipo) || !Number.isFinite(monto) || monto <= 0 || !descripcion) return res.status(400).json({ error: 'Movimiento de caja no válido.' });
    const [[session]] = await pool.execute("SELECT id FROM sesiones_caja WHERE usuario_apertura_id=? AND estado='ABIERTA' LIMIT 1", [req.user.sub]);
    if (!session) return res.status(409).json({ error: 'Debes abrir la caja primero.' });
    const [result] = await pool.execute(
      `INSERT INTO movimientos_caja(sesion_caja_id,usuario_id,tipo,categoria,descripcion,metodo,monto)
       VALUES(?,?,?,'AJUSTE',?,'EFECTIVO',?)`,
      [session.id, req.user.sub, tipo, descripcion, monto],
    );
    return res.status(201).json({ id: result.insertId });
  } catch (error) { return next(error); }
});

businessRouter.post('/cash/close', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const efectivoContado = Number(req.body?.efectivoContado);
    if (!Number.isFinite(efectivoContado) || efectivoContado < 0) return res.status(400).json({ error: 'El efectivo contado no es válido.' });
    await connection.beginTransaction();
    const [[session]] = await connection.execute(
      "SELECT id,fondo_inicial FROM sesiones_caja WHERE usuario_apertura_id=? AND estado='ABIERTA' ORDER BY fecha_apertura DESC LIMIT 1 FOR UPDATE",
      [req.user.sub],
    );
    if (!session) { await connection.rollback(); return res.status(409).json({ error: 'No tienes una caja abierta.' }); }
    const [[totals]] = await connection.execute(
      `SELECT COALESCE(SUM(CASE WHEN tipo='INGRESO' AND metodo='EFECTIVO' THEN monto ELSE 0 END),0) ingresos,
              COALESCE(SUM(CASE WHEN tipo='SALIDA' AND metodo='EFECTIVO' THEN monto ELSE 0 END),0) salidas
       FROM movimientos_caja WHERE sesion_caja_id=?`,
      [session.id],
    );
    const esperado = Number(session.fondo_inicial) + Number(totals.ingresos) - Number(totals.salidas);
    const diferencia = efectivoContado - esperado;
    await connection.execute(
      `UPDATE sesiones_caja SET usuario_cierre_id=?,fecha_cierre=NOW(),efectivo_esperado=?,efectivo_contado=?,diferencia=?,estado='CERRADA',observaciones=? WHERE id=?`,
      [req.user.sub, esperado, efectivoContado, diferencia, String(req.body?.observaciones ?? '').trim() || null, session.id],
    );
    await connection.execute(
      `INSERT INTO bitacora(usuario_id,modulo,accion,descripcion) VALUES(?,?,?,?)`,
      [req.user.sub, 'Caja', 'CIERRE', `Cierre de caja; diferencia $${diferencia.toFixed(2)}`],
    );
    await connection.commit();
    return res.json({ efectivoEsperado: esperado, efectivoContado, diferencia });
  } catch (error) { await connection.rollback(); return next(error); }
  finally { connection.release(); }
});

businessRouter.post('/sales', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const metodo = String(req.body?.metodo ?? '').toUpperCase();
    const clienteId = req.body?.clienteId ? Number(req.body.clienteId) : null;
    if (!items.length || !['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'FIADO'].includes(metodo)) return res.status(400).json({ error: 'La venta no contiene productos o forma de pago válida.' });
    if (metodo === 'FIADO' && !clienteId) return res.status(400).json({ error: 'Selecciona el cliente para la venta a fiado.' });

    await connection.beginTransaction();
    const [[session]] = await connection.execute(
      "SELECT id FROM sesiones_caja WHERE usuario_apertura_id=? AND estado='ABIERTA' ORDER BY fecha_apertura DESC LIMIT 1 FOR UPDATE",
      [req.user.sub],
    );
    if (!session) { await connection.rollback(); return res.status(409).json({ error: 'Debes abrir la caja antes de cobrar.' }); }

    const normalized = new Map();
    for (const item of items) {
      const id = Number(item?.productoId);
      const cantidad = Number(item?.cantidad);
      if (!Number.isInteger(id) || !Number.isFinite(cantidad) || cantidad <= 0) { await connection.rollback(); return res.status(400).json({ error: 'Hay productos con cantidades no válidas.' }); }
      normalized.set(id, (normalized.get(id) ?? 0) + cantidad);
    }

    const details = [];
    let subtotal = 0;
    let impuestos = 0;
    for (const [productoId, cantidad] of normalized) {
      const [[product]] = await connection.execute(
        `SELECT id,nombre,stock_actual,costo,precio_venta,tasa_iva,permite_venta_sin_stock,activo
         FROM productos WHERE id=? FOR UPDATE`,
        [productoId],
      );
      if (!product?.activo) { await connection.rollback(); return res.status(400).json({ error: 'Uno de los productos no está disponible.' }); }
      if (!product.permite_venta_sin_stock && Number(product.stock_actual) < cantidad) { await connection.rollback(); return res.status(409).json({ error: `Existencia insuficiente para ${product.nombre}.` }); }
      const base = Number(product.precio_venta) * cantidad;
      const tax = base * Number(product.tasa_iva) / 100;
      subtotal += base;
      impuestos += tax;
      details.push({ ...product, productoId, cantidad, importe: base + tax });
    }

    const total = Math.round((subtotal + impuestos) * 100) / 100;
    const folio = `V-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const [sale] = await connection.execute(
      `INSERT INTO ventas(sesion_caja_id,usuario_id,cliente_id,folio,subtotal,impuestos,total,notas) VALUES(?,?,?,?,?,?,?,?)`,
      [session.id, req.user.sub, clienteId, folio, subtotal, impuestos, total, String(req.body?.notas ?? '').trim() || null],
    );
    for (const detail of details) {
      await connection.execute(
        `INSERT INTO venta_detalles(venta_id,producto_id,cantidad,precio_unitario,costo_unitario,tasa_iva,importe) VALUES(?,?,?,?,?,?,?)`,
        [sale.insertId, detail.productoId, detail.cantidad, detail.precio_venta, detail.costo, detail.tasa_iva, detail.importe],
      );
      const nuevoStock = Number(detail.stock_actual) - detail.cantidad;
      await connection.execute('UPDATE productos SET stock_actual=? WHERE id=?', [nuevoStock, detail.productoId]);
      await connection.execute(
        `INSERT INTO movimientos_inventario(producto_id,usuario_id,tipo,cantidad,stock_anterior,stock_nuevo,referencia_tipo,referencia_id,motivo)
         VALUES(?,?,'SALIDA',?,?,?,?,?,'Venta')`,
        [detail.productoId, req.user.sub, detail.cantidad, detail.stock_actual, nuevoStock, 'VENTA', sale.insertId],
      );
    }
    await connection.execute('INSERT INTO venta_pagos(venta_id,metodo,monto,referencia) VALUES(?,?,?,?)', [sale.insertId, metodo, total, String(req.body?.referencia ?? '').trim() || null]);
    await connection.execute(
      `INSERT INTO movimientos_caja(sesion_caja_id,usuario_id,venta_id,tipo,categoria,descripcion,metodo,monto,referencia)
       VALUES(?,?,?,'INGRESO','VENTA',?,?,?,?)`,
      [session.id, req.user.sub, sale.insertId, `Venta ${folio}`, metodo, total, String(req.body?.referencia ?? '').trim() || null],
    );
    if (metodo === 'FIADO') {
      await connection.execute(
        `INSERT INTO fiados(cliente_id,venta_id,usuario_id,fecha_limite,deuda_original,saldo_pendiente,estado)
         VALUES(?,?,?,DATE_ADD(CURRENT_DATE,INTERVAL 30 DAY),?,?, 'PENDIENTE')`,
        [clienteId, sale.insertId, req.user.sub, total, total],
      );
    }
    await connection.execute(
      `INSERT INTO bitacora(usuario_id,modulo,accion,descripcion) VALUES(?,?,?,?)`,
      [req.user.sub, 'Ventas', 'CREAR', `Venta ${folio} por $${total.toFixed(2)}`],
    );
    await connection.commit();
    return res.status(201).json({ id: sale.insertId, folio, subtotal, impuestos, total });
  } catch (error) { await connection.rollback(); return next(error); }
  finally { connection.release(); }
});

businessRouter.get('/sales/:id', async (req, res, next) => {
  try {
    const [[sale]] = await pool.execute(
      `SELECT v.id,v.folio,v.fecha_venta AS fecha,v.estado,v.subtotal,v.impuestos,v.total,u.nombre AS usuario,
              c.nombre AS cliente,GROUP_CONCAT(DISTINCT vp.metodo) AS metodo
       FROM ventas v JOIN usuarios u ON u.id=v.usuario_id LEFT JOIN clientes c ON c.id=v.cliente_id
       LEFT JOIN venta_pagos vp ON vp.venta_id=v.id WHERE v.id=? GROUP BY v.id`,
      [req.params.id],
    );
    if (!sale) return res.status(404).json({ error: 'Venta no encontrada.' });
    const [items] = await pool.execute(
      `SELECT vd.producto_id AS productoId,p.nombre,vd.cantidad,vd.precio_unitario AS precioUnitario,vd.importe
       FROM venta_detalles vd JOIN productos p ON p.id=vd.producto_id WHERE vd.venta_id=? ORDER BY vd.id`,
      [req.params.id],
    );
    return res.json({ ...sale, items });
  } catch (error) { return next(error); }
});

businessRouter.post('/sales/:id/cancel', requireRole('Administrador','Gerente'), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const motivo = String(req.body?.motivo ?? '').trim();
    if (motivo.length < 5) return res.status(400).json({ error: 'Indica el motivo de la cancelación.' });
    await connection.beginTransaction();
    const [[sale]] = await connection.execute('SELECT * FROM ventas WHERE id=? FOR UPDATE', [req.params.id]);
    if (!sale) { await connection.rollback(); return res.status(404).json({ error: 'Venta no encontrada.' }); }
    if (sale.estado !== 'COMPLETADA') { await connection.rollback(); return res.status(409).json({ error: 'La venta ya fue cancelada o devuelta.' }); }
    const [items] = await connection.execute('SELECT * FROM venta_detalles WHERE venta_id=?', [sale.id]);
    for (const item of items) {
      const [[product]] = await connection.execute('SELECT stock_actual FROM productos WHERE id=? FOR UPDATE', [item.producto_id]);
      const nuevoStock = Number(product.stock_actual) + Number(item.cantidad);
      await connection.execute('UPDATE productos SET stock_actual=? WHERE id=?', [nuevoStock, item.producto_id]);
      await connection.execute(
        `INSERT INTO movimientos_inventario(producto_id,usuario_id,tipo,cantidad,stock_anterior,stock_nuevo,referencia_tipo,referencia_id,motivo)
         VALUES(?,?,'DEVOLUCION',?,?,?,?,?,'Cancelación de venta')`,
        [item.producto_id, req.user.sub, item.cantidad, product.stock_actual, nuevoStock, 'VENTA', sale.id],
      );
    }
    const [[payment]] = await connection.execute('SELECT metodo,referencia FROM venta_pagos WHERE venta_id=? ORDER BY id LIMIT 1', [sale.id]);
    await connection.execute("UPDATE ventas SET estado='CANCELADA',notas=CONCAT(COALESCE(notas,''),' | Cancelación: ',?) WHERE id=?", [motivo, sale.id]);
    if (payment?.metodo !== 'FIADO') {
      await connection.execute(
        `INSERT INTO movimientos_caja(sesion_caja_id,usuario_id,venta_id,tipo,categoria,descripcion,metodo,monto,referencia)
         VALUES(?,?,?,'SALIDA','CANCELACION',?,?,?,?)`,
        [sale.sesion_caja_id, req.user.sub, sale.id, `Cancelación ${sale.folio}`, payment?.metodo ?? 'OTRO', sale.total, payment?.referencia ?? null],
      );
    } else {
      await connection.execute("UPDATE fiados SET estado='CANCELADO',saldo_pendiente=0,notas=? WHERE venta_id=? AND estado<>'LIQUIDADO'", [motivo, sale.id]);
    }
    await connection.execute(
      `INSERT INTO bitacora(usuario_id,modulo,accion,descripcion,entidad,entidad_id) VALUES(?,'Ventas','CANCELAR',?,'VENTA',?)`,
      [req.user.sub, `${sale.folio}: ${motivo}`, sale.id],
    );
    await connection.commit();
    return res.json({ id: sale.id, estado: 'CANCELADA' });
  } catch (error) { await connection.rollback(); return next(error); }
  finally { connection.release(); }
});

businessRouter.get('/purchases', requireRole('Administrador','Gerente'), async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id,c.folio,c.fecha_compra AS fecha,c.estado,c.metodo_pago AS metodoPago,c.total,c.saldo_pendiente AS saldoPendiente,
              p.empresa AS proveedor,u.nombre AS usuario
       FROM compras c JOIN proveedores p ON p.id=c.proveedor_id JOIN usuarios u ON u.id=c.usuario_id
       ORDER BY c.fecha_compra DESC LIMIT 500`,
    );
    return res.json(rows);
  } catch (error) { return next(error); }
});

businessRouter.post('/purchases', requireRole('Administrador','Gerente'), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const proveedorId = Number(req.body?.proveedorId);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const metodoPago = String(req.body?.metodoPago ?? 'CREDITO').toUpperCase();
    if (!Number.isInteger(proveedorId) || !items.length || !['EFECTIVO','TARJETA','TRANSFERENCIA','CREDITO','OTRO'].includes(metodoPago)) return res.status(400).json({ error: 'La compra no es válida.' });
    await connection.beginTransaction();
    const [[provider]] = await connection.execute("SELECT id FROM proveedores WHERE id=? AND estado<>'ARCHIVADO'", [proveedorId]);
    if (!provider) { await connection.rollback(); return res.status(400).json({ error: 'Proveedor no válido.' }); }
    const details = [];
    let subtotal = 0;
    let taxes = 0;
    for (const item of items) {
      const productoId = Number(item?.productoId); const cantidad = Number(item?.cantidad); const costo = Number(item?.costoUnitario);
      if (!Number.isInteger(productoId) || !Number.isFinite(cantidad) || cantidad <= 0 || !Number.isFinite(costo) || costo < 0) { await connection.rollback(); return res.status(400).json({ error: 'Hay partidas de compra no válidas.' }); }
      const [[product]] = await connection.execute('SELECT id,stock_actual,tasa_iva FROM productos WHERE id=? AND activo=TRUE FOR UPDATE', [productoId]);
      if (!product) { await connection.rollback(); return res.status(400).json({ error: 'Uno de los productos no existe.' }); }
      const base = cantidad * costo; const tax = base * Number(product.tasa_iva) / 100;
      subtotal += base; taxes += tax; details.push({ product, productoId, cantidad, costo, importe: base + tax });
    }
    const total = Math.round((subtotal + taxes) * 100) / 100;
    const folio = String(req.body?.folio ?? '').trim() || `C-${Date.now()}`;
    const balance = metodoPago === 'CREDITO' ? total : 0;
    const [purchase] = await connection.execute(
      `INSERT INTO compras(proveedor_id,usuario_id,folio,estado,metodo_pago,subtotal,impuestos,total,saldo_pendiente,notas)
       VALUES(?, ?, ?, 'RECIBIDA', ?, ?, ?, ?, ?, ?)`,
      [proveedorId, req.user.sub, folio, metodoPago, subtotal, taxes, total, balance, String(req.body?.notas ?? '').trim() || null],
    );
    for (const detail of details) {
      await connection.execute(
        `INSERT INTO compra_detalles(compra_id,producto_id,cantidad,costo_unitario,tasa_iva,importe) VALUES(?,?,?,?,?,?)`,
        [purchase.insertId, detail.productoId, detail.cantidad, detail.costo, detail.product.tasa_iva, detail.importe],
      );
      const nuevoStock = Number(detail.product.stock_actual) + detail.cantidad;
      await connection.execute('UPDATE productos SET stock_actual=?,costo=? WHERE id=?', [nuevoStock, detail.costo, detail.productoId]);
      await connection.execute(
        `INSERT INTO movimientos_inventario(producto_id,usuario_id,tipo,cantidad,stock_anterior,stock_nuevo,costo_unitario,referencia_tipo,referencia_id,motivo)
         VALUES(?,?,'ENTRADA',?,?,?,?,? ,?,'Compra recibida')`,
        [detail.productoId, req.user.sub, detail.cantidad, detail.product.stock_actual, nuevoStock, detail.costo, 'COMPRA', purchase.insertId],
      );
    }
    await connection.execute(
      `INSERT INTO bitacora(usuario_id,modulo,accion,descripcion,entidad,entidad_id) VALUES(?,'Compras','RECIBIR',?,'COMPRA',?)`,
      [req.user.sub, `Compra ${folio} por $${total.toFixed(2)}`, purchase.insertId],
    );
    await connection.commit();
    return res.status(201).json({ id: purchase.insertId, folio, total });
  } catch (error) { await connection.rollback(); return next(error); }
  finally { connection.release(); }
});

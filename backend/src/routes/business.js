import express, { Router } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, statfs } from 'node:fs/promises';
import { pool } from '../database.js';
import { config } from '../config.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createAutomaticBackup } from '../backup-scheduler.js';

export const businessRouter = Router();
businessRouter.use(requireAuth);

businessRouter.get('/system/health', requireRole('Administrador'), async (_req, res, next) => {
  try {
    const started = Date.now();
    const [databaseResult, backupResult, disk] = await Promise.all([
      pool.query('SELECT NOW() AS hora,COUNT(*) AS conexiones FROM information_schema.PROCESSLIST WHERE DB=?', [config.database.database]),
      pool.query("SELECT nombre_archivo AS nombre,estado,creado_en AS fecha,mensaje_error AS error FROM respaldos ORDER BY creado_en DESC LIMIT 1"),
      statfs(process.cwd()),
    ]);
    const database = databaseResult[0][0];
    const backupRows = backupResult[0];
    const ultimoRespaldo = backupRows[0] ?? null;
    return res.json({
      api: { estado: 'OK', uptimeSegundos: Math.floor(process.uptime()) },
      database: { estado: 'OK', hora: database.hora, conexiones: Number(database.conexiones), latenciaMs: Date.now() - started },
      backup: { estado: ultimoRespaldo?.estado ?? 'SIN_RESPALDOS', ...ultimoRespaldo },
      disk: { libreBytes: Number(disk.bavail) * Number(disk.bsize), totalBytes: Number(disk.blocks) * Number(disk.bsize) },
      ambiente: process.env.NODE_ENV ?? 'development',
      version: process.env.APP_VERSION ?? '1.0.0',
      offsiteBackup: { configurado: Boolean(config.backups.offsiteDirectory) },
    });
  } catch (error) { return next(error); }
});

function mysqlProcess(command, extraArgs = [], input = null) {
  return new Promise((resolve, reject) => {
    const executable = command === 'mysqldump' ? config.database.mysqldumpCommand : command === 'mysql' ? config.database.mysqlCommand : command;
    const args = ['-h', config.database.host, '-P', String(config.database.port), '-u', config.database.user, ...extraArgs];
    const child = spawn(executable, args, { env: { ...process.env, MYSQL_PWD: config.database.password } });
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
      pool.execute(`SELECT v.folio,v.total,COALESCE((SELECT GROUP_CONCAT(vp.metodo ORDER BY vp.id SEPARATOR ' + ') FROM venta_pagos vp WHERE vp.venta_id=v.id),'OTRO') AS metodo,DATE_FORMAT(v.fecha_venta,'%H:%i') AS hora FROM ventas v WHERE v.estado='COMPLETADA'${filtroUsuario} ORDER BY v.fecha_venta DESC LIMIT 5`, parametros),
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
  try { const [rows] = await pool.query(`SELECT c.id,c.nombre,c.telefono,c.correo,c.direccion,c.rfc,c.codigo_postal_fiscal AS codigoPostalFiscal,c.regimen_fiscal AS regimenFiscal,c.uso_cfdi AS usoCfdi,c.activo,c.limite_credito AS limiteCredito,COALESCE(SUM(f.saldo_pendiente),0) AS adeudo,COALESCE(SUM(CASE WHEN f.saldo_pendiente>0 AND f.fecha_limite<CURRENT_DATE AND f.estado NOT IN('LIQUIDADO','CANCELADO') THEN 1 ELSE 0 END),0) AS fiadosVencidos,(SELECT COALESCE(SUM(s.monto-s.monto_usado),0) FROM saldos_clientes s WHERE s.cliente_id=c.id AND s.estado='PENDIENTE') AS saldoFavor FROM clientes c LEFT JOIN fiados f ON f.cliente_id=c.id AND f.estado NOT IN ('LIQUIDADO','CANCELADO') GROUP BY c.id ORDER BY c.nombre`); res.json(rows); } catch (e) { next(e); }
});
businessRouter.get('/clients/:id/account',async(req,res,next)=>{try{const [[client]]=await pool.execute(`SELECT c.id,c.nombre,c.telefono,c.limite_credito AS limiteCredito,COALESCE((SELECT SUM(f.saldo_pendiente) FROM fiados f WHERE f.cliente_id=c.id AND f.estado NOT IN('LIQUIDADO','CANCELADO')),0) AS adeudo,COALESCE((SELECT SUM(s.monto-s.monto_usado) FROM saldos_clientes s WHERE s.cliente_id=c.id AND s.estado='PENDIENTE'),0) AS saldoFavor FROM clientes c WHERE c.id=?`,[req.params.id]);if(!client)return res.status(404).json({error:'Cliente no encontrado.'});const [credits]=await pool.execute(`SELECT f.id,f.fecha_registro AS fechaRegistro,f.fecha_limite AS fechaLimite,f.deuda_original AS deudaOriginal,f.saldo_pendiente AS saldoPendiente,f.estado,v.folio FROM fiados f LEFT JOIN ventas v ON v.id=f.venta_id WHERE f.cliente_id=? ORDER BY f.fecha_registro DESC`,[req.params.id]);const [payments]=await pool.execute(`SELECT a.id,a.fiado_id AS fiadoId,a.monto,a.metodo,a.referencia,a.creado_en AS fecha,u.nombre AS usuario FROM fiado_abonos a JOIN fiados f ON f.id=a.fiado_id JOIN usuarios u ON u.id=a.usuario_id WHERE f.cliente_id=? ORDER BY a.creado_en DESC`,[req.params.id]);const [balances]=await pool.execute(`SELECT id,monto,IF(estado='PENDIENTE',monto_usado,monto) AS montoUsado,IF(estado='PENDIENTE',monto-monto_usado,0) AS disponible,estado,creado_en AS fecha,liquidado_en AS liquidadoEn FROM saldos_clientes WHERE cliente_id=? ORDER BY creado_en DESC`,[req.params.id]);return res.json({client,credits,payments,balances});}catch(error){return next(error);}});
businessRouter.post('/clients', async (req, res, next) => {
  try { const { nombre, telefono = '', correo = null, direccion = null } = req.body;const limiteCredito=Number(req.body?.limiteCredito??0);if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre o referencia del cliente es obligatorio.' });if(!Number.isFinite(limiteCredito)||limiteCredito<0)return res.status(400).json({error:'El límite de crédito no es válido.'});const telefonoLimpio=String(telefono).trim();if(telefonoLimpio){const [[existente]]=await pool.execute('SELECT id FROM clientes WHERE telefono=? AND activo=TRUE LIMIT 1',[telefonoLimpio]);if(existente)return res.status(409).json({error:'Ya existe un cliente activo con ese teléfono.',clienteId:existente.id});} const [result] = await pool.execute('INSERT INTO clientes (nombre,telefono,correo,direccion,limite_credito) VALUES (?,?,?,?,?)',[nombre.trim(),telefonoLimpio,correo?.trim()||null,direccion?.trim()||null,limiteCredito]); res.status(201).json({ id: result.insertId }); } catch(e){ next(e); }
});
businessRouter.put('/clients/:id/fiscal',requireRole('Administrador'),async(req,res,next)=>{try{const rfc=String(req.body?.rfc??'').trim().toUpperCase(),nombre=String(req.body?.nombre??'').trim(),cp=String(req.body?.codigoPostalFiscal??'').trim(),regimen=String(req.body?.regimenFiscal??'').trim(),uso=String(req.body?.usoCfdi??'').trim().toUpperCase();if(!/^([A-ZÑ&]{3,4})\d{6}[A-Z0-9]{3}$/.test(rfc)||!nombre||!/^\d{5}$/.test(cp)||!/^\d{3}$/.test(regimen)||!uso)return res.status(400).json({error:'RFC, nombre, código postal, régimen y uso CFDI son obligatorios.'});await pool.execute('UPDATE clientes SET nombre=?,rfc=?,codigo_postal_fiscal=?,regimen_fiscal=?,uso_cfdi=? WHERE id=?',[nombre,rfc,cp,regimen,uso,req.params.id]);await pool.execute(`INSERT INTO bitacora(usuario_id,modulo,accion,descripcion,entidad,entidad_id) VALUES(?,'Fiscal','DATOS_RECEPTOR',?,'CLIENTE',?)`,[req.user.sub,`Datos fiscales actualizados para ${rfc}`,req.params.id]);return res.status(204).end();}catch(error){return next(error);}});

businessRouter.get('/products', async (_req,res,next)=>{ try { const [rows]=await pool.query(`SELECT p.id,p.codigo_barras AS codigo,p.nombre,c.nombre AS categoria,p.unidad_medida AS unidadMedida,p.stock_actual AS stock,p.stock_minimo AS stockMinimo,p.costo,p.precio_venta AS precioVenta,p.tasa_iva AS tasaIva,p.activo,(SELECT pp.proveedor_id FROM proveedor_productos pp WHERE pp.producto_id=p.id AND pp.es_principal=TRUE LIMIT 1) AS proveedorId,(SELECT pp.codigo_proveedor FROM proveedor_productos pp WHERE pp.producto_id=p.id AND pp.es_principal=TRUE LIMIT 1) AS numeroProveedor,(SELECT pr.empresa FROM proveedor_productos pp JOIN proveedores pr ON pr.id=pp.proveedor_id WHERE pp.producto_id=p.id AND pp.es_principal=TRUE LIMIT 1) AS proveedor,(SELECT pr.tipo FROM promociones pr WHERE pr.activa=TRUE AND NOW() BETWEEN pr.fecha_inicio AND pr.fecha_fin AND (pr.producto_id=p.id OR (pr.producto_id IS NULL AND pr.categoria_id=p.categoria_id)) ORDER BY pr.producto_id IS NOT NULL DESC,pr.id DESC LIMIT 1) AS promoTipo,(SELECT pr.valor FROM promociones pr WHERE pr.activa=TRUE AND NOW() BETWEEN pr.fecha_inicio AND pr.fecha_fin AND (pr.producto_id=p.id OR (pr.producto_id IS NULL AND pr.categoria_id=p.categoria_id)) ORDER BY pr.producto_id IS NOT NULL DESC,pr.id DESC LIMIT 1) AS promoValor FROM productos p LEFT JOIN categorias c ON c.id=p.categoria_id WHERE p.activo=TRUE ORDER BY p.nombre`); res.json(rows); }catch(e){next(e);} });
businessRouter.get('/promotions',requireRole('Administrador','Gerente'),async(_req,res,next)=>{try{const [rows]=await pool.query(`SELECT pr.id,pr.nombre,pr.tipo,pr.valor,pr.producto_id AS productoId,p.nombre AS producto,pr.fecha_inicio AS fechaInicio,pr.fecha_fin AS fechaFin,pr.activa FROM promociones pr LEFT JOIN productos p ON p.id=pr.producto_id ORDER BY pr.fecha_fin DESC`);res.json(rows);}catch(e){next(e);}});
businessRouter.post('/promotions',requireRole('Administrador','Gerente'),async(req,res,next)=>{try{const p=req.body;const tipo=String(p.tipo??'').toUpperCase();if(!p.nombre?.trim()||!['PORCENTAJE','PRECIO_ESPECIAL','DOS_POR_UNO','TRES_POR_DOS'].includes(tipo)||!p.productoId||!p.fechaInicio||!p.fechaFin||new Date(p.fechaFin)<=new Date(p.fechaInicio))return res.status(400).json({error:'La promoción no es válida.'});const [r]=await pool.execute(`INSERT INTO promociones(nombre,tipo,valor,producto_id,fecha_inicio,fecha_fin,creado_por) VALUES(?,?,?,?,?,?,?)`,[p.nombre.trim(),tipo,Number(p.valor)||0,p.productoId,p.fechaInicio,p.fechaFin,req.user.sub]);res.status(201).json({id:r.insertId});}catch(e){next(e);}});
businessRouter.patch('/promotions/:id/status',requireRole('Administrador','Gerente'),async(req,res,next)=>{try{await pool.execute('UPDATE promociones SET activa=? WHERE id=?',[Boolean(req.body.activa),req.params.id]);res.status(204).end();}catch(e){next(e);}});
businessRouter.get('/lots/alerts',requireRole('Administrador','Gerente'),async(_req,res,next)=>{try{const [rows]=await pool.query(`SELECT l.id,l.producto_id AS productoId,p.nombre,l.lote,l.fecha_caducidad AS fechaCaducidad,l.cantidad_disponible AS cantidad,DATEDIFF(l.fecha_caducidad,CURRENT_DATE) AS dias FROM producto_lotes l JOIN productos p ON p.id=l.producto_id WHERE l.cantidad_disponible>0 AND l.fecha_caducidad IS NOT NULL AND l.fecha_caducidad<=DATE_ADD(CURRENT_DATE,INTERVAL 30 DAY) ORDER BY l.fecha_caducidad`);res.json(rows);}catch(e){next(e);}});
businessRouter.get('/inventory/movements',requireRole('Administrador','Gerente'),async(req,res,next)=>{try{const productoId=Number(req.query?.productoId)||null;const [rows]=await pool.execute(`SELECT mi.id,mi.producto_id AS productoId,p.nombre,p.unidad_medida AS unidadMedida,mi.tipo,mi.cantidad,mi.stock_anterior AS stockAnterior,mi.stock_nuevo AS stockNuevo,mi.costo_unitario AS costoUnitario,mi.motivo,mi.creado_en AS fecha,u.nombre AS usuario FROM movimientos_inventario mi JOIN productos p ON p.id=mi.producto_id JOIN usuarios u ON u.id=mi.usuario_id WHERE (? IS NULL OR mi.producto_id=?) ORDER BY mi.creado_en DESC LIMIT 150`,[productoId,productoId]);return res.json(rows);}catch(error){return next(error);}});
businessRouter.post('/inventory/receipts',requireRole('Administrador','Gerente'),async(req,res,next)=>{const connection=await pool.getConnection();try{const productoId=Number(req.body?.productoId),cantidad=Number(req.body?.cantidad),costo=Number(req.body?.costo),lote=String(req.body?.lote??'').trim(),fechaCaducidad=String(req.body?.fechaCaducidad??'').trim()||null,motivo=String(req.body?.motivo??'Recepción manual').trim();if(!Number.isInteger(productoId)||!Number.isFinite(cantidad)||cantidad<=0||!Number.isFinite(costo)||costo<0)return res.status(400).json({error:'Producto, cantidad y costo son obligatorios.'});if(fechaCaducidad&&Number.isNaN(new Date(`${fechaCaducidad}T00:00:00`).getTime()))return res.status(400).json({error:'La fecha de caducidad no es válida.'});await connection.beginTransaction();const [[product]]=await connection.execute('SELECT stock_actual FROM productos WHERE id=? AND activo=TRUE FOR UPDATE',[productoId]);if(!product){await connection.rollback();return res.status(404).json({error:'Producto no encontrado.'});}const nuevo=Number(product.stock_actual)+cantidad;await connection.execute('UPDATE productos SET stock_actual=?,costo=? WHERE id=?',[nuevo,costo,productoId]);await connection.execute(`INSERT INTO movimientos_inventario(producto_id,usuario_id,tipo,cantidad,stock_anterior,stock_nuevo,costo_unitario,motivo) VALUES(?,?,'ENTRADA',?,?,?,?,?)`,[productoId,req.user.sub,cantidad,product.stock_actual,nuevo,costo,motivo||'Recepción manual']);if(lote)await connection.execute(`INSERT INTO producto_lotes(producto_id,lote,fecha_caducidad,cantidad_inicial,cantidad_disponible,costo_unitario) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE cantidad_inicial=cantidad_inicial+VALUES(cantidad_inicial),cantidad_disponible=cantidad_disponible+VALUES(cantidad_disponible),fecha_caducidad=COALESCE(VALUES(fecha_caducidad),fecha_caducidad),costo_unitario=VALUES(costo_unitario)`,[productoId,lote,fechaCaducidad,cantidad,cantidad,costo]);await connection.commit();return res.status(201).json({stock:nuevo});}catch(error){await connection.rollback();return next(error);}finally{connection.release();}});
businessRouter.patch('/products/:id/inventory-settings',requireRole('Administrador','Gerente'),async(req,res,next)=>{try{const unidad=String(req.body?.unidadMedida??'').trim();const minimo=Number(req.body?.stockMinimo);if(!['Pieza','Kilogramo','Gramo','Litro'].includes(unidad)||!Number.isFinite(minimo)||minimo<0)return res.status(400).json({error:'Unidad o existencia mínima no válida.'});await pool.execute('UPDATE productos SET unidad_medida=?,stock_minimo=? WHERE id=?',[unidad,minimo,req.params.id]);return res.status(204).end();}catch(error){return next(error);}});
businessRouter.post('/products', requireRole('Administrador','Gerente'), async(req,res,next)=>{
  const connection=await pool.getConnection();
  try {
    const codigo=String(req.body?.codigo??'').trim()||null,nombre=String(req.body?.nombre??'').trim(),categoria=String(req.body?.categoria??'').trim(),unidadMedida=String(req.body?.unidadMedida??'Pieza').trim();
    const stock=Number(req.body?.stock??0),stockMinimo=Number(req.body?.stockMinimo??0),costo=Number(req.body?.costo??0),precioVenta=Number(req.body?.precioVenta),tasaIva=Number(req.body?.tasaIva??0),proveedorId=Number(req.body?.proveedorId)||null,numeroProveedor=String(req.body?.numeroProveedor??'').trim()||null;
    if(!nombre||!categoria||!['Pieza','Kilogramo'].includes(unidadMedida)||![stock,stockMinimo,costo,precioVenta,tasaIva].every(Number.isFinite)||stock<0||stockMinimo<0||costo<0||precioVenta<=0||tasaIva<0||unidadMedida==='Pieza'&&(!Number.isInteger(stock)||!Number.isInteger(stockMinimo)))return res.status(400).json({error:'Nombre, categoría, unidad, existencia y precio de venta válidos son obligatorios.'});
    await connection.beginTransaction();
    if(codigo){const [[existente]]=await connection.execute('SELECT id FROM productos WHERE codigo_barras=? LIMIT 1',[codigo]);if(existente){await connection.rollback();return res.status(409).json({error:'Ya existe un producto con ese código de barras.'});}}
    const [[existenteNombre]]=await connection.execute('SELECT id FROM productos WHERE LOWER(nombre)=LOWER(?) AND activo=TRUE LIMIT 1',[nombre]);
    if(existenteNombre){await connection.rollback();return res.status(409).json({error:'Ese producto ya existe. Selecciónalo desde el catálogo del proveedor para registrar la entrada.'});}
    const [cats]=await connection.execute('SELECT id FROM categorias WHERE nombre=? LIMIT 1',[categoria]);
    let categoriaId=cats[0]?.id;
    if(!categoriaId){const [cat]=await connection.execute('INSERT INTO categorias(nombre) VALUES(?)',[categoria]);categoriaId=cat.insertId;}
    const [result]=await connection.execute('INSERT INTO productos(categoria_id,codigo_barras,nombre,unidad_medida,stock_actual,stock_minimo,costo,precio_venta,tasa_iva) VALUES(?,?,?,?,?,?,?,?,?)',[categoriaId,codigo,nombre,unidadMedida,stock,stockMinimo,costo,precioVenta,tasaIva]);
    if(proveedorId)await connection.execute(`INSERT INTO proveedor_productos(proveedor_id,producto_id,codigo_proveedor,costo_ultimo,es_principal) VALUES(?,?,?,?,TRUE)`,[proveedorId,result.insertId,numeroProveedor,costo]);
    await connection.commit();
    return res.status(201).json({id:result.insertId});
  }catch(e){await connection.rollback();return next(e);}finally{connection.release();}
});
businessRouter.patch('/products/:id/provider',requireRole('Administrador','Gerente'),async(req,res,next)=>{try{const proveedorId=Number(req.body?.proveedorId),numeroProveedor=String(req.body?.numeroProveedor??'').trim()||null;if(!Number.isInteger(proveedorId))return res.status(400).json({error:'Selecciona un proveedor válido.'});const [[producto]]=await pool.execute('SELECT costo FROM productos WHERE id=? AND activo=TRUE',[req.params.id]);if(!producto)return res.status(404).json({error:'Producto no encontrado.'});await pool.execute('UPDATE proveedor_productos SET es_principal=FALSE WHERE producto_id=?',[req.params.id]);await pool.execute(`INSERT INTO proveedor_productos(proveedor_id,producto_id,codigo_proveedor,costo_ultimo,es_principal) VALUES(?,?,?,?,TRUE) ON DUPLICATE KEY UPDATE codigo_proveedor=VALUES(codigo_proveedor),costo_ultimo=VALUES(costo_ultimo),es_principal=TRUE`,[proveedorId,req.params.id,numeroProveedor,producto.costo]);return res.status(204).end();}catch(error){return next(error);}});
businessRouter.put('/products/:id',requireRole('Administrador','Gerente'),async(req,res,next)=>{const c=await pool.getConnection();try{const nombre=String(req.body?.nombre??'').trim(),codigo=String(req.body?.codigo??'').trim()||null,categoria=String(req.body?.categoria??'').trim(),unidad=String(req.body?.unidadMedida??'').trim(),costo=Number(req.body?.costo),precio=Number(req.body?.precioVenta),iva=Number(req.body?.tasaIva),minimo=Number(req.body?.stockMinimo),proveedorId=Number(req.body?.proveedorId)||null,numeroProveedor=String(req.body?.numeroProveedor??'').trim()||null;if(!nombre||!categoria||!['Pieza','Kilogramo'].includes(unidad)||![costo,precio,iva,minimo].every(Number.isFinite)||costo<0||precio<=0||iva<0||iva>100||minimo<0)return res.status(400).json({error:'Los datos del producto no son válidos.'});await c.beginTransaction();const [[cat]]=await c.execute('SELECT id FROM categorias WHERE nombre=?',[categoria]);let categoriaId=cat?.id;if(!categoriaId){const [r]=await c.execute('INSERT INTO categorias(nombre) VALUES(?)',[categoria]);categoriaId=r.insertId;}await c.execute('UPDATE productos SET categoria_id=?,codigo_barras=?,nombre=?,unidad_medida=?,costo=?,precio_venta=?,tasa_iva=?,stock_minimo=? WHERE id=? AND activo=TRUE',[categoriaId,codigo,nombre,unidad,costo,precio,iva,minimo,req.params.id]);await c.execute('UPDATE proveedor_productos SET es_principal=FALSE WHERE producto_id=?',[req.params.id]);if(proveedorId)await c.execute(`INSERT INTO proveedor_productos(proveedor_id,producto_id,codigo_proveedor,costo_ultimo,es_principal) VALUES(?,?,?,?,TRUE) ON DUPLICATE KEY UPDATE codigo_proveedor=VALUES(codigo_proveedor),costo_ultimo=VALUES(costo_ultimo),es_principal=TRUE`,[proveedorId,req.params.id,numeroProveedor,costo]);await c.commit();return res.status(204).end();}catch(error){await c.rollback();if(error?.code==='ER_DUP_ENTRY')return res.status(409).json({error:'El código de barras ya pertenece a otro producto.'});return next(error);}finally{c.release();}});
businessRouter.delete('/products/:id',requireRole('Administrador','Gerente'),async(req,res,next)=>{try{const [r]=await pool.execute('UPDATE productos SET activo=FALSE WHERE id=? AND activo=TRUE',[req.params.id]);if(!r.affectedRows)return res.status(404).json({error:'Producto no encontrado.'});await pool.execute(`INSERT INTO bitacora(usuario_id,modulo,accion,descripcion,entidad,entidad_id) VALUES(?,'Inventario','ELIMINAR','Producto desactivado; se conservó su historial','PRODUCTO',?)`,[req.user.sub,req.params.id]);return res.status(204).end();}catch(error){return next(error);}});
businessRouter.patch('/products/:id/stock', requireRole('Administrador','Gerente'), async(req,res,next)=>{ const connection=await pool.getConnection(); try { await connection.beginTransaction(); const [[p]]=await connection.execute('SELECT stock_actual FROM productos WHERE id=? FOR UPDATE',[req.params.id]); if(!p) return res.status(404).json({error:'Producto no encontrado.'}); const cantidad=Number(req.body.cantidad); const nuevo=Number(p.stock_actual)+cantidad; if(!Number.isFinite(cantidad)||cantidad===0||nuevo<0) return res.status(400).json({error:'El ajuste de existencia no es válido.'}); await connection.execute('UPDATE productos SET stock_actual=? WHERE id=?',[nuevo,req.params.id]); await connection.execute(`INSERT INTO movimientos_inventario(producto_id,usuario_id,tipo,cantidad,stock_anterior,stock_nuevo,motivo) VALUES(?,?,?,?,?,?,?)`,[req.params.id,req.user.sub,cantidad>0?'ENTRADA':'SALIDA',Math.abs(cantidad),p.stock_actual,nuevo,req.body.motivo||'Ajuste desde aplicación']); await connection.commit();res.json({stock:nuevo}); }catch(e){await connection.rollback();next(e);}finally{connection.release();} });
businessRouter.post('/products/:id/waste',requireRole('Administrador','Gerente'),async(req,res,next)=>{const c=await pool.getConnection();try{const cantidad=Number(req.body.cantidad),motivo=String(req.body.motivo??'').trim();if(cantidad<=0||motivo.length<4)return res.status(400).json({error:'Cantidad y motivo de merma son obligatorios.'});await c.beginTransaction();const [[p]]=await c.execute('SELECT stock_actual FROM productos WHERE id=? FOR UPDATE',[req.params.id]);if(!p||Number(p.stock_actual)<cantidad){await c.rollback();return res.status(409).json({error:'Existencia insuficiente para registrar la merma.'});}const nuevo=Number(p.stock_actual)-cantidad;await c.execute('UPDATE productos SET stock_actual=? WHERE id=?',[nuevo,req.params.id]);await c.execute(`INSERT INTO movimientos_inventario(producto_id,usuario_id,tipo,cantidad,stock_anterior,stock_nuevo,motivo) VALUES(?,?,'MERMA',?,?,?,?)`,[req.params.id,req.user.sub,cantidad,p.stock_actual,nuevo,motivo]);await c.commit();res.json({stock:nuevo});}catch(e){await c.rollback();next(e);}finally{c.release();}});
businessRouter.post('/products/:id/count',requireRole('Administrador','Gerente'),async(req,res,next)=>{const c=await pool.getConnection();try{const contado=Number(req.body.stockContado),motivo=String(req.body.motivo??'Conteo físico').trim();if(!Number.isFinite(contado)||contado<0)return res.status(400).json({error:'El conteo no es válido.'});await c.beginTransaction();const [[p]]=await c.execute('SELECT stock_actual FROM productos WHERE id=? FOR UPDATE',[req.params.id]);if(!p){await c.rollback();return res.status(404).json({error:'Producto no encontrado.'});}const diferencia=contado-Number(p.stock_actual);if(diferencia!==0){await c.execute('UPDATE productos SET stock_actual=? WHERE id=?',[contado,req.params.id]);await c.execute(`INSERT INTO movimientos_inventario(producto_id,usuario_id,tipo,cantidad,stock_anterior,stock_nuevo,motivo) VALUES(?,?,'AJUSTE',?,?,?,?)`,[req.params.id,req.user.sub,Math.abs(diferencia),p.stock_actual,contado,motivo]);}await c.commit();res.json({stock:contado,diferencia});}catch(e){await c.rollback();next(e);}finally{c.release();}});

businessRouter.get('/providers', async(_req,res,next)=>{try{const [rows]=await pool.query(`SELECT id,empresa,contacto AS nombre,telefono,correo,producto_principal AS productoPrincipal,dia_entrega AS diaEntrega,estado FROM proveedores WHERE estado<>'ARCHIVADO' ORDER BY empresa`);res.json(rows);}catch(e){next(e);}});
businessRouter.post('/providers',requireRole('Administrador','Gerente'),async(req,res,next)=>{try{const p=req.body;const [r]=await pool.execute(`INSERT INTO proveedores(empresa,contacto,telefono,correo,producto_principal,dia_entrega,estado) VALUES(?,?,?,?,?,?,?)`,[p.empresa,p.nombre,p.telefono,p.correo||null,p.productoPrincipal||null,p.diaEntrega||null,'ACTIVO']);res.status(201).json({id:r.insertId});}catch(e){next(e);}});
businessRouter.put('/providers/:id',requireRole('Administrador','Gerente'),async(req,res,next)=>{try{const p=req.body;await pool.execute(`UPDATE proveedores SET empresa=?,contacto=?,telefono=?,correo=?,producto_principal=?,dia_entrega=?,estado=? WHERE id=?`,[p.empresa,p.nombre,p.telefono,p.correo||null,p.productoPrincipal||null,p.diaEntrega||null,String(p.estado).toUpperCase(),req.params.id]);res.status(204).end();}catch(e){next(e);}});
businessRouter.delete('/providers/:id',requireRole('Administrador','Gerente'),async(req,res,next)=>{try{await pool.execute("UPDATE proveedores SET estado='ARCHIVADO' WHERE id=?",[req.params.id]);res.status(204).end();}catch(e){next(e);}});

businessRouter.get('/credits',async(_req,res,next)=>{try{const [rows]=await pool.query(`SELECT f.id,f.cliente_id AS clienteId,c.nombre AS cliente,c.telefono,f.deuda_original AS deudaOriginal,f.saldo_pendiente AS saldoPendiente,COALESCE((SELECT a.monto FROM fiado_abonos a WHERE a.fiado_id=f.id ORDER BY a.creado_en DESC LIMIT 1),0) AS ultimoAbono,c.limite_credito AS limite,DATE_FORMAT(f.fecha_registro,'%Y-%m-%d') AS fechaRegistro,DATE_FORMAT(f.fecha_limite,'%Y-%m-%d') AS fechaLimite,f.estado FROM fiados f JOIN clientes c ON c.id=f.cliente_id ORDER BY f.fecha_registro DESC`);res.json(rows);}catch(e){next(e);}});
businessRouter.post('/credits',(req,res,next)=>{const deuda=Number(req.body?.deudaOriginal);if(!Number.isFinite(deuda)||deuda<=0)return res.status(400).json({error:'El fiado debe ser mayor a cero.'});return next();});
businessRouter.post('/credits',async(req,res,next)=>{try{const clienteId=Number(req.body?.clienteId);if(!clienteId)return next();const [[row]]=await pool.execute(`SELECT COUNT(*) AS vencidos FROM fiados WHERE cliente_id=? AND saldo_pendiente>0 AND fecha_limite<CURRENT_DATE AND estado NOT IN('LIQUIDADO','CANCELADO')`,[clienteId]);if(Number(row.vencidos)>0)return res.status(409).json({error:'El cliente tiene fiados vencidos. Debe regularizar su cuenta antes de recibir otro crédito.'});return next();}catch(error){return next(error);}});
businessRouter.post('/credits',async(req,res,next)=>{try{const f=req.body;let clientId=Number(f.clienteId)||null;if(!clientId){const [clients]=await pool.execute('SELECT id FROM clientes WHERE telefono=? LIMIT 1',[f.telefono]);clientId=clients[0]?.id;if(!clientId){const [r]=await pool.execute('INSERT INTO clientes(nombre,telefono,limite_credito) VALUES(?,?,?)',[f.cliente,f.telefono,f.limite||0]);clientId=r.insertId;}}const [[client]]=await pool.execute(`SELECT limite_credito,(SELECT COALESCE(SUM(saldo_pendiente),0) FROM fiados WHERE cliente_id=clientes.id AND estado NOT IN('LIQUIDADO','CANCELADO')) adeudo FROM clientes WHERE id=? AND activo=TRUE`,[clientId]);if(!client)return res.status(400).json({error:'Cliente no válido.'});const deuda=Number(f.deudaOriginal);if(Number(client.limite_credito)>0&&Number(client.adeudo)+deuda>Number(client.limite_credito))return res.status(409).json({error:`El crédito supera el límite disponible de $${Math.max(0,Number(client.limite_credito)-Number(client.adeudo)).toFixed(2)}.`});const [r]=await pool.execute(`INSERT INTO fiados(cliente_id,usuario_id,fecha_limite,deuda_original,saldo_pendiente) VALUES(?,?,?,?,?)`,[clientId,req.user.sub,f.fechaLimite,deuda,deuda]);res.status(201).json({id:r.insertId});}catch(e){next(e);}});
businessRouter.post('/credits/:id/payments',async(req,res,next)=>{const c=await pool.getConnection();try{await c.beginTransaction();const [[f]]=await c.execute('SELECT saldo_pendiente FROM fiados WHERE id=? FOR UPDATE',[req.params.id]);const monto=Number(req.body.monto);const metodo=String(req.body.metodo||'EFECTIVO').toUpperCase();if(!f||monto<=0||monto>f.saldo_pendiente){await c.rollback();return res.status(400).json({error:'Abono inválido.'});}await c.execute(`INSERT INTO fiado_abonos(fiado_id,usuario_id,monto,metodo,referencia) VALUES(?,?,?,?,?)`,[req.params.id,req.user.sub,monto,metodo,req.body.referencia||null]);const saldo=Number(f.saldo_pendiente)-monto;await c.execute(`UPDATE fiados SET saldo_pendiente=?,estado=? WHERE id=?`,[saldo,saldo===0?'LIQUIDADO':'PENDIENTE',req.params.id]);const [[session]]=await c.execute("SELECT id FROM sesiones_caja WHERE usuario_apertura_id=? AND estado='ABIERTA' LIMIT 1",[req.user.sub]);if(session)await c.execute(`INSERT INTO movimientos_caja(sesion_caja_id,usuario_id,tipo,categoria,descripcion,metodo,monto,referencia) VALUES(?,?,'INGRESO','ABONO_FIADO',?,?,?,?)`,[session.id,req.user.sub,`Abono fiado #${req.params.id}`,metodo,monto,req.body.referencia||null]);await c.commit();res.json({saldoPendiente:saldo});}catch(e){await c.rollback();next(e);}finally{c.release();}});

businessRouter.get('/audit',requireRole('Administrador'),async(_req,res,next)=>{try{const [rows]=await pool.query(`SELECT b.id,b.modulo,b.accion,b.descripcion,b.creado_en AS fecha,COALESCE(u.nombre,'Sistema') AS usuario,COALESCE(r.nombre,'Sin rol') AS rol FROM bitacora b LEFT JOIN usuarios u ON u.id=b.usuario_id LEFT JOIN roles r ON r.id=u.rol_id ORDER BY b.creado_en DESC LIMIT 500`);res.json(rows);}catch(e){next(e);}});
businessRouter.get('/statistics',requireRole('Administrador','Gerente'),async(_req,res,next)=>{try{const [[sales]]=await pool.query(`SELECT COALESCE(SUM(total),0) total,COUNT(*) operaciones FROM ventas WHERE estado='COMPLETADA' AND fecha_venta>=DATE_SUB(NOW(),INTERVAL 30 DAY)`);const [daily]=await pool.query(`SELECT * FROM vista_ventas_diarias WHERE fecha>=DATE_SUB(CURRENT_DATE,INTERVAL 30 DAY) ORDER BY fecha`);const [[credits]]=await pool.query(`SELECT COALESCE(SUM(saldo_pendiente),0) pendiente,COALESCE(SUM(CASE WHEN fecha_limite<CURRENT_DATE THEN saldo_pendiente ELSE 0 END),0) vencido FROM fiados WHERE estado NOT IN('LIQUIDADO','CANCELADO')`);res.json({sales,daily,credits});}catch(e){next(e);}});

businessRouter.get('/analytics', requireRole('Administrador','Gerente'), async (_req, res, next) => {
  try {
    const [salesResult, productsResult, creditsResult, cashResult, remindersResult] = await Promise.all([
      pool.query(
        `SELECT v.id AS ventaId,DATE_FORMAT(v.fecha_venta,'%Y-%m-%d') AS fecha,HOUR(v.fecha_venta) AS hora,
                vd.importe AS total,(vd.costo_unitario*vd.cantidad) AS costo,
                CASE WHEN COALESCE(vp.cantidad,0)>1 THEN 'Múltiple'
                  ELSE CASE COALESCE(vp.metodo,'OTRO') WHEN 'EFECTIVO' THEN 'Efectivo' WHEN 'TARJETA' THEN 'Tarjeta'
                  WHEN 'TRANSFERENCIA' THEN 'Transferencia' WHEN 'FIADO' THEN 'Fiado' ELSE 'Otro' END END AS metodo,
                COALESCE(c.nombre,'Sin categoría') AS categoria,p.nombre AS producto,vd.cantidad AS unidades
         FROM ventas v JOIN venta_detalles vd ON vd.venta_id=v.id JOIN productos p ON p.id=vd.producto_id
         LEFT JOIN categorias c ON c.id=p.categoria_id
         LEFT JOIN (
           SELECT venta_id,COUNT(*) AS cantidad,SUBSTRING_INDEX(GROUP_CONCAT(metodo ORDER BY id),',',1) AS metodo
           FROM venta_pagos GROUP BY venta_id
         ) vp ON vp.venta_id=v.id
         WHERE v.estado='COMPLETADA' AND v.fecha_venta>=DATE_SUB(CURRENT_DATE,INTERVAL 1 YEAR)
         ORDER BY v.fecha_venta`,
      ),
      pool.query(
        `SELECT p.nombre AS producto,COALESCE(c.nombre,'Sin categoría') AS categoria,p.stock_actual AS stock,
                p.stock_minimo AS minimo,COALESCE(ventas.vendidos,0) AS vendidos,
                p.precio_venta AS precio,p.costo,
                COALESCE(DATEDIFF(CURRENT_DATE,ventas.ultimaVenta),999) AS diasSinVenta,
                COALESCE((SELECT SUM(mi.cantidad) FROM movimientos_inventario mi WHERE mi.producto_id=p.id AND mi.tipo='MERMA' AND mi.creado_en>=DATE_SUB(CURRENT_DATE,INTERVAL 30 DAY)),0) AS merma
         FROM productos p LEFT JOIN categorias c ON c.id=p.categoria_id
         LEFT JOIN (
           SELECT vd.producto_id,SUM(vd.cantidad) AS vendidos,MAX(DATE(v.fecha_venta)) AS ultimaVenta
           FROM venta_detalles vd JOIN ventas v ON v.id=vd.venta_id
           WHERE v.estado='COMPLETADA' AND v.fecha_venta>=DATE_SUB(CURRENT_DATE,INTERVAL 1 YEAR)
           GROUP BY vd.producto_id
         ) ventas ON ventas.producto_id=p.id
         WHERE p.activo=TRUE ORDER BY p.nombre`,
      ),
      pool.query(
        `SELECT c.nombre AS cliente,f.saldo_pendiente AS saldo,(f.fecha_limite<CURRENT_DATE AND f.saldo_pendiente>0) AS vencido,
                COALESCE(SUM(a.monto),0) AS abonos
         FROM fiados f JOIN clientes c ON c.id=f.cliente_id LEFT JOIN fiado_abonos a ON a.fiado_id=f.id
         WHERE f.estado<>'CANCELADO' GROUP BY f.id ORDER BY f.fecha_registro DESC`,
      ),
      pool.query(
        `SELECT sc.id,ua.nombre AS responsable,sc.fecha_apertura AS fechaApertura,sc.fecha_cierre AS fechaCierre,
                sc.efectivo_esperado AS esperado,sc.efectivo_contado AS contado,sc.diferencia,sc.observaciones
         FROM sesiones_caja sc JOIN usuarios ua ON ua.id=sc.usuario_apertura_id
         WHERE sc.estado='CERRADA' AND sc.fecha_cierre>=DATE_SUB(NOW(),INTERVAL 90 DAY)
         ORDER BY sc.fecha_cierre DESC LIMIT 100`,
      ),
      pool.query(
        `SELECT tipo,titulo,detalle,nivel,ruta FROM (
           SELECT 'FIADO' tipo,'Cobranza vencida' titulo,
             CONCAT(c.nombre,' debe $',FORMAT(SUM(f.saldo_pendiente),2)) detalle,'URGENTE' nivel,'/fiados' ruta,1 orden
           FROM fiados f JOIN clientes c ON c.id=f.cliente_id
           WHERE f.saldo_pendiente>0 AND f.fecha_limite<CURRENT_DATE AND f.estado NOT IN('LIQUIDADO','CANCELADO') GROUP BY c.id
           UNION ALL
           SELECT 'INVENTARIO','Existencia baja',CONCAT(p.nombre,': ',FORMAT(p.stock_actual,3),' de mínimo ',FORMAT(p.stock_minimo,3)),
             IF(p.stock_actual=0,'URGENTE','ATENCION'),'/inventario',2 FROM productos p WHERE p.activo=TRUE AND p.stock_actual<=p.stock_minimo
           UNION ALL
           SELECT 'CADUCIDAD','Producto por caducar',CONCAT(p.nombre,' · lote ',l.lote,' · ',DATE_FORMAT(l.fecha_caducidad,'%d/%m/%Y')),
             IF(l.fecha_caducidad<=DATE_ADD(CURRENT_DATE,INTERVAL 7 DAY),'URGENTE','ATENCION'),'/inventario',3
           FROM producto_lotes l JOIN productos p ON p.id=l.producto_id WHERE l.cantidad_disponible>0 AND l.fecha_caducidad<=DATE_ADD(CURRENT_DATE,INTERVAL 30 DAY)
           UNION ALL
           SELECT 'RECARGA','Recarga sin conciliar',CONCAT(r.compania,' ',r.telefono,' · $',FORMAT(r.monto,2)),'ATENCION','/caja',4
           FROM recargas r WHERE r.estado='PENDIENTE' AND r.creada_en<DATE_SUB(NOW(),INTERVAL 10 MINUTE)
           UNION ALL
           SELECT 'CAJA','Caja abierta por demasiado tiempo',CONCAT(u.nombre,' · abrió ',DATE_FORMAT(sc.fecha_apertura,'%d/%m %H:%i')),'URGENTE','/caja',5
           FROM sesiones_caja sc JOIN usuarios u ON u.id=sc.usuario_apertura_id WHERE sc.estado='ABIERTA' AND sc.fecha_apertura<DATE_SUB(NOW(),INTERVAL 15 HOUR)
           UNION ALL
           SELECT 'COMPRA','Entrega de proveedor atrasada',CONCAT(pr.empresa,' · entrega ',DATE_FORMAT(co.fecha_entrega,'%d/%m/%Y')),'ATENCION','/compras',6
           FROM compras co JOIN proveedores pr ON pr.id=co.proveedor_id WHERE co.estado IN('PEDIDA','PARCIAL','ATRASADA') AND co.fecha_entrega<CURRENT_DATE
         ) alertas ORDER BY orden,nivel DESC LIMIT 50`,
      ),
    ]);
    return res.json({ sales: salesResult[0], products: productsResult[0], credits: creditsResult[0], cashClosures: cashResult[0], reminders: remindersResult[0] });
  } catch (error) { return next(error); }
});

businessRouter.get('/reports', requireRole('Administrador','Gerente'), async (_req, res, next) => {
  try {
    const [salesResult, inventoryResult, creditsResult] = await Promise.all([
      pool.query(
        `SELECT v.id,v.folio,v.fecha_venta AS fecha,u.nombre AS usuario,
                COALESCE((SELECT GROUP_CONCAT(vp.metodo ORDER BY vp.id SEPARATOR ' + ') FROM venta_pagos vp WHERE vp.venta_id=v.id),'OTRO') AS metodoPago,
                COALESCE((SELECT SUM(vd.cantidad) FROM venta_detalles vd WHERE vd.venta_id=v.id),0) AS productos,v.total
         FROM ventas v JOIN usuarios u ON u.id=v.usuario_id
         WHERE v.estado='COMPLETADA' ORDER BY v.fecha_venta DESC LIMIT 5000`,
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
  try { const [rows] = await pool.query(`SELECT id,nombre_archivo AS nombre,tipo,ubicacion,tamanio_bytes AS tamanio,checksum,estado,creado_en AS fecha,mensaje_error AS error FROM respaldos ORDER BY creado_en DESC LIMIT 100`); return res.json(rows); }
  catch (error) { return next(error); }
});
businessRouter.post('/backups/automatic',requireRole('Administrador'),async(req,res,next)=>{try{const result=await createAutomaticBackup();if(!result)return res.status(409).json({error:'Ya hay un respaldo automático en proceso.'});await pool.execute(`INSERT INTO bitacora(usuario_id,modulo,accion,descripcion,entidad,entidad_id) VALUES(?,'Respaldos','SOLICITAR_AUTOMATICO',?,'RESPALDO',?)`,[req.user.sub,result.name,result.id]);return res.status(201).json({id:result.id,nombre:result.name,tamanio:result.size,checksum:result.checksum});}catch(error){return next(error);}});
businessRouter.post('/backups/:id/verify',requireRole('Administrador'),async(req,res,next)=>{try{const [[backup]]=await pool.execute("SELECT id,ubicacion,checksum,estado FROM respaldos WHERE id=? AND tipo='AUTOMATICO'",[req.params.id]);if(!backup?.ubicacion||backup.estado!=='COMPLETADO')return res.status(404).json({error:'Respaldo automático no disponible para verificar.'});const file=await readFile(backup.ubicacion);const checksum=createHash('sha256').update(file).digest('hex');const valido=checksum===backup.checksum;await pool.execute(`INSERT INTO bitacora(usuario_id,modulo,accion,descripcion,entidad,entidad_id) VALUES(?,'Respaldos','VERIFICAR',?,'RESPALDO',?)`,[req.user.sub,valido?'Integridad correcta':'Integridad incorrecta',backup.id]);return res.json({valido,checksum,tamanio:file.length});}catch(error){return next(error);}});

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

businessRouter.get('/invoices',requireRole('Administrador'),async(_req,res,next)=>{try{const [rows]=await pool.query(`SELECT f.id,f.tipo,f.fecha_inicio AS fechaInicio,f.fecha_fin AS fechaFin,f.rfc_receptor AS rfcReceptor,f.nombre_receptor AS receptor,f.subtotal,f.descuento,f.impuestos,f.total,f.estado,f.uuid,f.proveedor_pac AS proveedorPac,f.creado_en AS fecha,COUNT(fv.venta_id) AS ventas FROM facturas_borrador f LEFT JOIN factura_borrador_ventas fv ON fv.factura_id=f.id GROUP BY f.id ORDER BY f.creado_en DESC LIMIT 200`);return res.json(rows);}catch(error){return next(error);}});
businessRouter.get('/invoices/preview',requireRole('Administrador'),async(req,res,next)=>{try{const tipo=String(req.query?.tipo??'GLOBAL').toUpperCase(),inicio=String(req.query?.inicio??''),fin=String(req.query?.fin??''),clienteId=Number(req.query?.clienteId)||null;if(!['GLOBAL','INDIVIDUAL'].includes(tipo)||!/^\d{4}-\d{2}-\d{2}$/.test(inicio)||!/^\d{4}-\d{2}-\d{2}$/.test(fin)||inicio>fin||tipo==='INDIVIDUAL'&&!clienteId)return res.status(400).json({error:'Tipo, periodo o cliente no válido.'});const [sales]=await pool.execute(`SELECT v.id,v.folio,v.fecha_venta AS fecha,v.subtotal,v.descuento,v.impuestos,v.total FROM ventas v WHERE v.estado='COMPLETADA' AND DATE(v.fecha_venta) BETWEEN ? AND ? AND (?='GLOBAL' AND v.cliente_id IS NULL OR ?='INDIVIDUAL' AND v.cliente_id=?) AND NOT EXISTS(SELECT 1 FROM factura_borrador_ventas fv JOIN facturas_borrador f ON f.id=fv.factura_id WHERE fv.venta_id=v.id AND f.estado<>'CANCELADA') ORDER BY v.fecha_venta`,[inicio,fin,tipo,tipo,clienteId]);const totals=sales.reduce((a,v)=>({subtotal:a.subtotal+Number(v.subtotal),descuento:a.descuento+Number(v.descuento),impuestos:a.impuestos+Number(v.impuestos),total:a.total+Number(v.total)}),{subtotal:0,descuento:0,impuestos:0,total:0});return res.json({tipo,inicio,fin,ventas:sales,totals});}catch(error){return next(error);}});
businessRouter.post('/invoices',requireRole('Administrador'),async(req,res,next)=>{const connection=await pool.getConnection();try{const tipo=String(req.body?.tipo??'').toUpperCase(),inicio=String(req.body?.inicio??''),fin=String(req.body?.fin??''),clienteId=Number(req.body?.clienteId)||null,periodicidad=String(req.body?.periodicidad??'').trim(),meses=String(req.body?.meses??'').trim(),anio=Number(req.body?.anio);if(!['GLOBAL','INDIVIDUAL'].includes(tipo)||!/^\d{4}-\d{2}-\d{2}$/.test(inicio)||!/^\d{4}-\d{2}-\d{2}$/.test(fin)||inicio>fin||tipo==='INDIVIDUAL'&&!clienteId)return res.status(400).json({error:'Datos de factura no válidos.'});if(tipo==='GLOBAL'&&(!periodicidad||!meses||!Number.isInteger(anio)))return res.status(400).json({error:'Periodicidad, mes y año son obligatorios para factura global.'});await connection.beginTransaction();const [[emisor]]=await connection.execute('SELECT codigo_postal FROM configuracion_fiscal WHERE id=1');if(!emisor){await connection.rollback();return res.status(409).json({error:'Configura primero los datos fiscales del emisor.'});}let receptor;if(tipo==='INDIVIDUAL'){const [[client]]=await connection.execute('SELECT id,nombre,rfc,codigo_postal_fiscal,regimen_fiscal,uso_cfdi FROM clientes WHERE id=? AND activo=TRUE',[clienteId]);if(!client?.rfc||!client.codigo_postal_fiscal||!client.regimen_fiscal||!client.uso_cfdi){await connection.rollback();return res.status(409).json({error:'El cliente no tiene completos sus datos fiscales CFDI 4.0.'});}receptor={rfc:client.rfc,nombre:client.nombre,cp:client.codigo_postal_fiscal,regimen:client.regimen_fiscal,uso:client.uso_cfdi};}else receptor={rfc:'XAXX010101000',nombre:'PUBLICO EN GENERAL',cp:emisor.codigo_postal,regimen:'616',uso:'S01'};const [sales]=await connection.execute(`SELECT v.id,v.subtotal,v.descuento,v.impuestos,v.total FROM ventas v WHERE v.estado='COMPLETADA' AND DATE(v.fecha_venta) BETWEEN ? AND ? AND (?='GLOBAL' AND v.cliente_id IS NULL OR ?='INDIVIDUAL' AND v.cliente_id=?) AND NOT EXISTS(SELECT 1 FROM factura_borrador_ventas fv JOIN facturas_borrador f ON f.id=fv.factura_id WHERE fv.venta_id=v.id AND f.estado<>'CANCELADA') FOR UPDATE`,[inicio,fin,tipo,tipo,clienteId]);if(!sales.length){await connection.rollback();return res.status(409).json({error:'No hay ventas disponibles para este borrador.'});}const totals=sales.reduce((a,v)=>({subtotal:a.subtotal+Number(v.subtotal),descuento:a.descuento+Number(v.descuento),impuestos:a.impuestos+Number(v.impuestos),total:a.total+Number(v.total)}),{subtotal:0,descuento:0,impuestos:0,total:0});const [invoice]=await connection.execute(`INSERT INTO facturas_borrador(tipo,cliente_id,fecha_inicio,fecha_fin,periodicidad,meses,anio,rfc_receptor,nombre_receptor,regimen_receptor,codigo_postal_receptor,uso_cfdi,subtotal,descuento,impuestos,total,creado_por) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[tipo,clienteId,inicio,fin,tipo==='GLOBAL'?periodicidad:null,tipo==='GLOBAL'?meses:null,tipo==='GLOBAL'?anio:null,receptor.rfc,receptor.nombre,receptor.regimen,receptor.cp,receptor.uso,totals.subtotal,totals.descuento,totals.impuestos,totals.total,req.user.sub]);for(const sale of sales)await connection.execute('INSERT INTO factura_borrador_ventas(factura_id,venta_id) VALUES(?,?)',[invoice.insertId,sale.id]);await connection.execute(`INSERT INTO bitacora(usuario_id,modulo,accion,descripcion,entidad,entidad_id) VALUES(?,'Fiscal','CREAR_BORRADOR',?,'FACTURA',?)`,[req.user.sub,`${tipo} con ${sales.length} ventas por $${totals.total.toFixed(2)}`,invoice.insertId]);await connection.commit();return res.status(201).json({id:invoice.insertId,ventas:sales.length,...totals,estado:'BORRADOR'});}catch(error){await connection.rollback();return next(error);}finally{connection.release();}});
businessRouter.post('/invoices/:id/stamp',requireRole('Administrador'),async(req,res,next)=>{try{const [[invoice]]=await pool.execute("SELECT id,estado FROM facturas_borrador WHERE id=?",[req.params.id]);if(!invoice)return res.status(404).json({error:'Borrador no encontrado.'});if(invoice.estado!=='BORRADOR'&&invoice.estado!=='ERROR')return res.status(409).json({error:'El documento no está disponible para timbrado.'});if(!config.pac.provider||!config.pac.apiUrl||!config.pac.apiKey)return res.status(503).json({error:'Timbrado bloqueado: configura un PAC autorizado en el servidor.'});return res.status(501).json({error:`Falta implementar el adaptador contractual del PAC ${config.pac.provider}.`});}catch(error){return next(error);}});

businessRouter.get('/backups/export', requireRole('Administrador'), async (req, res, next) => {
  let backupId;
  try {
    const name = `abarrotes-pedernal-${new Date().toISOString().replace(/[:.]/g,'-')}.sql`;
    const [record] = await pool.execute(`INSERT INTO respaldos(usuario_id,nombre_archivo,tipo,version_esquema,estado) VALUES(?,?,'MANUAL','1','CREANDO')`, [req.user.sub, name]);
    backupId = record.insertId;
    const dump = await mysqlProcess('mysqldump', ['--single-transaction','--routines','--triggers','--set-gtid-purged=OFF','--default-character-set=utf8mb4', config.database.database]);
    const checksum=createHash('sha256').update(dump).digest('hex');
    await pool.execute("UPDATE respaldos SET tamanio_bytes=?,checksum=?,estado='COMPLETADO' WHERE id=?", [dump.length,checksum, backupId]);
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
    const emergency=await createAutomaticBackup();
    if(!emergency)return res.status(409).json({error:'Espera a que termine el respaldo actual antes de restaurar.'});
    const importChecksum=createHash('sha256').update(sql).digest('hex');
    await mysqlProcess('mysql', ['--default-character-set=utf8mb4', config.database.database], sql);
    await pool.execute(`INSERT INTO bitacora(usuario_id,modulo,accion,descripcion) VALUES(?,'Respaldos','RESTAURAR',?)`, [req.user.sub,`Restauración SQL ${importChecksum.slice(0,12)} · respaldo previo ${emergency.name}`]);
    return res.json({ restored: true,checksum:importChecksum,respaldoPrevio:emergency.name });
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
          COALESCE(SUM(CASE WHEN categoria='VENTA' THEN monto ELSE 0 END),0) AS ventas,
          COALESCE(SUM(CASE WHEN categoria='VENTA' AND metodo='EFECTIVO' THEN monto ELSE 0 END),0) AS ventasEfectivo,
          COALESCE(SUM(CASE WHEN categoria='VENTA' AND metodo='TARJETA' THEN monto ELSE 0 END),0) AS ventasTarjeta,
          COALESCE(SUM(CASE WHEN categoria='VENTA' AND metodo='TRANSFERENCIA' THEN monto ELSE 0 END),0) AS ventasTransferencia,
          COALESCE(SUM(CASE WHEN categoria='VENTA' AND metodo='FIADO' THEN monto ELSE 0 END),0) AS ventasFiado
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
        ventasEfectivo: Number(totals.ventasEfectivo),
        ventasTarjeta: Number(totals.ventasTarjeta),
        ventasTransferencia: Number(totals.ventasTransferencia),
        ventasFiado: Number(totals.ventasFiado),
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

businessRouter.post('/cash/services', async (req,res,next)=>{
  try{
    const tipo=String(req.body?.tipo??'').toUpperCase();
    const compania=String(req.body?.compania??'').toUpperCase().trim();
    const telefono=String(req.body?.telefono??'').trim();
    const monto=Number(req.body?.monto),comision=Number(req.body?.comision??0);
    if(tipo!=='RECARGA'||!compania||!/^\d{10}$/.test(telefono)||!Number.isFinite(monto)||monto<=0||!Number.isFinite(comision)||comision<0||comision>monto)return res.status(400).json({error:'Los datos de la recarga no son válidos.'});
    const [[session]]=await pool.execute("SELECT id FROM sesiones_caja WHERE usuario_apertura_id=? AND estado='ABIERTA' LIMIT 1",[req.user.sub]);
    if(!session)return res.status(409).json({error:'Debes abrir la caja primero.'});
    const [result]=await pool.execute(`INSERT INTO recargas(sesion_caja_id,usuario_id,compania,telefono,monto,comision) VALUES(?,?,?,?,?,?)`,[session.id,req.user.sub,compania,telefono,monto,comision]);
    await pool.execute(`INSERT INTO bitacora(usuario_id,modulo,accion,descripcion,entidad,entidad_id) VALUES(?,'Caja','RECARGA_PENDIENTE',?,'RECARGA',?)`,[req.user.sub,`Recarga ${compania} a ${telefono} por $${monto.toFixed(2)}`,result.insertId]);
    return res.status(201).json({id:result.insertId,estado:'PENDIENTE'});
  }catch(error){return next(error);}
});

businessRouter.get('/recharges',async(req,res,next)=>{try{const [rows]=await pool.execute(`SELECT r.id,r.compania,r.telefono,r.monto,r.comision,r.estado,r.folio_proveedor AS folioProveedor,r.motivo,r.creada_en AS fecha,r.resuelta_en AS fechaResolucion,u.nombre AS usuario,ur.nombre AS resueltaPor FROM recargas r JOIN usuarios u ON u.id=r.usuario_id LEFT JOIN usuarios ur ON ur.id=r.resuelta_por WHERE r.sesion_caja_id IN (SELECT id FROM sesiones_caja WHERE usuario_apertura_id=? OR ? IN (SELECT u2.id FROM usuarios u2 JOIN roles ro ON ro.id=u2.rol_id WHERE ro.nombre IN('Administrador','Gerente'))) ORDER BY r.creada_en DESC LIMIT 150`,[req.user.sub,req.user.sub]);return res.json(rows);}catch(error){return next(error);}});
businessRouter.get('/recharges/reconciliation',async(req,res,next)=>{try{const [[session]]=await pool.execute("SELECT id FROM sesiones_caja WHERE usuario_apertura_id=? AND estado='ABIERTA' LIMIT 1",[req.user.sub]);if(!session)return res.json({total:0,comisiones:0,pendientes:0,exitosas:0,rechazadas:0,canceladas:0,porCompania:[]});const [[summary]]=await pool.execute(`SELECT COALESCE(SUM(CASE WHEN estado='EXITOSA' THEN monto ELSE 0 END),0) total,COALESCE(SUM(CASE WHEN estado='EXITOSA' THEN comision ELSE 0 END),0) comisiones,SUM(estado='PENDIENTE') pendientes,SUM(estado='EXITOSA') exitosas,SUM(estado='RECHAZADA') rechazadas,SUM(estado='CANCELADA') canceladas FROM recargas WHERE sesion_caja_id=?`,[session.id]);const [porCompania]=await pool.execute(`SELECT compania,COUNT(*) operaciones,SUM(CASE WHEN estado='EXITOSA' THEN monto ELSE 0 END) monto,SUM(CASE WHEN estado='EXITOSA' THEN comision ELSE 0 END) comision FROM recargas WHERE sesion_caja_id=? GROUP BY compania ORDER BY compania`,[session.id]);return res.json({...summary,porCompania});}catch(error){return next(error);}});
businessRouter.patch('/recharges/:id/resolve',async(req,res,next)=>{const connection=await pool.getConnection();try{const estado=String(req.body?.estado??'').toUpperCase(),folio=String(req.body?.folioProveedor??'').trim(),motivo=String(req.body?.motivo??'').trim();if(!['EXITOSA','RECHAZADA'].includes(estado)||estado==='EXITOSA'&&!folio||estado==='RECHAZADA'&&motivo.length<4)return res.status(400).json({error:'Folio o motivo requerido para resolver la recarga.'});await connection.beginTransaction();const [[recarga]]=await connection.execute("SELECT * FROM recargas WHERE id=? AND estado='PENDIENTE' FOR UPDATE",[req.params.id]);if(!recarga){await connection.rollback();return res.status(409).json({error:'La recarga ya fue resuelta.'});}await connection.execute('UPDATE recargas SET estado=?,folio_proveedor=?,motivo=?,resuelta_por=?,resuelta_en=NOW() WHERE id=?',[estado,folio||null,motivo||null,req.user.sub,recarga.id]);if(estado==='EXITOSA')await connection.execute(`INSERT INTO movimientos_caja(sesion_caja_id,usuario_id,tipo,categoria,descripcion,metodo,monto,referencia) VALUES(?,?,'INGRESO','RECARGA',?,'EFECTIVO',?,?)`,[recarga.sesion_caja_id,req.user.sub,`Recarga ${recarga.compania} a ${recarga.telefono}`,recarga.monto,folio]);await connection.execute(`INSERT INTO bitacora(usuario_id,modulo,accion,descripcion,entidad,entidad_id) VALUES(?,'Caja',? ,?,'RECARGA',?)`,[req.user.sub,`RECARGA_${estado}`,`${recarga.compania} ${recarga.telefono}: ${estado}`,recarga.id]);await connection.commit();return res.json({id:recarga.id,estado});}catch(error){await connection.rollback();return next(error);}finally{connection.release();}});
businessRouter.post('/recharges/:id/cancel',requireRole('Administrador','Gerente'),async(req,res,next)=>{const connection=await pool.getConnection();try{const motivo=String(req.body?.motivo??'').trim();if(motivo.length<5)return res.status(400).json({error:'Indica el motivo de cancelación.'});await connection.beginTransaction();const [[recarga]]=await connection.execute("SELECT * FROM recargas WHERE id=? AND estado='EXITOSA' FOR UPDATE",[req.params.id]);if(!recarga){await connection.rollback();return res.status(409).json({error:'Solo se puede cancelar una recarga exitosa.'});}const [[session]]=await connection.execute("SELECT id FROM sesiones_caja WHERE usuario_apertura_id=? AND estado='ABIERTA' LIMIT 1",[req.user.sub]);if(!session){await connection.rollback();return res.status(409).json({error:'Abre una caja para registrar el reembolso.'});}await connection.execute("UPDATE recargas SET estado='CANCELADA',motivo=?,resuelta_por=?,resuelta_en=NOW() WHERE id=?",[motivo,req.user.sub,recarga.id]);await connection.execute(`INSERT INTO movimientos_caja(sesion_caja_id,usuario_id,tipo,categoria,descripcion,metodo,monto,referencia) VALUES(?,?,'SALIDA','CANCELACION_RECARGA',?,'EFECTIVO',?,?)`,[session.id,req.user.sub,`Cancelación recarga #${recarga.id}`,recarga.monto,recarga.folio_proveedor]);await connection.commit();return res.json({id:recarga.id,estado:'CANCELADA'});}catch(error){await connection.rollback();return next(error);}finally{connection.release();}});

businessRouter.get('/customer-balances',async(_req,res,next)=>{try{const [rows]=await pool.query(`SELECT s.id,s.cliente_id AS clienteId,c.nombre AS cliente,c.telefono,(s.monto-s.monto_usado) AS monto,s.estado,s.creado_en AS fecha FROM saldos_clientes s JOIN clientes c ON c.id=s.cliente_id WHERE s.estado='PENDIENTE' AND s.monto>s.monto_usado ORDER BY s.creado_en DESC`);return res.json(rows);}catch(error){return next(error);}});
businessRouter.post('/customer-balances',async(req,res,next)=>{try{const clienteId=Number(req.body?.clienteId),monto=Number(req.body?.monto);if(!Number.isInteger(clienteId)||!Number.isFinite(monto)||monto<=0)return res.status(400).json({error:'El cambio pendiente no es válido.'});const [[cliente]]=await pool.execute('SELECT id FROM clientes WHERE id=? AND activo=TRUE',[clienteId]);if(!cliente)return res.status(404).json({error:'Cliente no encontrado.'});const [result]=await pool.execute('INSERT INTO saldos_clientes(cliente_id,usuario_id,monto) VALUES(?,?,?)',[clienteId,req.user.sub,monto]);return res.status(201).json({id:result.insertId});}catch(error){return next(error);}});
businessRouter.patch('/customer-balances/:id/settle',async(req,res,next)=>{const connection=await pool.getConnection();try{await connection.beginTransaction();const [[saldo]]=await connection.execute("SELECT id,monto FROM saldos_clientes WHERE id=? AND estado='PENDIENTE' FOR UPDATE",[req.params.id]);if(!saldo){await connection.rollback();return res.status(404).json({error:'El cambio ya fue entregado o no existe.'});}const [[session]]=await connection.execute("SELECT id FROM sesiones_caja WHERE usuario_apertura_id=? AND estado='ABIERTA' LIMIT 1",[req.user.sub]);if(!session){await connection.rollback();return res.status(409).json({error:'Debes abrir la caja para entregar el cambio.'});}await connection.execute("UPDATE saldos_clientes SET estado='ENTREGADO',liquidado_por=?,liquidado_en=NOW() WHERE id=?",[req.user.sub,saldo.id]);await connection.execute(`INSERT INTO movimientos_caja(sesion_caja_id,usuario_id,tipo,categoria,descripcion,metodo,monto) VALUES(?,?,'SALIDA','CAMBIO_PENDIENTE',?,'EFECTIVO',?)`,[session.id,req.user.sub,`Cambio pendiente #${saldo.id}`,saldo.monto]);await connection.commit();return res.status(204).end();}catch(error){await connection.rollback();return next(error);}finally{connection.release();}});

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
              COALESCE(SUM(CASE WHEN tipo='SALIDA' AND metodo='EFECTIVO' THEN monto ELSE 0 END),0) salidas,
              COALESCE(SUM(CASE WHEN categoria='VENTA' AND metodo='EFECTIVO' THEN monto ELSE 0 END),0) ventasEfectivo,
              COALESCE(SUM(CASE WHEN categoria='VENTA' AND metodo='TARJETA' THEN monto ELSE 0 END),0) ventasTarjeta,
              COALESCE(SUM(CASE WHEN categoria='VENTA' AND metodo='TRANSFERENCIA' THEN monto ELSE 0 END),0) ventasTransferencia,
              COALESCE(SUM(CASE WHEN categoria='VENTA' AND metodo='FIADO' THEN monto ELSE 0 END),0) ventasFiado
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
    return res.json({ sesionId: session.id, fondoInicial: Number(session.fondo_inicial), efectivoEsperado: esperado, efectivoContado, diferencia, ventasEfectivo:Number(totals.ventasEfectivo),ventasTarjeta:Number(totals.ventasTarjeta),ventasTransferencia:Number(totals.ventasTransferencia),ventasFiado:Number(totals.ventasFiado),fechaCierre:new Date().toISOString() });
  } catch (error) { await connection.rollback(); return next(error); }
  finally { connection.release(); }
});

businessRouter.post('/sales', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const metodo = String(req.body?.metodo ?? '').toUpperCase();
    const clienteId = req.body?.clienteId ? Number(req.body.clienteId) : null;
    const plazoDias = Number(req.body?.plazoDias ?? 30);
    const operacionUuid=String(req.body?.operacionUuid??'').trim();
    if(operacionUuid&&!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(operacionUuid))return res.status(400).json({error:'Identificador de operación no válido.'});
    if (!items.length || !['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'FIADO', 'SALDO_FAVOR', 'MIXTO'].includes(metodo)) return res.status(400).json({ error: 'La venta no contiene productos o forma de pago válida.' });
    if (metodo === 'FIADO' && !clienteId) return res.status(400).json({ error: 'Selecciona el cliente para la venta a fiado.' });
    if (!Number.isInteger(plazoDias) || ![7,15,30,45].includes(plazoDias)) return res.status(400).json({ error: 'Selecciona un plazo de crédito válido.' });

    await connection.beginTransaction();
    if(operacionUuid){const [[existing]]=await connection.execute('SELECT entidad_id FROM operaciones_sincronizacion WHERE operacion_uuid=?',[operacionUuid]);if(existing?.entidad_id){const [[saleExisting]]=await connection.execute('SELECT id,folio,subtotal,descuento,impuestos,total FROM ventas WHERE id=?',[existing.entidad_id]);await connection.rollback();return res.json({...saleExisting,repetida:true});}}
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
    let descuentoTotal = 0;
    for (const [productoId, cantidad] of normalized) {
      const [[product]] = await connection.execute(
        `SELECT id,nombre,categoria_id,unidad_medida,stock_actual,costo,precio_venta,tasa_iva,permite_venta_sin_stock,activo
         FROM productos WHERE id=? FOR UPDATE`,
        [productoId],
      );
      if (!product?.activo) { await connection.rollback(); return res.status(400).json({ error: 'Uno de los productos no está disponible.' }); }
      if (product.unidad_medida === 'Pieza' && !Number.isInteger(cantidad)) { await connection.rollback(); return res.status(400).json({ error: `${product.nombre} solo puede venderse por piezas completas.` }); }
      if (!product.permite_venta_sin_stock && Number(product.stock_actual) < cantidad) { await connection.rollback(); return res.status(409).json({ error: `Existencia insuficiente para ${product.nombre}.` }); }
      const base = Number(product.precio_venta) * cantidad;
      const [[promo]]=await connection.execute(`SELECT tipo,valor,nombre FROM promociones WHERE activa=TRUE AND NOW() BETWEEN fecha_inicio AND fecha_fin AND (producto_id=? OR (producto_id IS NULL AND categoria_id=?)) ORDER BY producto_id IS NOT NULL DESC,id DESC LIMIT 1`,[productoId,product.categoria_id]);
      let descuento=0;if(promo?.tipo==='PORCENTAJE')descuento=base*Math.min(100,Number(promo.valor))/100;else if(promo?.tipo==='PRECIO_ESPECIAL')descuento=Math.max(0,base-Number(promo.valor)*cantidad);else if(promo?.tipo==='DOS_POR_UNO')descuento=Math.floor(cantidad/2)*Number(product.precio_venta);else if(promo?.tipo==='TRES_POR_DOS')descuento=Math.floor(cantidad/3)*Number(product.precio_venta);
      const tax = (base-descuento) * Number(product.tasa_iva) / 100;
      subtotal += base;
      impuestos += tax;
      descuentoTotal+=descuento;
      details.push({ ...product, productoId, cantidad, descuento, promocion:promo?.nombre??null, importe: base-descuento + tax });
    }

    const total = Math.round((subtotal-descuentoTotal + impuestos) * 100) / 100;
    const referencia = String(req.body?.referencia ?? '').trim() || null;
    const pagos = metodo === 'MIXTO'
      ? (Array.isArray(req.body?.pagos) ? req.body.pagos : []).map((p) => ({ metodo: String(p?.metodo ?? '').toUpperCase(), monto: Math.round(Number(p?.monto) * 100) / 100, referencia: String(p?.referencia ?? '').trim() || null })).filter((p) => p.monto > 0)
      : [{ metodo, monto: total, referencia }];
    if (!pagos.length || pagos.some((p) => !['EFECTIVO','TARJETA','TRANSFERENCIA','FIADO','SALDO_FAVOR'].includes(p.metodo) || !Number.isFinite(p.monto))) { await connection.rollback(); return res.status(400).json({ error: 'La distribución del pago mixto no es válida.' }); }
    const sumaPagos = Math.round(pagos.reduce((s, p) => s + p.monto, 0) * 100) / 100;
    if (Math.abs(sumaPagos - total) > .009) { await connection.rollback(); return res.status(400).json({ error: `Los pagos suman $${sumaPagos.toFixed(2)} y deben sumar $${total.toFixed(2)}.` }); }
    const montoFiado = pagos.filter((p) => p.metodo === 'FIADO').reduce((s, p) => s + p.monto, 0);
    const montoSaldoFavor = pagos.filter((p) => p.metodo === 'SALDO_FAVOR').reduce((s,p)=>s+p.monto,0);
    if (montoFiado > 0 && !clienteId) { await connection.rollback(); return res.status(400).json({ error: 'Selecciona el cliente para la parte a fiado.' }); }
    if (montoSaldoFavor > 0 && !clienteId) { await connection.rollback(); return res.status(400).json({ error: 'Selecciona el cliente que utilizará el saldo a favor.' }); }
    if(montoFiado>0){const [[client]]=await connection.execute(`SELECT limite_credito,(SELECT COALESCE(SUM(saldo_pendiente),0) FROM fiados WHERE cliente_id=clientes.id AND estado NOT IN('LIQUIDADO','CANCELADO')) AS adeudo,(SELECT COUNT(*) FROM fiados WHERE cliente_id=clientes.id AND saldo_pendiente>0 AND fecha_limite<CURRENT_DATE AND estado NOT IN('LIQUIDADO','CANCELADO')) AS vencidos FROM clientes WHERE id=? AND activo=TRUE FOR UPDATE`,[clienteId]);if(!client){await connection.rollback();return res.status(400).json({error:'Cliente no válido.'});}if(Number(client.vencidos)>0){await connection.rollback();return res.status(409).json({error:'El cliente tiene fiados vencidos y no puede recibir otro crédito.'});}const disponible=Number(client.limite_credito)-Number(client.adeudo);if(Number(client.limite_credito)>0&&montoFiado>disponible){await connection.rollback();return res.status(409).json({error:`El fiado supera el crédito disponible de $${Math.max(0,disponible).toFixed(2)}.`});}}
    let saldosFavor=[];if(montoSaldoFavor>0){const [rows]=await connection.execute(`SELECT id,(monto-monto_usado) AS disponible FROM saldos_clientes WHERE cliente_id=? AND estado='PENDIENTE' AND monto>monto_usado ORDER BY creado_en,id FOR UPDATE`,[clienteId]);saldosFavor=rows;const disponible=rows.reduce((s,x)=>s+Number(x.disponible),0);if(montoSaldoFavor>disponible+.009){await connection.rollback();return res.status(409).json({error:`El cliente solo tiene $${disponible.toFixed(2)} de saldo a favor.`});}}
    const folio = `V-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const [sale] = await connection.execute(
      `INSERT INTO ventas(sesion_caja_id,usuario_id,cliente_id,folio,subtotal,descuento,impuestos,total,notas) VALUES(?,?,?,?,?,?,?,?,?)`,
      [session.id, req.user.sub, clienteId, folio, subtotal, descuentoTotal, impuestos, total, String(req.body?.notas ?? '').trim() || null],
    );
    if(operacionUuid)await connection.execute(`INSERT INTO operaciones_sincronizacion(operacion_uuid,usuario_id,tipo,entidad_id) VALUES(?,?,'VENTA',?)`,[operacionUuid,req.user.sub,sale.insertId]);
    for (const detail of details) {
      const [saleDetail] = await connection.execute(
        `INSERT INTO venta_detalles(venta_id,producto_id,cantidad,precio_unitario,costo_unitario,descuento,tasa_iva,importe) VALUES(?,?,?,?,?,?,?,?)`,
        [sale.insertId, detail.productoId, detail.cantidad, detail.precio_venta, detail.costo, detail.descuento, detail.tasa_iva, detail.importe],
      );
      const nuevoStock = Number(detail.stock_actual) - detail.cantidad;
      await connection.execute('UPDATE productos SET stock_actual=? WHERE id=?', [nuevoStock, detail.productoId]);
      await connection.execute(
        `INSERT INTO movimientos_inventario(producto_id,usuario_id,tipo,cantidad,stock_anterior,stock_nuevo,referencia_tipo,referencia_id,motivo)
         VALUES(?,?,'SALIDA',?,?,?,?,?,'Venta')`,
        [detail.productoId, req.user.sub, detail.cantidad, detail.stock_actual, nuevoStock, 'VENTA', sale.insertId],
      );
      let porAsignar = detail.cantidad;
      const [lots] = await connection.execute(
        `SELECT id,cantidad_disponible FROM producto_lotes
         WHERE producto_id=? AND cantidad_disponible>0
         ORDER BY fecha_caducidad IS NULL,fecha_caducidad,id FOR UPDATE`,
        [detail.productoId],
      );
      for (const lot of lots) {
        if (porAsignar <= 0) break;
        const tomada = Math.min(porAsignar, Number(lot.cantidad_disponible));
        await connection.execute('UPDATE producto_lotes SET cantidad_disponible=cantidad_disponible-? WHERE id=?', [tomada, lot.id]);
        await connection.execute('INSERT INTO venta_detalle_lotes(venta_detalle_id,lote_id,cantidad) VALUES(?,?,?)', [saleDetail.insertId, lot.id, tomada]);
        porAsignar -= tomada;
      }
    }
    if(montoSaldoFavor>0){let porUsar=montoSaldoFavor;for(const saldo of saldosFavor){if(porUsar<=.009)break;const usado=Math.min(porUsar,Number(saldo.disponible));await connection.execute(`UPDATE saldos_clientes SET monto_usado=monto_usado+?,estado=IF(monto_usado+?>=monto,'ENTREGADO','PENDIENTE'),liquidado_por=IF(monto_usado+?>=monto,?,liquidado_por),liquidado_en=IF(monto_usado+?>=monto,NOW(),liquidado_en) WHERE id=?`,[usado,usado,usado,req.user.sub,usado,saldo.id]);porUsar-=usado;}}
    for (const pago of pagos) {
      const metodoGuardado=pago.metodo==='SALDO_FAVOR'?'OTRO':pago.metodo;const referenciaPago=pago.metodo==='SALDO_FAVOR'?'SALDO A FAVOR':pago.referencia;
      await connection.execute('INSERT INTO venta_pagos(venta_id,metodo,monto,referencia) VALUES(?,?,?,?)', [sale.insertId, metodoGuardado, pago.monto, referenciaPago]);
      await connection.execute(
        `INSERT INTO movimientos_caja(sesion_caja_id,usuario_id,venta_id,tipo,categoria,descripcion,metodo,monto,referencia) VALUES(?,?,?,'INGRESO','VENTA',?,?,?,?)`,
        [session.id, req.user.sub, sale.insertId, `Venta ${folio}`, metodoGuardado, pago.monto, referenciaPago],
      );
    }
    if (montoFiado > 0) {
      await connection.execute(
        `INSERT INTO fiados(cliente_id,venta_id,usuario_id,fecha_limite,deuda_original,saldo_pendiente,estado)
         VALUES(?,?,?,DATE_ADD(CURRENT_DATE,INTERVAL ? DAY),?,?, 'PENDIENTE')`,
        [clienteId, sale.insertId, req.user.sub, plazoDias, montoFiado, montoFiado],
      );
    }
    await connection.execute(
      `INSERT INTO bitacora(usuario_id,modulo,accion,descripcion) VALUES(?,?,?,?)`,
      [req.user.sub, 'Ventas', 'CREAR', `Venta ${folio} por $${total.toFixed(2)}`],
    );
    await connection.commit();
    return res.status(201).json({ id: sale.insertId, folio, subtotal, descuento:descuentoTotal, impuestos, total });
  } catch (error) { await connection.rollback(); return next(error); }
  finally { connection.release(); }
});

businessRouter.get('/sales',async(req,res,next)=>{try{const termino=String(req.query?.q??'').trim();const like=`%${termino}%`;const [rows]=await pool.execute(`SELECT v.id,v.folio,v.fecha_venta AS fecha,v.estado,v.total,u.nombre AS usuario,COALESCE(c.nombre,'Público general') AS cliente,COALESCE((SELECT GROUP_CONCAT(vp.metodo ORDER BY vp.id SEPARATOR ' + ') FROM venta_pagos vp WHERE vp.venta_id=v.id),'OTRO') AS metodo FROM ventas v JOIN usuarios u ON u.id=v.usuario_id LEFT JOIN clientes c ON c.id=v.cliente_id WHERE (?='' OR v.folio LIKE ? OR u.nombre LIKE ? OR c.nombre LIKE ?) ORDER BY v.fecha_venta DESC LIMIT 100`,[termino,like,like,like]);return res.json(rows);}catch(error){return next(error);}});

businessRouter.get('/sales/:id', async (req, res, next) => {
  try {
    const [[sale]] = await pool.execute(
      `SELECT v.id,v.folio,v.fecha_venta AS fecha,v.estado,v.subtotal,v.descuento,v.impuestos,v.total,u.nombre AS usuario,
              c.nombre AS cliente,GROUP_CONCAT(DISTINCT vp.metodo) AS metodo
       FROM ventas v JOIN usuarios u ON u.id=v.usuario_id LEFT JOIN clientes c ON c.id=v.cliente_id
       LEFT JOIN venta_pagos vp ON vp.venta_id=v.id WHERE v.id=? GROUP BY v.id`,
      [req.params.id],
    );
    if (!sale) return res.status(404).json({ error: 'Venta no encontrada.' });
    const [items] = await pool.execute(
      `SELECT vd.id AS detalleId,vd.producto_id AS productoId,p.nombre,vd.cantidad,vd.precio_unitario AS precioUnitario,vd.importe,COALESCE((SELECT SUM(dd.cantidad) FROM devolucion_venta_detalles dd WHERE dd.venta_detalle_id=vd.id),0) AS devuelto
       FROM venta_detalles vd JOIN productos p ON p.id=vd.producto_id WHERE vd.venta_id=? ORDER BY vd.id`,
      [req.params.id],
    );
    const [pagos]=await pool.execute(`SELECT CASE WHEN metodo='OTRO' AND referencia='SALDO A FAVOR' THEN 'SALDO A FAVOR' ELSE metodo END AS metodo,monto,referencia FROM venta_pagos WHERE venta_id=? ORDER BY id`,[req.params.id]);
    const [[fiado]]=await pool.execute(`SELECT deuda_original AS monto,saldo_pendiente AS saldoPendiente,DATE_FORMAT(fecha_limite,'%Y-%m-%d') AS fechaLimite FROM fiados WHERE venta_id=? AND estado<>'CANCELADO' LIMIT 1`,[req.params.id]);
    return res.json({ ...sale, items, pagos, fiado:fiado??null });
  } catch (error) { return next(error); }
});

businessRouter.post('/sales/:id/returns',requireRole('Administrador','Gerente'),async(req,res,next)=>{const c=await pool.getConnection();try{const motivo=String(req.body?.motivo??'').trim();const items=Array.isArray(req.body?.items)?req.body.items:[];if(motivo.length<5||!items.length)return res.status(400).json({error:'Indica motivo y productos a devolver.'});await c.beginTransaction();const [[sale]]=await c.execute("SELECT * FROM ventas WHERE id=? AND estado='COMPLETADA' FOR UPDATE",[req.params.id]);if(!sale){await c.rollback();return res.status(404).json({error:'Venta no encontrada o ya devuelta por completo.'});}const [[session]]=await c.execute("SELECT id FROM sesiones_caja WHERE usuario_apertura_id=? AND estado='ABIERTA' LIMIT 1",[req.user.sub]);if(!session){await c.rollback();return res.status(409).json({error:'Abre una caja para registrar el reembolso.'});}const details=[];let refund=0;for(const requested of items){const qty=Number(requested.cantidad);const [[d]]=await c.execute('SELECT * FROM venta_detalles WHERE id=? AND venta_id=? FOR UPDATE',[requested.detalleId,sale.id]);if(!d||qty<=0){await c.rollback();return res.status(400).json({error:'Partida de devolución inválida.'});}const [[prev]]=await c.execute('SELECT COALESCE(SUM(cantidad),0) cantidad FROM devolucion_venta_detalles WHERE venta_detalle_id=?',[d.id]);const prevQty=Number(prev.cantidad);if(prevQty+qty>Number(d.cantidad)){await c.rollback();return res.status(409).json({error:'La cantidad supera las unidades disponibles para devolución.'});}const amount=Math.round(Number(d.importe)/Number(d.cantidad)*qty*100)/100;refund+=amount;details.push({d,qty,amount,prevQty});}refund=Math.round(refund*100)/100;const [ret]=await c.execute('INSERT INTO devoluciones_venta(venta_id,usuario_id,motivo,total_reembolso) VALUES(?,?,?,?)',[sale.id,req.user.sub,motivo,refund]);for(const x of details){await c.execute('INSERT INTO devolucion_venta_detalles(devolucion_id,venta_detalle_id,cantidad,importe) VALUES(?,?,?,?)',[ret.insertId,x.d.id,x.qty,x.amount]);let offset=x.prevQty;let porRestaurar=x.qty;const [mappedLots]=await c.execute('SELECT lote_id,cantidad FROM venta_detalle_lotes WHERE venta_detalle_id=? ORDER BY id',[x.d.id]);for(const mapped of mappedLots){if(porRestaurar<=0)break;const mappedQty=Number(mapped.cantidad);if(offset>=mappedQty){offset-=mappedQty;continue;}const restaurada=Math.min(porRestaurar,mappedQty-offset);await c.execute('UPDATE producto_lotes SET cantidad_disponible=LEAST(cantidad_inicial,cantidad_disponible+?) WHERE id=?',[restaurada,mapped.lote_id]);porRestaurar-=restaurada;offset=0;}const [[p]]=await c.execute('SELECT stock_actual FROM productos WHERE id=? FOR UPDATE',[x.d.producto_id]);const nuevo=Number(p.stock_actual)+x.qty;await c.execute('UPDATE productos SET stock_actual=? WHERE id=?',[nuevo,x.d.producto_id]);await c.execute(`INSERT INTO movimientos_inventario(producto_id,usuario_id,tipo,cantidad,stock_anterior,stock_nuevo,referencia_tipo,referencia_id,motivo) VALUES(?,?,'DEVOLUCION',?,?,?,?,? ,?)`,[x.d.producto_id,req.user.sub,x.qty,p.stock_actual,nuevo,'DEVOLUCION',ret.insertId,motivo]);}const [payments]=await c.execute('SELECT * FROM venta_pagos WHERE venta_id=?',[sale.id]);let allocated=0;for(let i=0;i<payments.length;i++){const p=payments[i];const amount=i===payments.length-1?refund-allocated:Math.round(refund*Number(p.monto)/Number(sale.total)*100)/100;allocated+=amount;if(amount<=0)continue;if(p.metodo==='FIADO')await c.execute("UPDATE fiados SET estado=IF(GREATEST(0,saldo_pendiente-?)=0,'LIQUIDADO','PENDIENTE'),saldo_pendiente=GREATEST(0,saldo_pendiente-?) WHERE venta_id=?",[amount,amount,sale.id]);else await c.execute(`INSERT INTO movimientos_caja(sesion_caja_id,usuario_id,venta_id,tipo,categoria,descripcion,metodo,monto,referencia) VALUES(?,?,?,'SALIDA','DEVOLUCION',?,?,?,?)`,[session.id,req.user.sub,sale.id,`Devolución ${sale.folio}`,p.metodo,amount,p.referencia]);}const [[remaining]]=await c.execute(`SELECT SUM(vd.cantidad-COALESCE((SELECT SUM(dd.cantidad) FROM devolucion_venta_detalles dd WHERE dd.venta_detalle_id=vd.id),0)) restante FROM venta_detalles vd WHERE vd.venta_id=?`,[sale.id]);if(Number(remaining.restante)===0)await c.execute("UPDATE ventas SET estado='DEVUELTA' WHERE id=?",[sale.id]);await c.execute(`INSERT INTO bitacora(usuario_id,modulo,accion,descripcion,entidad,entidad_id) VALUES(?,'Ventas','DEVOLUCION',?,'VENTA',?)`,[req.user.sub,`${sale.folio}: $${refund.toFixed(2)} - ${motivo}`,sale.id]);await c.commit();res.status(201).json({devolucionId:ret.insertId,reembolso:refund});}catch(e){await c.rollback();next(e);}finally{c.release();}});

businessRouter.post('/sales/:id/cancel', requireRole('Administrador','Gerente'), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const motivo = String(req.body?.motivo ?? '').trim();
    if (motivo.length < 5) return res.status(400).json({ error: 'Indica el motivo de la cancelación.' });
    await connection.beginTransaction();
    const [[sale]] = await connection.execute('SELECT * FROM ventas WHERE id=? FOR UPDATE', [req.params.id]);
    if (!sale) { await connection.rollback(); return res.status(404).json({ error: 'Venta no encontrada.' }); }
    if (sale.estado !== 'COMPLETADA') { await connection.rollback(); return res.status(409).json({ error: 'La venta ya fue cancelada o devuelta.' }); }
    const [[currentSession]]=await connection.execute("SELECT id FROM sesiones_caja WHERE usuario_apertura_id=? AND estado='ABIERTA' ORDER BY fecha_apertura DESC LIMIT 1 FOR UPDATE",[req.user.sub]);
    if(!currentSession){await connection.rollback();return res.status(409).json({error:'Debes abrir una caja para registrar el reembolso de la cancelación.'});}
    const [[returns]] = await connection.execute('SELECT COUNT(*) total FROM devoluciones_venta WHERE venta_id=?', [sale.id]);
    if (Number(returns.total) > 0) { await connection.rollback(); return res.status(409).json({ error: 'Esta venta ya tiene devoluciones parciales. Devuelve las unidades restantes en lugar de cancelarla.' }); }
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
      await connection.execute(
        `UPDATE producto_lotes l JOIN venta_detalle_lotes vdl ON vdl.lote_id=l.id
         SET l.cantidad_disponible=LEAST(l.cantidad_inicial,l.cantidad_disponible+vdl.cantidad)
         WHERE vdl.venta_detalle_id=?`,
        [item.id],
      );
    }
    const [payments] = await connection.execute('SELECT metodo,monto,referencia FROM venta_pagos WHERE venta_id=? ORDER BY id', [sale.id]);
    await connection.execute("UPDATE ventas SET estado='CANCELADA',notas=CONCAT(COALESCE(notas,''),' | Cancelación: ',?) WHERE id=?", [motivo, sale.id]);
    for (const payment of payments.filter((p) => p.metodo !== 'FIADO')) {
      await connection.execute(
        `INSERT INTO movimientos_caja(sesion_caja_id,usuario_id,venta_id,tipo,categoria,descripcion,metodo,monto,referencia)
         VALUES(?,?,?,'SALIDA','CANCELACION',?,?,?,?)`,
        [currentSession.id, req.user.sub, sale.id, `Cancelación ${sale.folio}`, payment.metodo, payment.monto, payment.referencia ?? null],
      );
    }
    if (payments.some((p) => p.metodo === 'FIADO')) {
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
businessRouter.get('/purchase-suggestions',requireRole('Administrador','Gerente'),async(_req,res,next)=>{try{const [rows]=await pool.query(`SELECT p.id AS productoId,p.nombre,p.stock_actual AS stock,p.stock_minimo AS minimo,GREATEST(CEIL(p.stock_minimo*2-p.stock_actual),1) AS cantidadSugerida,p.costo,pr.id AS proveedorId,pr.empresa AS proveedor FROM productos p LEFT JOIN proveedor_productos pp ON pp.producto_id=p.id AND pp.es_principal=TRUE LEFT JOIN proveedores pr ON pr.id=pp.proveedor_id AND pr.estado='ACTIVO' WHERE p.activo=TRUE AND p.stock_actual<=p.stock_minimo ORDER BY pr.empresa,p.nombre`);res.json(rows);}catch(e){next(e);}});

businessRouter.post('/purchases', requireRole('Administrador','Gerente'), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const proveedorId = Number(req.body?.proveedorId);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const metodoPago = String(req.body?.metodoPago ?? 'CREDITO').toUpperCase();
    if (!Number.isInteger(proveedorId) || !items.length || !['EFECTIVO','TARJETA','TRANSFERENCIA','CREDITO','MIXTO','OTRO'].includes(metodoPago)) return res.status(400).json({ error: 'La compra no es válida.' });
    await connection.beginTransaction();
    const [[provider]] = await connection.execute("SELECT id FROM proveedores WHERE id=? AND estado<>'ARCHIVADO'", [proveedorId]);
    if (!provider) { await connection.rollback(); return res.status(400).json({ error: 'Proveedor no válido.' }); }
    const productIds=items.map(item=>Number(item?.productoId));
    if(new Set(productIds).size!==productIds.length){await connection.rollback();return res.status(400).json({error:'La compra contiene un producto repetido. Suma la cantidad en una sola partida.'});}
    const details = [];
    let subtotal = 0;
    let taxes = 0;
    for (const item of items) {
      const productoId = Number(item?.productoId); const cantidad = Number(item?.cantidad); const costo = Number(item?.costoUnitario);
      if (!Number.isInteger(productoId) || !Number.isFinite(cantidad) || cantidad <= 0 || !Number.isFinite(costo) || costo < 0) { await connection.rollback(); return res.status(400).json({ error: 'Hay partidas de compra no válidas.' }); }
      const [[product]] = await connection.execute('SELECT id,stock_actual,tasa_iva FROM productos WHERE id=? AND activo=TRUE FOR UPDATE', [productoId]);
      if (!product) { await connection.rollback(); return res.status(400).json({ error: 'Uno de los productos no existe.' }); }
      const base = cantidad * costo; const tax = base * Number(product.tasa_iva) / 100;
      subtotal += base; taxes += tax; details.push({ product, productoId, cantidad, costo, importe: base + tax, lote:String(item?.lote??'').trim(), fechaCaducidad:String(item?.fechaCaducidad??'').trim()||null });
    }
    const total = Math.round((subtotal + taxes) * 100) / 100;
    const pagosCompra=metodoPago==='MIXTO'?(Array.isArray(req.body?.pagos)?req.body.pagos:[]).map(p=>({metodo:String(p?.metodo??'').toUpperCase(),monto:Math.round(Number(p?.monto)*100)/100})).filter(p=>p.monto>0):(['EFECTIVO','TARJETA','TRANSFERENCIA'].includes(metodoPago)?[{metodo:metodoPago,monto:total}]:[]);
    if(pagosCompra.some(p=>!['EFECTIVO','TARJETA','TRANSFERENCIA'].includes(p.metodo)||!Number.isFinite(p.monto))||metodoPago==='MIXTO'&&Math.abs(pagosCompra.reduce((s,p)=>s+p.monto,0)-total)>.009){await connection.rollback();return res.status(400).json({error:`El pago mixto debe sumar exactamente $${total.toFixed(2)}.`});}
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
      await connection.execute('UPDATE proveedor_productos SET es_principal=FALSE WHERE producto_id=?',[detail.productoId]);
      await connection.execute(`INSERT INTO proveedor_productos(proveedor_id,producto_id,costo_ultimo,es_principal) VALUES(?,?,?,TRUE) ON DUPLICATE KEY UPDATE costo_ultimo=VALUES(costo_ultimo),es_principal=TRUE`,[proveedorId,detail.productoId,detail.costo]);
      await connection.execute(
        `INSERT INTO movimientos_inventario(producto_id,usuario_id,tipo,cantidad,stock_anterior,stock_nuevo,costo_unitario,referencia_tipo,referencia_id,motivo)
         VALUES(?,?,'ENTRADA',?,?,?,?,? ,?,'Compra recibida')`,
        [detail.productoId, req.user.sub, detail.cantidad, detail.product.stock_actual, nuevoStock, detail.costo, 'COMPRA', purchase.insertId],
      );
      if (detail.lote) await connection.execute(`INSERT INTO producto_lotes(producto_id,compra_id,lote,fecha_caducidad,cantidad_inicial,cantidad_disponible,costo_unitario) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE cantidad_inicial=cantidad_inicial+VALUES(cantidad_inicial),cantidad_disponible=cantidad_disponible+VALUES(cantidad_disponible),fecha_caducidad=COALESCE(VALUES(fecha_caducidad),fecha_caducidad),costo_unitario=VALUES(costo_unitario)`,[detail.productoId,purchase.insertId,detail.lote,detail.fechaCaducidad,detail.cantidad,detail.cantidad,detail.costo]);
    }
    const efectivoDesdeCaja=Boolean(req.body?.efectivoDesdeCaja);
    if(pagosCompra.length){
      const [[cashSession]]=await connection.execute("SELECT id FROM sesiones_caja WHERE usuario_apertura_id=? AND estado='ABIERTA' LIMIT 1",[req.user.sub]);
      const pagosARegistrar=pagosCompra.filter(p=>p.metodo!=='EFECTIVO'||efectivoDesdeCaja);
      if(pagosARegistrar.length&&!cashSession){await connection.rollback();return res.status(409).json({error:'Abre la caja para registrar el pago al proveedor, o indica que el efectivo no salió de caja.'});}
      for(const pago of pagosARegistrar)await connection.execute(`INSERT INTO movimientos_caja(sesion_caja_id,usuario_id,tipo,categoria,descripcion,metodo,monto,referencia) VALUES(?,?,'SALIDA','COMPRA',?,?,?,?)`,[cashSession.id,req.user.sub,`Pago a proveedor ${provider.id} · compra ${folio}`,pago.metodo,pago.monto,folio]);
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

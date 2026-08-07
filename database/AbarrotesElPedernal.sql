CREATE DATABASE IF NOT EXISTS `AbarrotesElPedernal`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE `AbarrotesElPedernal`;

CREATE TABLE IF NOT EXISTS roles (
  id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(30) NOT NULL UNIQUE,
  descripcion VARCHAR(150) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS usuarios (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rol_id TINYINT UNSIGNED NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  correo VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL COMMENT 'Hash bcrypt o Argon2; nunca contraseña en texto plano',
  sesion_version INT UNSIGNED NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  eliminado_en DATETIME NULL,
  ultimo_acceso DATETIME NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_usuarios_correo UNIQUE (correo),
  CONSTRAINT fk_usuarios_rol FOREIGN KEY (rol_id) REFERENCES roles(id),
  INDEX idx_usuarios_rol_activo (rol_id, activo),
  INDEX idx_usuarios_eliminado (eliminado_en)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS categorias (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  descripcion VARCHAR(255) NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS productos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  categoria_id BIGINT UNSIGNED NULL,
  codigo_barras VARCHAR(60) NULL,
  sku VARCHAR(60) NULL,
  nombre VARCHAR(180) NOT NULL,
  descripcion VARCHAR(500) NULL,
  unidad_medida VARCHAR(30) NOT NULL DEFAULT 'Pieza',
  costo DECIMAL(12,2) NULL DEFAULT NULL,
  precio_venta DECIMAL(12,2) NOT NULL,
  tasa_iva DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  stock_actual DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  stock_minimo DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  permite_venta_sin_stock BOOLEAN NOT NULL DEFAULT FALSE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_productos_codigo UNIQUE (codigo_barras),
  CONSTRAINT uq_productos_sku UNIQUE (sku),
  CONSTRAINT chk_productos_importes CHECK (costo >= 0 AND precio_venta >= 0),
  CONSTRAINT chk_productos_stock CHECK (stock_actual >= 0 AND stock_minimo >= 0),
  CONSTRAINT chk_productos_iva CHECK (tasa_iva >= 0 AND tasa_iva <= 100),
  CONSTRAINT fk_productos_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL,
  INDEX idx_productos_nombre (nombre),
  INDEX idx_productos_categoria_activo (categoria_id, activo),
  INDEX idx_productos_stock (stock_actual, stock_minimo)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  producto_id BIGINT UNSIGNED NOT NULL,
  usuario_id BIGINT UNSIGNED NOT NULL,
  tipo ENUM('ENTRADA','SALIDA','AJUSTE','MERMA','DEVOLUCION') NOT NULL,
  cantidad DECIMAL(12,3) NOT NULL,
  stock_anterior DECIMAL(12,3) NOT NULL,
  stock_nuevo DECIMAL(12,3) NOT NULL,
  costo_unitario DECIMAL(12,2) NULL,
  referencia_tipo VARCHAR(40) NULL,
  referencia_id BIGINT UNSIGNED NULL,
  motivo VARCHAR(255) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_mov_inv_cantidad CHECK (cantidad > 0),
  CONSTRAINT fk_mov_inv_producto FOREIGN KEY (producto_id) REFERENCES productos(id),
  CONSTRAINT fk_mov_inv_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  INDEX idx_mov_inv_producto_fecha (producto_id, creado_en),
  INDEX idx_mov_inv_referencia (referencia_tipo, referencia_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS proveedores (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa VARCHAR(180) NOT NULL,
  contacto VARCHAR(120) NOT NULL,
  telefono VARCHAR(20) NOT NULL,
  correo VARCHAR(190) NULL,
  rfc VARCHAR(13) NULL,
  direccion VARCHAR(400) NULL,
  producto_principal VARCHAR(180) NULL,
  dia_entrega VARCHAR(100) NULL,
  ultima_compra DATE NULL,
  proxima_entrega DATE NULL,
  estado_pedido ENUM('SIN_PEDIDO','PENDIENTE','RECIBIDO','ATRASADO') NOT NULL DEFAULT 'SIN_PEDIDO',
  saldo_pendiente DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  estado ENUM('ACTIVO','INACTIVO','ARCHIVADO') NOT NULL DEFAULT 'ACTIVO',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_proveedores_empresa UNIQUE (empresa),
  CONSTRAINT uq_proveedores_correo UNIQUE (correo),
  CONSTRAINT chk_proveedores_saldo CHECK (saldo_pendiente >= 0),
  INDEX idx_proveedores_estado (estado)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS proveedor_productos (
  proveedor_id BIGINT UNSIGNED NOT NULL,
  producto_id BIGINT UNSIGNED NOT NULL,
  codigo_proveedor VARCHAR(80) NULL,
  costo_ultimo DECIMAL(12,2) NULL,
  es_principal BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (proveedor_id, producto_id),
  CONSTRAINT fk_prov_prod_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE CASCADE,
  CONSTRAINT fk_prov_prod_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS compras (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  proveedor_id BIGINT UNSIGNED NOT NULL,
  usuario_id BIGINT UNSIGNED NOT NULL,
  folio VARCHAR(80) NULL,
  fecha_compra DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_entrega DATE NULL,
  estado ENUM('BORRADOR','PEDIDA','RECIBIDA','PARCIAL','CANCELADA','ATRASADA') NOT NULL DEFAULT 'BORRADOR',
  metodo_pago ENUM('EFECTIVO','TARJETA','TERMINAL','TRANSFERENCIA','CREDITO','MIXTO','OTRO') NOT NULL DEFAULT 'CREDITO',
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  impuestos DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  saldo_pendiente DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  notas VARCHAR(500) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_compras_importes CHECK (subtotal >= 0 AND impuestos >= 0 AND total >= 0 AND saldo_pendiente >= 0),
  CONSTRAINT fk_compras_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores(id),
  CONSTRAINT fk_compras_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  INDEX idx_compras_proveedor_fecha (proveedor_id, fecha_compra),
  INDEX idx_compras_estado_entrega (estado, fecha_entrega)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS compra_detalles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  compra_id BIGINT UNSIGNED NOT NULL,
  producto_id BIGINT UNSIGNED NOT NULL,
  cantidad DECIMAL(12,3) NOT NULL,
  costo_unitario DECIMAL(12,2) NOT NULL,
  tasa_iva DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  importe DECIMAL(14,2) NOT NULL,
  CONSTRAINT chk_compra_detalle CHECK (cantidad > 0 AND costo_unitario >= 0 AND importe >= 0),
  CONSTRAINT fk_compra_det_compra FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE CASCADE,
  CONSTRAINT fk_compra_det_producto FOREIGN KEY (producto_id) REFERENCES productos(id),
  UNIQUE KEY uq_compra_producto (compra_id, producto_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS compra_pagos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  compra_id BIGINT UNSIGNED NOT NULL,
  origen ENUM('CAJA','EXTERNO') NOT NULL,
  metodo ENUM('EFECTIVO','TARJETA','TERMINAL','TRANSFERENCIA') NOT NULL,
  monto DECIMAL(14,2) NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_compra_pago_monto CHECK (monto > 0),
  CONSTRAINT fk_compra_pago_compra FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE CASCADE,
  INDEX idx_compra_pago_compra (compra_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS clientes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  telefono VARCHAR(20) NOT NULL,
  correo VARCHAR(190) NULL,
  direccion VARCHAR(400) NULL,
  rfc VARCHAR(13) NULL,
  codigo_postal_fiscal VARCHAR(5) NULL,
  regimen_fiscal VARCHAR(10) NULL,
  uso_cfdi VARCHAR(10) NULL,
  limite_credito DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_clientes_limite CHECK (limite_credito >= 0),
  INDEX idx_clientes_nombre (nombre),
  INDEX idx_clientes_telefono (telefono)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sesiones_caja (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_apertura_id BIGINT UNSIGNED NOT NULL,
  usuario_cierre_id BIGINT UNSIGNED NULL,
  fecha_apertura DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_cierre DATETIME NULL,
  fondo_inicial DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  efectivo_esperado DECIMAL(14,2) NULL,
  efectivo_contado DECIMAL(14,2) NULL,
  diferencia DECIMAL(14,2) NULL,
  estado ENUM('ABIERTA','CERRADA') NOT NULL DEFAULT 'ABIERTA',
  observaciones VARCHAR(500) NULL,
  CONSTRAINT chk_caja_fondo CHECK (fondo_inicial >= 0),
  CONSTRAINT fk_caja_usuario_apertura FOREIGN KEY (usuario_apertura_id) REFERENCES usuarios(id),
  CONSTRAINT fk_caja_usuario_cierre FOREIGN KEY (usuario_cierre_id) REFERENCES usuarios(id),
  INDEX idx_caja_estado_fecha (estado, fecha_apertura)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ventas (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sesion_caja_id BIGINT UNSIGNED NOT NULL,
  usuario_id BIGINT UNSIGNED NOT NULL,
  cliente_id BIGINT UNSIGNED NULL,
  folio VARCHAR(40) NOT NULL,
  fecha_venta DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado ENUM('COMPLETADA','CANCELADA','DEVUELTA') NOT NULL DEFAULT 'COMPLETADA',
  subtotal DECIMAL(14,2) NOT NULL,
  descuento DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  impuestos DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total DECIMAL(14,2) NOT NULL,
  notas VARCHAR(500) NULL,
  CONSTRAINT uq_ventas_folio UNIQUE (folio),
  CONSTRAINT chk_ventas_importes CHECK (subtotal >= 0 AND descuento >= 0 AND impuestos >= 0 AND total >= 0),
  CONSTRAINT fk_ventas_caja FOREIGN KEY (sesion_caja_id) REFERENCES sesiones_caja(id),
  CONSTRAINT fk_ventas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  CONSTRAINT fk_ventas_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
  INDEX idx_ventas_fecha_estado (fecha_venta, estado),
  INDEX idx_ventas_cliente (cliente_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS venta_detalles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  venta_id BIGINT UNSIGNED NOT NULL,
  producto_id BIGINT UNSIGNED NOT NULL,
  cantidad DECIMAL(12,3) NOT NULL,
  precio_unitario DECIMAL(12,2) NOT NULL,
  costo_unitario DECIMAL(12,2) NOT NULL,
  descuento DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  tasa_iva DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  importe DECIMAL(14,2) NOT NULL,
  CONSTRAINT chk_venta_detalle CHECK (cantidad > 0 AND precio_unitario >= 0 AND costo_unitario >= 0 AND importe >= 0),
  CONSTRAINT fk_venta_det_venta FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
  CONSTRAINT fk_venta_det_producto FOREIGN KEY (producto_id) REFERENCES productos(id),
  INDEX idx_venta_det_producto (producto_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS venta_pagos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  venta_id BIGINT UNSIGNED NOT NULL,
  metodo ENUM('EFECTIVO','TARJETA','TERMINAL','TRANSFERENCIA','FIADO','OTRO') NOT NULL,
  monto DECIMAL(14,2) NOT NULL,
  referencia VARCHAR(120) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_venta_pago CHECK (monto > 0),
  CONSTRAINT fk_venta_pago_venta FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
  INDEX idx_pagos_metodo_fecha (metodo, creado_en)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS movimientos_caja (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sesion_caja_id BIGINT UNSIGNED NOT NULL,
  usuario_id BIGINT UNSIGNED NOT NULL,
  venta_id BIGINT UNSIGNED NULL,
  compra_id BIGINT UNSIGNED NULL,
  tipo ENUM('INGRESO','SALIDA') NOT NULL,
  categoria VARCHAR(80) NOT NULL,
  descripcion VARCHAR(255) NOT NULL,
  metodo ENUM('EFECTIVO','TARJETA','TRANSFERENCIA','FIADO','OTRO') NOT NULL,
  monto DECIMAL(14,2) NOT NULL,
  referencia VARCHAR(120) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_mov_caja_monto CHECK (monto > 0),
  CONSTRAINT fk_mov_caja_sesion FOREIGN KEY (sesion_caja_id) REFERENCES sesiones_caja(id),
  CONSTRAINT fk_mov_caja_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  CONSTRAINT fk_mov_caja_venta FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE SET NULL,
  CONSTRAINT fk_mov_caja_compra FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE SET NULL,
  INDEX idx_mov_caja_sesion_fecha (sesion_caja_id, creado_en)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS recargas (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sesion_caja_id BIGINT UNSIGNED NOT NULL,
  usuario_id BIGINT UNSIGNED NOT NULL,
  compania VARCHAR(30) NOT NULL,
  telefono VARCHAR(10) NOT NULL,
  monto DECIMAL(12,2) NOT NULL,
  comision DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  estado ENUM('PENDIENTE','EXITOSA','RECHAZADA','CANCELADA') NOT NULL DEFAULT 'PENDIENTE',
  folio_proveedor VARCHAR(120) NULL,
  motivo VARCHAR(255) NULL,
  resuelta_por BIGINT UNSIGNED NULL,
  creada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resuelta_en DATETIME NULL,
  CONSTRAINT chk_recarga_importes CHECK (monto > 0 AND comision >= 0 AND comision <= monto),
  CONSTRAINT fk_recarga_sesion FOREIGN KEY (sesion_caja_id) REFERENCES sesiones_caja(id),
  CONSTRAINT fk_recarga_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  CONSTRAINT fk_recarga_resuelta FOREIGN KEY (resuelta_por) REFERENCES usuarios(id),
  INDEX idx_recargas_estado_fecha (estado, creada_en),
  INDEX idx_recargas_telefono (telefono)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS fiados (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id BIGINT UNSIGNED NOT NULL,
  venta_id BIGINT UNSIGNED NULL,
  usuario_id BIGINT UNSIGNED NOT NULL,
  fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_limite DATE NOT NULL,
  deuda_original DECIMAL(14,2) NOT NULL,
  saldo_pendiente DECIMAL(14,2) NOT NULL,
  estado ENUM('PENDIENTE','VENCIDO','LIQUIDADO','CANCELADO') NOT NULL DEFAULT 'PENDIENTE',
  notas VARCHAR(500) NULL,
  CONSTRAINT chk_fiados_importes CHECK (deuda_original > 0 AND saldo_pendiente >= 0 AND saldo_pendiente <= deuda_original),
  CONSTRAINT fk_fiados_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  CONSTRAINT fk_fiados_venta FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE SET NULL,
  CONSTRAINT fk_fiados_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  INDEX idx_fiados_cliente_estado (cliente_id, estado),
  INDEX idx_fiados_vencimiento (estado, fecha_limite)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS fiado_abonos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  fiado_id BIGINT UNSIGNED NOT NULL,
  usuario_id BIGINT UNSIGNED NOT NULL,
  monto DECIMAL(14,2) NOT NULL,
  metodo ENUM('EFECTIVO','TARJETA','TRANSFERENCIA','OTRO') NOT NULL,
  referencia VARCHAR(120) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_abono_monto CHECK (monto > 0),
  CONSTRAINT fk_abono_fiado FOREIGN KEY (fiado_id) REFERENCES fiados(id),
  CONSTRAINT fk_abono_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  INDEX idx_abonos_fiado_fecha (fiado_id, creado_en)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS saldos_clientes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id BIGINT UNSIGNED NOT NULL,
  usuario_id BIGINT UNSIGNED NOT NULL,
  monto DECIMAL(12,2) NOT NULL,
  monto_usado DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  estado ENUM('PENDIENTE','ENTREGADO','CANCELADO') NOT NULL DEFAULT 'PENDIENTE',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  liquidado_por BIGINT UNSIGNED NULL,
  liquidado_en DATETIME NULL,
  CONSTRAINT chk_saldo_cliente_monto CHECK (monto > 0),
  CONSTRAINT fk_saldo_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  CONSTRAINT fk_saldo_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  CONSTRAINT fk_saldo_liquidado FOREIGN KEY (liquidado_por) REFERENCES usuarios(id),
  INDEX idx_saldos_cliente_estado (cliente_id, estado)
) ENGINE=InnoDB;


CREATE TABLE IF NOT EXISTS configuracion_fiscal (
  id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  rfc VARCHAR(13) NOT NULL,
  nombre_razon_social VARCHAR(200) NOT NULL,
  tipo_persona ENUM('FISICA','MORAL') NOT NULL,
  codigo_postal VARCHAR(5) NOT NULL,
  regimen_fiscal VARCHAR(10) NOT NULL,
  tasa_isr_preliminar DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  actualizado_por BIGINT UNSIGNED NULL,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_config_fiscal_id CHECK (id = 1),
  CONSTRAINT chk_config_fiscal_isr CHECK (tasa_isr_preliminar >= 0 AND tasa_isr_preliminar <= 100),
  CONSTRAINT fk_config_fiscal_usuario FOREIGN KEY (actualizado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS documentos_cfdi (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid CHAR(36) NOT NULL,
  serie VARCHAR(30) NULL,
  folio VARCHAR(50) NULL,
  tipo_comprobante CHAR(1) NOT NULL,
  fecha_emision DATETIME NOT NULL,
  fecha_timbrado DATETIME NULL,
  rfc_emisor VARCHAR(13) NOT NULL,
  nombre_emisor VARCHAR(200) NULL,
  rfc_receptor VARCHAR(13) NOT NULL,
  nombre_receptor VARCHAR(200) NULL,
  regimen_receptor VARCHAR(10) NULL,
  uso_cfdi VARCHAR(10) NULL,
  metodo_pago VARCHAR(10) NULL,
  forma_pago VARCHAR(10) NULL,
  moneda VARCHAR(5) NOT NULL DEFAULT 'MXN',
  subtotal DECIMAL(14,2) NOT NULL,
  descuento DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  iva_trasladado DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  impuestos_retenidos DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total DECIMAL(14,2) NOT NULL,
  estado_local ENUM('PENDIENTE','VIGENTE','CANCELADO') NOT NULL DEFAULT 'PENDIENTE',
  xml LONGTEXT NOT NULL,
  hash_xml CHAR(64) NULL,
  importado_por BIGINT UNSIGNED NOT NULL,
  importado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_cfdi_uuid UNIQUE (uuid),
  CONSTRAINT chk_cfdi_importes CHECK (subtotal >= 0 AND descuento >= 0 AND iva_trasladado >= 0 AND impuestos_retenidos >= 0 AND total >= 0),
  CONSTRAINT fk_cfdi_usuario FOREIGN KEY (importado_por) REFERENCES usuarios(id),
  INDEX idx_cfdi_fecha_tipo (fecha_emision, tipo_comprobante),
  INDEX idx_cfdi_emisor (rfc_emisor),
  INDEX idx_cfdi_receptor (rfc_receptor)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS facturas_borrador (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tipo ENUM('INDIVIDUAL','GLOBAL') NOT NULL,
  cliente_id BIGINT UNSIGNED NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  periodicidad VARCHAR(5) NULL,
  meses VARCHAR(5) NULL,
  anio SMALLINT UNSIGNED NULL,
  rfc_receptor VARCHAR(13) NOT NULL,
  nombre_receptor VARCHAR(200) NOT NULL,
  regimen_receptor VARCHAR(10) NOT NULL,
  codigo_postal_receptor VARCHAR(5) NOT NULL,
  uso_cfdi VARCHAR(10) NOT NULL,
  subtotal DECIMAL(14,2) NOT NULL,
  descuento DECIMAL(14,2) NOT NULL DEFAULT 0,
  impuestos DECIMAL(14,2) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL,
  estado ENUM('BORRADOR','PENDIENTE_TIMBRADO','TIMBRADA','CANCELADA','ERROR') NOT NULL DEFAULT 'BORRADOR',
  proveedor_pac VARCHAR(80) NULL,
  uuid CHAR(36) NULL,
  mensaje_error VARCHAR(500) NULL,
  creado_por BIGINT UNSIGNED NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_factura_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
  CONSTRAINT fk_factura_usuario FOREIGN KEY (creado_por) REFERENCES usuarios(id),
  INDEX idx_facturas_periodo (tipo,fecha_inicio,fecha_fin),
  INDEX idx_facturas_estado (estado,creado_en)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS factura_borrador_ventas (
  factura_id BIGINT UNSIGNED NOT NULL,
  venta_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (factura_id,venta_id),
  CONSTRAINT fk_factura_venta_factura FOREIGN KEY (factura_id) REFERENCES facturas_borrador(id) ON DELETE CASCADE,
  CONSTRAINT fk_factura_venta_venta FOREIGN KEY (venta_id) REFERENCES ventas(id),
  INDEX idx_factura_venta (venta_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS movimientos_contables (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NOT NULL,
  documento_cfdi_id BIGINT UNSIGNED NULL,
  tipo ENUM('INGRESO','EGRESO') NOT NULL,
  fecha DATE NOT NULL,
  concepto VARCHAR(255) NOT NULL,
  categoria VARCHAR(100) NOT NULL,
  metodo_pago VARCHAR(40) NULL,
  referencia VARCHAR(120) NULL,
  subtotal DECIMAL(14,2) NOT NULL,
  iva DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  retenciones DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total DECIMAL(14,2) NOT NULL,
  origen ENUM('CAJA','MANUAL','COMPRA','CFDI') NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_mov_contable_importes CHECK (subtotal >= 0 AND iva >= 0 AND retenciones >= 0 AND total >= 0),
  CONSTRAINT fk_mov_contable_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  CONSTRAINT fk_mov_contable_cfdi FOREIGN KEY (documento_cfdi_id) REFERENCES documentos_cfdi(id) ON DELETE SET NULL,
  INDEX idx_mov_contable_fecha_tipo (fecha, tipo),
  INDEX idx_mov_contable_referencia (referencia)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bitacora (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NULL,
  modulo VARCHAR(60) NOT NULL,
  accion VARCHAR(120) NOT NULL,
  descripcion VARCHAR(500) NULL,
  entidad VARCHAR(80) NULL,
  entidad_id BIGINT UNSIGNED NULL,
  datos_anteriores JSON NULL,
  datos_nuevos JSON NULL,
  ip VARCHAR(45) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bitacora_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_bitacora_fecha (creado_en),
  INDEX idx_bitacora_usuario (usuario_id),
  INDEX idx_bitacora_entidad (entidad, entidad_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS respaldos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NULL,
  nombre_archivo VARCHAR(255) NOT NULL,
  tipo ENUM('MANUAL','AUTOMATICO','EMERGENCIA') NOT NULL DEFAULT 'MANUAL',
  ubicacion VARCHAR(500) NULL,
  tamanio_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  checksum CHAR(64) NULL,
  version_esquema VARCHAR(30) NOT NULL,
  estado ENUM('CREANDO','COMPLETADO','FALLIDO','ELIMINADO') NOT NULL DEFAULT 'CREANDO',
  mensaje_error VARCHAR(500) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_respaldos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_respaldos_estado_fecha (estado, creado_en)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS producto_lotes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  producto_id BIGINT UNSIGNED NOT NULL,
  compra_id BIGINT UNSIGNED NULL,
  lote VARCHAR(80) NOT NULL,
  fecha_caducidad DATE NULL,
  cantidad_inicial DECIMAL(12,3) NOT NULL,
  cantidad_disponible DECIMAL(12,3) NOT NULL,
  costo_unitario DECIMAL(12,2) NOT NULL DEFAULT 0,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_lotes_cantidades CHECK (cantidad_inicial > 0 AND cantidad_disponible >= 0 AND cantidad_disponible <= cantidad_inicial),
  CONSTRAINT fk_lote_producto FOREIGN KEY (producto_id) REFERENCES productos(id),
  CONSTRAINT fk_lote_compra FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE SET NULL,
  UNIQUE KEY uq_producto_lote (producto_id,lote),
  INDEX idx_lotes_caducidad (fecha_caducidad,cantidad_disponible)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS venta_detalle_lotes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  venta_detalle_id BIGINT UNSIGNED NOT NULL,
  lote_id BIGINT UNSIGNED NOT NULL,
  cantidad DECIMAL(12,3) NOT NULL,
  CONSTRAINT chk_venta_detalle_lote_cantidad CHECK (cantidad > 0),
  CONSTRAINT fk_vdl_venta_detalle FOREIGN KEY (venta_detalle_id) REFERENCES venta_detalles(id) ON DELETE CASCADE,
  CONSTRAINT fk_vdl_lote FOREIGN KEY (lote_id) REFERENCES producto_lotes(id),
  UNIQUE KEY uq_venta_detalle_lote (venta_detalle_id,lote_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS devoluciones_venta (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  venta_id BIGINT UNSIGNED NOT NULL,
  usuario_id BIGINT UNSIGNED NOT NULL,
  motivo VARCHAR(255) NOT NULL,
  total_reembolso DECIMAL(14,2) NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_devolucion_venta FOREIGN KEY (venta_id) REFERENCES ventas(id),
  CONSTRAINT fk_devolucion_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  INDEX idx_devolucion_venta (venta_id,creado_en)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS devolucion_venta_detalles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  devolucion_id BIGINT UNSIGNED NOT NULL,
  venta_detalle_id BIGINT UNSIGNED NOT NULL,
  cantidad DECIMAL(12,3) NOT NULL,
  importe DECIMAL(14,2) NOT NULL,
  CONSTRAINT chk_devolucion_cantidad CHECK (cantidad > 0 AND importe >= 0),
  CONSTRAINT fk_dev_det_devolucion FOREIGN KEY (devolucion_id) REFERENCES devoluciones_venta(id) ON DELETE CASCADE,
  CONSTRAINT fk_dev_det_venta_detalle FOREIGN KEY (venta_detalle_id) REFERENCES venta_detalles(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS promociones (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  tipo ENUM('PORCENTAJE','PRECIO_ESPECIAL','DOS_POR_UNO','TRES_POR_DOS') NOT NULL,
  valor DECIMAL(12,2) NOT NULL DEFAULT 0,
  producto_id BIGINT UNSIGNED NULL,
  categoria_id BIGINT UNSIGNED NULL,
  fecha_inicio DATETIME NOT NULL,
  fecha_fin DATETIME NOT NULL,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  creado_por BIGINT UNSIGNED NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_promocion_fechas CHECK (fecha_fin > fecha_inicio),
  CONSTRAINT fk_promo_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
  CONSTRAINT fk_promo_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE CASCADE,
  CONSTRAINT fk_promo_usuario FOREIGN KEY (creado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS operaciones_sincronizacion (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  operacion_uuid CHAR(36) NOT NULL UNIQUE,
  usuario_id BIGINT UNSIGNED NOT NULL,
  tipo VARCHAR(40) NOT NULL,
  entidad_id BIGINT UNSIGNED NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sync_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  INDEX idx_sync_fecha (creado_en)
) ENGINE=InnoDB;

-- Datos de catálogo seguros. Los usuarios deben crearse desde un backend usando bcrypt o Argon2.
INSERT INTO roles (nombre, descripcion) VALUES
  ('Administrador', 'Acceso completo al sistema'),
  ('Gerente', 'Operación, inventario y estadísticas'),
  ('Cajera', 'Caja, clientes y fiados')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

INSERT INTO categorias (nombre, descripcion) VALUES
  ('Bebidas', 'Refrescos, agua y otras bebidas'),
  ('Botanas', 'Frituras, galletas y snacks'),
  ('Lácteos', 'Leche, queso y productos refrigerados'),
  ('Panadería', 'Pan empacado y pan dulce'),
  ('Granel', 'Productos vendidos por peso'),
  ('Frutas', 'Frutas frescas vendidas por kilogramo'),
  ('Verduras', 'Verduras frescas vendidas por kilogramo'),
  ('Carnes', 'Carne fresca vendida por kilogramo')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

CREATE OR REPLACE VIEW vista_inventario_alertas AS
SELECT
  p.id,
  p.codigo_barras,
  p.nombre,
  c.nombre AS categoria,
  p.stock_actual,
  p.stock_minimo,
  CASE
    WHEN p.stock_actual = 0 THEN 'AGOTADO'
    WHEN p.stock_actual <= p.stock_minimo THEN 'BAJO'
    ELSE 'DISPONIBLE'
  END AS estado_stock
FROM productos p
LEFT JOIN categorias c ON c.id = p.categoria_id
WHERE p.activo = TRUE;

CREATE OR REPLACE VIEW vista_fiados_saldos AS
SELECT
  f.id,
  f.cliente_id,
  c.nombre AS cliente,
  c.telefono,
  f.deuda_original,
  f.saldo_pendiente,
  f.fecha_limite,
  CASE
    WHEN f.saldo_pendiente = 0 THEN 'LIQUIDADO'
    WHEN f.fecha_limite < CURRENT_DATE THEN 'VENCIDO'
    ELSE f.estado
  END AS estado_calculado
FROM fiados f
JOIN clientes c ON c.id = f.cliente_id
WHERE f.estado <> 'CANCELADO';

CREATE OR REPLACE VIEW vista_ventas_diarias AS
SELECT
  DATE(v.fecha_venta) AS fecha,
  COUNT(*) AS numero_ventas,
  SUM(v.subtotal) AS subtotal,
  SUM(v.impuestos) AS impuestos,
  SUM(v.total) AS total,
  SUM(COALESCE(costos.costo_vendido, 0)) AS costo_vendido,
  SUM(v.total) - SUM(COALESCE(costos.costo_vendido, 0)) AS utilidad_bruta
FROM ventas v
LEFT JOIN (
  SELECT venta_id, SUM(cantidad * costo_unitario) AS costo_vendido
  FROM venta_detalles
  GROUP BY venta_id
) costos ON costos.venta_id = v.id
WHERE v.estado = 'COMPLETADA'
GROUP BY DATE(v.fecha_venta);

-- Comprobación final.
SELECT DATABASE() AS base_activa;
SHOW TABLES;

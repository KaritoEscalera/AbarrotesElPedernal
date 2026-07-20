import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent,
  IonInput, IonItem, IonLabel, IonSelect, IonSelectOption,
} from '@ionic/angular/standalone';
import { BusinessApi } from '../../services/business-api';

interface ProductoCaja {
  id: number;
  codigo: string | null;
  nombre: string;
  stock: number;
  precioVenta: number;
  tasaIva: number;
  activo: boolean;
  categoria?: string;
  unidadMedida?: string;
  promoTipo?: 'PORCENTAJE'|'PRECIO_ESPECIAL'|'DOS_POR_UNO'|'TRES_POR_DOS'|null;
  promoValor?: number|null;
}

interface ClienteCaja { id: number; nombre: string; telefono: string; activo: boolean; }
interface CambioPendiente { id:number; clienteId:number; cliente:string; telefono:string; monto:number; estado:'PENDIENTE'|'ENTREGADO'; fecha:string; }
interface LineaCarrito extends ProductoCaja { cantidad: number; }
interface SesionCaja { id: number; estado: 'ABIERTA'; fondoInicial: number; fechaApertura: string; }
interface MovimientoCaja { id: number; tipo: string; descripcion: string; metodo: string; monto: number; fecha: string; }

interface EstadoCaja {
  session: SesionCaja | null;
  totals: { ventas: number; efectivoEsperado: number; ventasEfectivo:number; ventasTarjeta:number; ventasTransferencia:number; ventasFiado:number } | null;
  movements: MovimientoCaja[];
}
interface CorteCaja { sesionId?:number; fondoInicial:number; efectivoEsperado:number; efectivoContado?:number; diferencia?:number; ventasEfectivo:number; ventasTarjeta:number; ventasTransferencia:number; ventasFiado:number; fechaCierre?:string; }
interface VentaPendiente { operacionUuid:string; payload:Record<string,unknown>; creada:string; }

@Component({
  selector: 'app-caja',
  templateUrl: './caja.page.html',
  styleUrls: ['./caja.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonCard, IonCardHeader, IonCardTitle,
    IonCardContent, IonButton, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption],
})
export class CajaPage implements OnInit, OnDestroy {
  private readonly api = inject(BusinessApi);

  productos: ProductoCaja[] = [];
  clientes: ClienteCaja[] = [];
  carrito: LineaCarrito[] = [];
  sesion: SesionCaja | null = null;
  movimientos: MovimientoCaja[] = [];
  ventasTurno = 0;
  efectivoEsperado = 0;
  ventasPorMetodo = { EFECTIVO:0, TARJETA:0, TRANSFERENCIA:0, FIADO:0 };
  busqueda = '';
  fondoInicial: number | null = 1000;
  metodo: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'FIADO' | 'MIXTO' = 'EFECTIVO';
  clienteId: number | null = null;
  referencia = '';
  efectivoRecibido: number | null = null;
  pagoMixtoEfectivo: number | null = null;
  pagoMixtoTarjeta: number | null = null;
  pagoMixtoTransferencia: number | null = null;
  pagoMixtoFiado: number | null = null;
  plazoCredito = 30;
  recargaCompania = 'TELCEL';
  recargaTelefono = '';
  recargaMonto: number | null = null;
  cambioClienteId: number | null = null;
  cambioPendienteMonto: number | null = null;
  cambiosPendientes: CambioPendiente[] = [];
  efectivoContado: number | null = null;
  movimientoTipo: 'INGRESO' | 'SALIDA' = 'SALIDA';
  movimientoMonto: number | null = null;
  movimientoDescripcion = '';
  mensaje = '';
  error = '';
  procesando = false;
  ventasSuspendidas: Array<{ id: number; fecha: string; carrito: LineaCarrito[] }> = this.cargarSuspendidas();
  ventasPendientes:VentaPendiente[]=this.cargarPendientes();

  private readonly alVolverConexion = ():void => { void this.sincronizarPendientes(); };

  async ngOnInit(): Promise<void> { await this.cargarTodo(); await this.sincronizarPendientes(); window.addEventListener('online',this.alVolverConexion); }
  ngOnDestroy():void { window.removeEventListener('online',this.alVolverConexion); }

  get productosFiltrados(): ProductoCaja[] {
    const term = this.busqueda.trim().toLowerCase();
    return this.productos.filter((p) => p.activo && p.stock > 0 && (!term || p.nombre.toLowerCase().includes(term) || p.codigo?.toLowerCase().includes(term))).slice(0, 30);
  }

  get subtotal(): number { return this.carrito.reduce((sum, p) => sum + p.precioVenta * p.cantidad, 0); }
  get descuento():number{return this.carrito.reduce((sum,p)=>sum+this.descuentoLinea(p),0);}
  get impuestos(): number { return this.carrito.reduce((sum, p) => sum + (p.precioVenta*p.cantidad-this.descuentoLinea(p)) * p.tasaIva / 100, 0); }
  get total(): number { return Math.round((this.subtotal-this.descuento + this.impuestos) * 100) / 100; }
  descuentoLinea(p:LineaCarrito):number{const base=p.precioVenta*p.cantidad;if(p.promoTipo==='PORCENTAJE')return base*Math.min(100,Number(p.promoValor))/100;if(p.promoTipo==='PRECIO_ESPECIAL')return Math.max(0,base-Number(p.promoValor)*p.cantidad);if(p.promoTipo==='DOS_POR_UNO')return Math.floor(p.cantidad/2)*p.precioVenta;if(p.promoTipo==='TRES_POR_DOS')return Math.floor(p.cantidad/3)*p.precioVenta;return 0;}
  totalLinea(p:LineaCarrito):number{return p.precioVenta*p.cantidad-this.descuentoLinea(p);}
  get cambio(): number { return this.metodo === 'EFECTIVO' && Number(this.efectivoRecibido) > this.total ? Number(this.efectivoRecibido) - this.total : 0; }
  get efectivoFaltante(): number { return this.metodo === 'EFECTIVO' ? Math.max(0, this.total - Number(this.efectivoRecibido || 0)) : 0; }
  get totalPagoMixto(): number { return Number(this.pagoMixtoEfectivo || 0) + Number(this.pagoMixtoTarjeta || 0) + Number(this.pagoMixtoTransferencia || 0) + Number(this.pagoMixtoFiado || 0); }
  get diferenciaPagoMixto(): number { return Math.round((this.total - this.totalPagoMixto) * 100) / 100; }

  usarEfectivo(monto: number): void { this.efectivoRecibido = monto; }
  usarMontoExacto(): void { this.efectivoRecibido = this.total; }

  agregar(producto: ProductoCaja): void {
    const linea = this.carrito.find((item) => item.id === producto.id);
    if (linea) {
      if (linea.cantidad < producto.stock) linea.cantidad += 1;
    } else {
      this.carrito = [...this.carrito, { ...producto, cantidad: 1 }];
    }
  }

  procesarCodigo(): void {
    const codigo = this.busqueda.trim().toLowerCase();
    if (!codigo) return;
    const exacto = this.productos.find((p) => p.activo && (p.codigo?.toLowerCase() === codigo || p.nombre.toLowerCase() === codigo));
    if (exacto) { this.agregar(exacto); this.busqueda = ''; this.mensaje = `${exacto.nombre} agregado.`; this.error = ''; }
    else this.fallar('No existe un producto con ese código de barras.');
  }

  suspenderVenta(): void {
    if (!this.carrito.length) return this.fallar('No hay productos para suspender.');
    const venta = { id: Date.now(), fecha: new Date().toISOString(), carrito: this.carrito.map((p) => ({ ...p })) };
    this.ventasSuspendidas = [venta, ...this.ventasSuspendidas].slice(0, 10);
    localStorage.setItem('ventasSuspendidas', JSON.stringify(this.ventasSuspendidas));
    this.carrito = []; this.efectivoRecibido = null; this.mensaje = 'Venta suspendida. Puedes recuperarla más tarde.';
  }

  recuperarVenta(id: number): void {
    const venta = this.ventasSuspendidas.find((v) => v.id === id); if (!venta) return;
    this.carrito = venta.carrito.map((p) => ({ ...p }));
    this.ventasSuspendidas = this.ventasSuspendidas.filter((v) => v.id !== id);
    localStorage.setItem('ventasSuspendidas', JSON.stringify(this.ventasSuspendidas));
    this.mensaje = 'Venta recuperada.';
  }
  totalSuspendida(venta: { carrito: LineaCarrito[] }): number { return venta.carrito.reduce((s, p) => s + p.precioVenta * p.cantidad * (1 + p.tasaIva / 100), 0); }

  cambiarCantidad(linea: LineaCarrito, cantidad: unknown): void {
    const nueva = Number(cantidad);
    if (!Number.isFinite(nueva) || nueva <= 0) this.quitar(linea.id);
    else linea.cantidad = Math.min(nueva, linea.stock);
  }

  quitar(id: number): void { this.carrito = this.carrito.filter((item) => item.id !== id); }

  esVentaGranel(producto: ProductoCaja): boolean { return producto.unidadMedida?.toLowerCase() === 'kilogramo' || ['granel','frutas','verduras','carnes'].includes(producto.categoria?.toLowerCase() ?? ''); }

  async abrirCaja(): Promise<void> {
    const fondo = Number(this.fondoInicial);
    if (!Number.isFinite(fondo) || fondo < 0) return this.fallar('Ingresa un fondo inicial válido.');
    await this.ejecutar(async () => {
      await this.api.post('cash/open', { fondoInicial: fondo });
      await this.cargarEstado();
      this.mensaje = 'Caja abierta correctamente.';
    });
  }

  async cobrar(): Promise<void> {
    if (!this.sesion) return this.fallar('Abre la caja antes de cobrar.');
    if (!this.carrito.length) return this.fallar('Agrega al menos un producto.');
    if (this.metodo === 'FIADO' && !this.clienteId) return this.fallar('Selecciona un cliente para el fiado.');
    if (this.metodo === 'MIXTO' && Number(this.pagoMixtoFiado || 0) > 0 && !this.clienteId) return this.fallar('Selecciona un cliente para la parte a fiado.');
    if (['TARJETA', 'TRANSFERENCIA'].includes(this.metodo) && !this.referencia.trim()) return this.fallar('Captura la referencia del pago.');
    if (this.metodo === 'EFECTIVO' && Number(this.efectivoRecibido) < this.total) return this.fallar('El efectivo recibido es menor al total.');
    if (this.metodo === 'MIXTO' && Math.abs(this.diferenciaPagoMixto) > .009) return this.fallar('La suma del pago mixto debe coincidir con el total.');
    await this.ejecutar(async () => {
      const operacionUuid=crypto.randomUUID();
      const payload:Record<string,unknown>={operacionUuid,
        items: this.carrito.map((p) => ({ productoId: p.id, cantidad: p.cantidad })),
        metodo: this.metodo,
        clienteId: this.clienteId,
        referencia: this.referencia,
        pagos: this.metodo === 'MIXTO' ? [
          { metodo: 'EFECTIVO', monto: Number(this.pagoMixtoEfectivo || 0) },
          { metodo: 'TARJETA', monto: Number(this.pagoMixtoTarjeta || 0), referencia: this.referencia },
          { metodo: 'TRANSFERENCIA', monto: Number(this.pagoMixtoTransferencia || 0), referencia: this.referencia },
          { metodo: 'FIADO', monto: Number(this.pagoMixtoFiado || 0) },
        ] : undefined,
        plazoDias: (this.metodo === 'FIADO' || Number(this.pagoMixtoFiado || 0) > 0) ? this.plazoCredito : undefined };
      let venta:{folio:string;total:number};
      try{venta=await this.api.post<{folio:string;total:number}>('sales',payload);}catch(e:unknown){const x=e as{status?:number};if(x.status===0||!navigator.onLine){this.ventasPendientes=[...this.ventasPendientes,{operacionUuid,payload,creada:new Date().toISOString()}];localStorage.setItem('ventasPendientesSync',JSON.stringify(this.ventasPendientes));this.carrito=[];this.mensaje='Venta guardada sin conexión. Se sincronizará automáticamente; no cierres la caja todavía.';return;}throw e;}
      const cambio = this.cambio;
      this.carrito = [];
      this.referencia = '';
      this.clienteId = null;
      this.efectivoRecibido = null;
      this.pagoMixtoEfectivo = null; this.pagoMixtoTarjeta = null; this.pagoMixtoTransferencia = null; this.pagoMixtoFiado = null;
      await this.cargarTodo();
      this.mensaje = `Venta ${venta.folio} registrada por $${Number(venta.total).toFixed(2)}${cambio ? `; cambio $${cambio.toFixed(2)}` : ''}.`;
    });
  }

  async registrarMovimiento(): Promise<void> {
    const monto = Number(this.movimientoMonto);
    if (!monto || monto <= 0 || !this.movimientoDescripcion.trim()) return this.fallar('Captura descripción y monto del movimiento.');
    await this.ejecutar(async () => {
      await this.api.post('cash/movements', { tipo: this.movimientoTipo, monto, descripcion: this.movimientoDescripcion });
      this.movimientoMonto = null;
      this.movimientoDescripcion = '';
      await this.cargarEstado();
      this.mensaje = 'Movimiento registrado.';
    });
  }

  async registrarRecarga():Promise<void>{
    const monto=Number(this.recargaMonto); const telefono=this.recargaTelefono.trim();
    if(!/^\d{10}$/.test(telefono)||!Number.isFinite(monto)||monto<=0)return this.fallar('Captura un teléfono de 10 dígitos y un monto válido.');
    await this.ejecutar(async()=>{await this.api.post('cash/services',{tipo:'RECARGA',compania:this.recargaCompania,telefono,monto});this.recargaTelefono='';this.recargaMonto=null;await this.cargarEstado();this.mensaje=`Recarga ${this.recargaCompania} registrada correctamente.`;});
  }

  async guardarCambioPendiente():Promise<void>{
    const monto=Number(this.cambioPendienteMonto);
    if(!this.cambioClienteId||!Number.isFinite(monto)||monto<=0)return this.fallar('Selecciona el cliente e indica el cambio pendiente.');
    await this.ejecutar(async()=>{await this.api.post('customer-balances',{clienteId:this.cambioClienteId,monto});this.cambioClienteId=null;this.cambioPendienteMonto=null;await this.cargarCambios();this.mensaje='Cambio guardado a favor del cliente.';});
  }

  async entregarCambio(item:CambioPendiente):Promise<void>{await this.ejecutar(async()=>{await this.api.patch(`customer-balances/${item.id}/settle`,{});await this.cargarCambios();await this.cargarEstado();this.mensaje='Cambio entregado y saldo liquidado.';});}

  async cerrarCaja(): Promise<void> {
    if(this.ventasPendientes.length)return this.fallar('Hay ventas sin conexión pendientes. Conecta la red y sincronízalas antes de cerrar caja.');
    const contado = Number(this.efectivoContado);
    if (!Number.isFinite(contado) || contado < 0) return this.fallar('Captura el efectivo contado.');
    await this.ejecutar(async () => {
      const corte = await this.api.post<CorteCaja>('cash/close', { efectivoContado: contado });
      this.efectivoContado = null;
      await this.cargarEstado();
      this.mensaje = `Caja cerrada. Diferencia: $${Number(corte.diferencia).toFixed(2)}.`;
      this.imprimirCorte(corte, 'Z');
    });
  }

  imprimirCorteX(): void {
    if (!this.sesion) return;
    this.imprimirCorte({ fondoInicial:this.sesion.fondoInicial,efectivoEsperado:this.efectivoEsperado,ventasEfectivo:this.ventasPorMetodo.EFECTIVO,ventasTarjeta:this.ventasPorMetodo.TARJETA,ventasTransferencia:this.ventasPorMetodo.TRANSFERENCIA,ventasFiado:this.ventasPorMetodo.FIADO }, 'X');
  }

  private imprimirCorte(c:CorteCaja,tipo:'X'|'Z'):void {
    const w=window.open('','_blank','width=400,height=700'); if(!w){this.error='Permite ventanas emergentes para imprimir el corte.';return;}
    const row=(label:string,value:number|undefined)=>`<tr><td>${label}</td><td>$${Number(value??0).toFixed(2)}</td></tr>`;
    w.document.write(`<html><head><title>Corte ${tipo}</title><style>body{font:14px monospace;width:300px;margin:20px auto}h2,p{text-align:center}table{width:100%}td{padding:5px}td:last-child{text-align:right}.total{font-weight:bold;border-top:1px dashed}</style></head><body><h2>Abarrotes El Pedernal</h2><p>CORTE ${tipo}<br>${new Date(c.fechaCierre??Date.now()).toLocaleString('es-MX')}</p><table>${row('Fondo inicial',c.fondoInicial)}${row('Ventas efectivo',c.ventasEfectivo)}${row('Ventas tarjeta',c.ventasTarjeta)}${row('Transferencias',c.ventasTransferencia)}${row('Fiado',c.ventasFiado)}${row('Efectivo esperado',c.efectivoEsperado)}${tipo==='Z'?row('Efectivo contado',c.efectivoContado)+row('Diferencia',c.diferencia):''}</table><p>${tipo==='X'?'Corte informativo; la caja continúa abierta.':'Corte definitivo de cierre.'}</p><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();
  }

  private async cargarTodo(): Promise<void> {
    await Promise.all([this.cargarEstado(), this.cargarCatalogos(),this.cargarCambios()]);
  }

  private async cargarCatalogos(): Promise<void> {
    const [productos, clientes] = await Promise.all([
      this.api.get<ProductoCaja[]>('products'),
      this.api.get<ClienteCaja[]>('clients'),
    ]);
    this.productos = productos.map((p) => ({ ...p, stock: Number(p.stock), precioVenta: Number(p.precioVenta), tasaIva: Number(p.tasaIva),promoValor:p.promoValor===null?null:Number(p.promoValor) }));
    this.clientes = clientes.filter((c) => c.activo);
  }
  private async cargarCambios():Promise<void>{try{const datos=await this.api.get<CambioPendiente[]>('customer-balances');this.cambiosPendientes=datos.map(x=>({...x,monto:Number(x.monto)}));}catch{this.cambiosPendientes=[];}}

  private async cargarEstado(): Promise<void> {
    const estado = await this.api.get<EstadoCaja>('cash/current');
    this.sesion = estado.session ? { ...estado.session, fondoInicial: Number(estado.session.fondoInicial) } : null;
    this.movimientos = estado.movements.map((m) => ({ ...m, monto: Number(m.monto) }));
    this.ventasTurno = Number(estado.totals?.ventas ?? 0);
    this.efectivoEsperado = Number(estado.totals?.efectivoEsperado ?? 0);
    this.ventasPorMetodo = {
      EFECTIVO:Number(estado.totals?.ventasEfectivo ?? 0), TARJETA:Number(estado.totals?.ventasTarjeta ?? 0),
      TRANSFERENCIA:Number(estado.totals?.ventasTransferencia ?? 0), FIADO:Number(estado.totals?.ventasFiado ?? 0),
    };
  }

  private async ejecutar(accion: () => Promise<void>): Promise<void> {
    this.procesando = true;
    this.error = '';
    this.mensaje = '';
    try { await accion(); }
    catch (e: unknown) {
      const response = e as { error?: { error?: { error?: string } } };
      this.error = response.error?.error?.error ?? 'No fue posible completar la operación.';
    } finally { this.procesando = false; }
  }

  private fallar(mensaje: string): void { this.error = mensaje; this.mensaje = ''; }
  private cargarSuspendidas(): Array<{ id: number; fecha: string; carrito: LineaCarrito[] }> { try { const value=JSON.parse(localStorage.getItem('ventasSuspendidas')??'[]'); return Array.isArray(value)?value:[]; } catch { return []; } }
  private cargarPendientes():VentaPendiente[]{try{const v=JSON.parse(localStorage.getItem('ventasPendientesSync')??'[]');return Array.isArray(v)?v:[];}catch{return[];}}
  async sincronizarPendientes():Promise<void>{if(!navigator.onLine||!this.ventasPendientes.length)return;for(const pendiente of [...this.ventasPendientes]){try{await this.api.post('sales',pendiente.payload);this.ventasPendientes=this.ventasPendientes.filter(v=>v.operacionUuid!==pendiente.operacionUuid);localStorage.setItem('ventasPendientesSync',JSON.stringify(this.ventasPendientes));}catch{break;}}if(!this.ventasPendientes.length)await this.cargarTodo();}
}

import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent,
  IonInput, IonItem, IonLabel, IonSelect, IonSelectOption,
} from '@ionic/angular/standalone';
import { BusinessApi } from '../../services/business-api';
import { Auth } from '../../services/auth';

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

interface ClienteCaja { id: number; nombre: string; telefono: string; activo: boolean; saldoFavor:number; }
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
interface VentaResumen { id:number; folio:string; fecha:string; estado:'COMPLETADA'|'CANCELADA'|'DEVUELTA'; total:number; usuario:string; cliente:string; metodo:string; }
interface VentaDetalle extends VentaResumen { subtotal:number; descuento:number; impuestos:number; items:Array<{nombre:string;cantidad:number;precioUnitario:number;importe:number}>; pagos:Array<{metodo:string;monto:number;referencia:string|null}>; fiado:{monto:number;saldoPendiente:number;fechaLimite:string}|null; }
interface Denominacion { valor:number; etiqueta:string; cantidad:number|null; }
interface Recarga {id:number;compania:string;telefono:string;monto:number;comision:number;estado:'PENDIENTE'|'EXITOSA'|'RECHAZADA'|'CANCELADA';folioProveedor:string|null;motivo:string|null;fecha:string;usuario:string;folioCaptura?:string;motivoCaptura?:string;}
interface ConciliacionRecargas {total:number;comisiones:number;pendientes:number;exitosas:number;rechazadas:number;canceladas:number;porCompania:Array<{compania:string;operaciones:number;monto:number;comision:number}>;}

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
  private readonly auth = inject(Auth);

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
  metodo: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'FIADO' | 'SALDO_FAVOR' | 'MIXTO' = 'EFECTIVO';
  clienteId: number | null = null;
  referencia = '';
  efectivoRecibido: number | null = null;
  pagoMixtoEfectivo: number | null = null;
  pagoMixtoTarjeta: number | null = null;
  pagoMixtoTransferencia: number | null = null;
  pagoMixtoFiado: number | null = null;
  pagoMixtoSaldoFavor: number | null = null;
  plazoCredito = 30;
  recargaCompania = 'TELCEL';
  recargaTelefono = '';
  recargaMonto: number | null = null;
  recargaComision:number|null=0;
  recargas:Recarga[]=[];
  conciliacionRecargas:ConciliacionRecargas={total:0,comisiones:0,pendientes:0,exitosas:0,rechazadas:0,canceladas:0,porCompania:[]};
  cambioClienteId: number | null = null;
  cambioPendienteMonto: number | null = null;
  cambioClienteGenerico = '';
  cambiosPendientes: CambioPendiente[] = [];
  efectivoContado: number | null = null;
  observacionesCierre = '';
  movimientoTipo: 'INGRESO' | 'SALIDA' = 'SALIDA';
  movimientoMonto: number | null = null;
  movimientoDescripcion = '';
  mensaje = '';
  error = '';
  procesando = false;
  ventasSuspendidas: Array<{ id: number; fecha: string; carrito: LineaCarrito[] }> = this.cargarSuspendidas();
  ventasPendientes:VentaPendiente[]=this.cargarPendientes();
  historialVentas:VentaResumen[]=[];
  busquedaVentas='';
  ventaSeleccionada:VentaDetalle|null=null;
  motivoCancelacion='';
  readonly puedeCancelar=this.auth.obtenerRol()==='administrador'||this.auth.obtenerRol()==='gerente';
  readonly puedeAdministrarRecargas=this.puedeCancelar;
  denominaciones:Denominacion[]=[1000,500,200,100,50,20,10,5,2,1,.5].map(valor=>({valor,etiqueta:valor>=20?`Billetes de $${valor}`:`Monedas de $${valor}`,cantidad:null}));

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
  get totalPagoMixto(): number { return Number(this.pagoMixtoEfectivo || 0) + Number(this.pagoMixtoTarjeta || 0) + Number(this.pagoMixtoTransferencia || 0) + Number(this.pagoMixtoFiado || 0) + Number(this.pagoMixtoSaldoFavor || 0); }
  get diferenciaPagoMixto(): number { return Math.round((this.total - this.totalPagoMixto) * 100) / 100; }
  get clienteSeleccionado():ClienteCaja|undefined{return this.clientes.find(c=>c.id===Number(this.clienteId));}
  get totalArqueo():number{return Math.round(this.denominaciones.reduce((s,d)=>s+d.valor*Number(d.cantidad||0),0)*100)/100;}
  get diferenciaArqueo():number{return Math.round((this.totalArqueo-this.efectivoEsperado)*100)/100;}
  get errorTelefonoRecarga():string{
    const telefono=this.recargaTelefono.trim();
    if(!telefono)return '';
    if(!/^\d+$/.test(telefono))return 'El número solo puede contener dígitos.';
    if(telefono.length<10){const faltan=10-telefono.length;return `Número incompleto: ${faltan===1?'falta 1 dígito':`faltan ${faltan} dígitos`}.`;}
    if(telefono.length>10){const sobran=telefono.length-10;return `Número demasiado largo: ${sobran===1?'sobra 1 dígito':`sobran ${sobran} dígitos`}.`;}
    return '';
  }
  get telefonoRecargaValido():boolean{return /^\d{10}$/.test(this.recargaTelefono.trim());}

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
    if (this.metodo === 'SALDO_FAVOR' && !this.clienteId) return this.fallar('Selecciona el cliente que utilizará su saldo a favor.');
    if (this.metodo === 'SALDO_FAVOR' && Number(this.clienteSeleccionado?.saldoFavor||0) < this.total) return this.fallar('El saldo a favor del cliente no alcanza para cubrir la venta completa; usa pago mixto.');
    if (this.metodo === 'MIXTO' && Number(this.pagoMixtoFiado || 0) > 0 && !this.clienteId) return this.fallar('Selecciona un cliente para la parte a fiado.');
    if (this.metodo === 'MIXTO' && Number(this.pagoMixtoSaldoFavor || 0) > 0 && !this.clienteId) return this.fallar('Selecciona el cliente para utilizar saldo a favor.');
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
          { metodo: 'SALDO_FAVOR', monto: Number(this.pagoMixtoSaldoFavor || 0) },
        ] : undefined,
        plazoDias: (this.metodo === 'FIADO' || Number(this.pagoMixtoFiado || 0) > 0) ? this.plazoCredito : undefined };
      let venta:{id:number;folio:string;total:number};
      try{venta=await this.api.post<{id:number;folio:string;total:number}>('sales',payload);}catch(e:unknown){const x=e as{status?:number};if(x.status===0||!navigator.onLine){this.ventasPendientes=[...this.ventasPendientes,{operacionUuid,payload,creada:new Date().toISOString()}];localStorage.setItem('ventasPendientesSync',JSON.stringify(this.ventasPendientes));this.carrito=[];this.mensaje='Venta guardada sin conexión. Se sincronizará automáticamente; no cierres la caja todavía.';return;}throw e;}
      const cambio = this.cambio;
      this.carrito = [];
      this.referencia = '';
      this.clienteId = null;
      this.efectivoRecibido = null;
      this.pagoMixtoEfectivo = null; this.pagoMixtoTarjeta = null; this.pagoMixtoTransferencia = null; this.pagoMixtoFiado = null; this.pagoMixtoSaldoFavor=null;
      await this.cargarTodo();
      this.mensaje = `Venta ${venta.folio} registrada por $${Number(venta.total).toFixed(2)}${cambio ? `; cambio $${cambio.toFixed(2)}` : ''}.`;
      await this.cargarHistorial();
      await this.imprimirTicket(venta.id,cambio);
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
    const monto=Number(this.recargaMonto),comision=Number(this.recargaComision||0); const telefono=this.recargaTelefono.trim();
    if(!/^\d{10}$/.test(telefono)||!Number.isFinite(monto)||monto<=0||comision<0||comision>monto)return this.fallar('Captura teléfono, monto y comisión válidos.');
    await this.ejecutar(async()=>{await this.api.post('cash/services',{tipo:'RECARGA',compania:this.recargaCompania,telefono,monto,comision});this.recargaTelefono='';this.recargaMonto=null;this.recargaComision=0;await this.cargarRecargas();this.mensaje=`Recarga ${this.recargaCompania} creada como pendiente. Confirma el resultado del proveedor.`;});
  }
  async resolverRecarga(item:Recarga,estado:'EXITOSA'|'RECHAZADA'):Promise<void>{const folio=String(item.folioCaptura||'').trim(),motivo=String(item.motivoCaptura||'').trim();if(estado==='EXITOSA'&&!folio)return this.fallar('Captura el folio entregado por el proveedor.');if(estado==='RECHAZADA'&&motivo.length<4)return this.fallar('Indica por qué fue rechazada.');await this.ejecutar(async()=>{await this.api.patch(`recharges/${item.id}/resolve`,{estado,folioProveedor:folio,motivo});await Promise.all([this.cargarRecargas(),this.cargarEstado()]);this.mensaje=`Recarga marcada como ${estado.toLowerCase()}.`;});}
  async cancelarRecarga(item:Recarga):Promise<void>{const motivo=prompt('Motivo de la cancelación y reembolso:')?.trim()||'';if(motivo.length<5)return this.fallar('El motivo debe tener al menos 5 caracteres.');await this.ejecutar(async()=>{await this.api.post(`recharges/${item.id}/cancel`,{motivo});await Promise.all([this.cargarRecargas(),this.cargarEstado()]);this.mensaje='Recarga cancelada y reembolso registrado en caja.';});}

  async guardarCambioPendiente():Promise<void>{
    const monto=Number(this.cambioPendienteMonto);
    if(!this.cambioClienteId||!Number.isFinite(monto)||monto<=0)return this.fallar('Selecciona el cliente e indica el cambio pendiente.');
    await this.ejecutar(async()=>{await this.api.post('customer-balances',{clienteId:this.cambioClienteId,monto});this.cambioClienteId=null;this.cambioPendienteMonto=null;await this.cargarCambios();this.mensaje='Cambio guardado a favor del cliente.';});
  }

  async crearClienteGenericoCambio():Promise<void>{
    const referencia=this.cambioClienteGenerico.trim();
    if(!referencia)return this.fallar('Escribe una referencia para distinguir al cliente genérico.');
    await this.ejecutar(async()=>{const creado=await this.api.post<{id:number}>('clients',{nombre:`Cliente genérico - ${referencia}`,telefono:'',direccion:''});this.cambioClienteGenerico='';await this.cargarCatalogos();this.cambioClienteId=Number(creado.id);this.mensaje='Cliente genérico creado y seleccionado.';});
  }

  async entregarCambio(item:CambioPendiente):Promise<void>{await this.ejecutar(async()=>{await this.api.patch(`customer-balances/${item.id}/settle`,{});await this.cargarCambios();await this.cargarEstado();this.mensaje='Cambio entregado y saldo liquidado.';});}

  async cerrarCaja(): Promise<void> {
    if(this.ventasPendientes.length)return this.fallar('Hay ventas sin conexión pendientes. Conecta la red y sincronízalas antes de cerrar caja.');
    if(!this.denominaciones.some(d=>d.cantidad!==null))return this.fallar('Captura las cantidades de billetes y monedas para realizar el arqueo.');
    const contado = this.totalArqueo;
    if (!Number.isFinite(contado) || contado < 0) return this.fallar('Captura el efectivo contado.');
    await this.ejecutar(async () => {
      const desglose=this.denominaciones.filter(d=>Number(d.cantidad)>0).map(d=>`${d.cantidad} × $${d.valor}`).join(', ');
      const notas=[this.observacionesCierre.trim(),`Arqueo: ${desglose||'sin efectivo'}`].filter(Boolean).join(' | ');
      const corte = await this.api.post<CorteCaja>('cash/close', { efectivoContado: contado,observaciones:notas,denominaciones:this.denominaciones });
      this.efectivoContado = null;
      this.observacionesCierre='';this.denominaciones.forEach(d=>d.cantidad=null);
      await this.cargarEstado();
      this.mensaje = `Caja cerrada. Diferencia: $${Number(corte.diferencia).toFixed(2)}.`;
      this.imprimirCorte(corte, 'Z');
    });
  }

  async cargarHistorial():Promise<void>{try{const datos=await this.api.get<VentaResumen[]>(`sales?q=${encodeURIComponent(this.busquedaVentas.trim())}`);this.historialVentas=datos.map(v=>({...v,total:Number(v.total)}));}catch{this.historialVentas=[];}}
  async verVenta(id:number):Promise<void>{await this.ejecutar(async()=>{this.ventaSeleccionada=await this.obtenerVenta(id);});}
  cerrarDetalleVenta():void{this.ventaSeleccionada=null;this.motivoCancelacion='';}
  async cancelarVenta():Promise<void>{if(!this.ventaSeleccionada)return;const motivo=this.motivoCancelacion.trim();if(motivo.length<5)return this.fallar('Escribe un motivo de cancelación de al menos 5 caracteres.');await this.ejecutar(async()=>{await this.api.post(`sales/${this.ventaSeleccionada!.id}/cancel`,{motivo});this.cerrarDetalleVenta();await Promise.all([this.cargarHistorial(),this.cargarTodo()]);this.mensaje='Venta cancelada, inventario y caja actualizados.';});}
  async imprimirTicket(id:number,cambio=0):Promise<void>{
    const venta=await this.obtenerVenta(id);const w=window.open('','_blank','width=420,height=720');
    if(!w){this.error='Permite ventanas emergentes para imprimir el ticket.';return;}
    const dinero=(n:number)=>`$${Number(n).toFixed(2)}`;
    const logo=`${window.location.origin}/assets/logo-pedernal.png`;
    const filas=venta.items.map(i=>`<tr><td>${i.cantidad} × ${this.escapar(i.nombre)}</td><td>${dinero(i.importe)}</td></tr>`).join('');
    const pagos=venta.pagos.map(p=>`<tr><td>${this.escapar(p.metodo==='TARJETA'?'TERMINAL / TARJETA':p.metodo)}</td><td>${dinero(p.monto)}</td></tr>`).join('');
    const credito=venta.fiado?`<section class="credit"><b>VENTA A FIADO</b><div>Cliente: ${this.escapar(venta.cliente)}</div><div>Monto fiado: ${dinero(venta.fiado.monto)}</div><div>Total que debe: ${dinero(venta.fiado.saldoPendiente)}</div><div>Vence: ${new Date(`${venta.fiado.fechaLimite}T00:00:00`).toLocaleDateString('es-MX')}</div></section>`:'';
    w.document.write(`<html><head><title>${this.escapar(venta.folio)}</title><style>body{font:13px monospace;width:300px;margin:18px auto;color:#111}h2,p{text-align:center;margin:6px}table{width:100%;border-collapse:collapse;margin:10px 0}td{padding:5px 0;border-bottom:1px dashed #bbb}td:last-child{text-align:right}.total{font-size:17px;font-weight:bold}.credit{border:2px solid #111;padding:10px;margin-top:12px}.credit b{display:block;text-align:center;margin-bottom:8px}.credit div{padding:3px 0}small{display:block;text-align:center;margin-top:16px}.ticket-logo{display:block;max-width:130px;max-height:90px;object-fit:contain;margin:14px auto 0;filter:grayscale(1) contrast(1.35)}@media print{.ticket-logo{filter:grayscale(1) contrast(1.5)}}</style></head><body><h2>Abarrotes El Pedernal</h2><p>${this.escapar(venta.folio)}<br>${new Date(venta.fecha).toLocaleString('es-MX')}<br>Atendió: ${this.escapar(venta.usuario)}</p><table>${filas}</table><table><tr><td>Subtotal</td><td>${dinero(venta.subtotal)}</td></tr>${venta.descuento?`<tr><td>Descuento</td><td>-${dinero(venta.descuento)}</td></tr>`:''}<tr><td>IVA</td><td>${dinero(venta.impuestos)}</td></tr><tr class="total"><td>Total</td><td>${dinero(venta.total)}</td></tr>${pagos}${cambio?`<tr><td>Cambio</td><td>${dinero(cambio)}</td></tr>`:''}</table>${credito}<small>Gracias por su compra</small><img class="ticket-logo" src="${this.escapar(logo)}" alt="Abarrotes El Pedernal"><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();
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
    await Promise.all([this.cargarEstado(), this.cargarCatalogos(),this.cargarCambios(),this.cargarHistorial(),this.cargarRecargas()]);
  }

  private async cargarCatalogos(): Promise<void> {
    const [productos, clientes] = await Promise.all([
      this.api.get<ProductoCaja[]>('products'),
      this.api.get<ClienteCaja[]>('clients'),
    ]);
    this.productos = productos.map((p) => ({ ...p, stock: Number(p.stock), precioVenta: Number(p.precioVenta), tasaIva: Number(p.tasaIva),promoValor:p.promoValor===null?null:Number(p.promoValor) }));
    this.clientes = clientes.filter((c) => c.activo).map(c=>({...c,saldoFavor:Number(c.saldoFavor||0)}));
  }
  private async cargarCambios():Promise<void>{try{const datos=await this.api.get<CambioPendiente[]>('customer-balances');this.cambiosPendientes=datos.map(x=>({...x,monto:Number(x.monto)}));}catch{this.cambiosPendientes=[];}}
  private async cargarRecargas():Promise<void>{try{const [datos,resumen]=await Promise.all([this.api.get<Recarga[]>('recharges'),this.api.get<ConciliacionRecargas>('recharges/reconciliation')]);this.recargas=datos.map(x=>({...x,monto:Number(x.monto),comision:Number(x.comision)}));this.conciliacionRecargas={...resumen,total:Number(resumen.total),comisiones:Number(resumen.comisiones),pendientes:Number(resumen.pendientes),exitosas:Number(resumen.exitosas),rechazadas:Number(resumen.rechazadas),canceladas:Number(resumen.canceladas),porCompania:resumen.porCompania.map(x=>({...x,operaciones:Number(x.operaciones),monto:Number(x.monto),comision:Number(x.comision)}))};}catch{this.recargas=[];}}
  private async obtenerVenta(id:number):Promise<VentaDetalle>{const v=await this.api.get<VentaDetalle>(`sales/${id}`);return {...v,subtotal:Number(v.subtotal),descuento:Number(v.descuento),impuestos:Number(v.impuestos),total:Number(v.total),items:v.items.map(i=>({...i,cantidad:Number(i.cantidad),precioUnitario:Number(i.precioUnitario),importe:Number(i.importe)})),pagos:v.pagos.map(p=>({...p,monto:Number(p.monto)})),fiado:v.fiado?{...v.fiado,monto:Number(v.fiado.monto),saldoPendiente:Number(v.fiado.saldoPendiente)}:null};}
  private escapar(valor:unknown):string{return String(valor??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c));}

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

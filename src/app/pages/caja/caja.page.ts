import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent,
  IonInput, IonItem, IonLabel, IonSelect, IonSelectOption,
} from '@ionic/angular/standalone';
import { BusinessApi } from '../../services/business-api';
import { Auth } from '../../services/auth';
import { BluetoothPrinterService } from '../../services/bluetooth-printer';
import { ConnectivityService } from '../../services/connectivity';
import { OfflineStorage } from '../../services/offline-storage';

interface ProductoCaja {
  id: number;
  codigo: string | null;
  nombre: string;
  stock: number;
  costo: number | null;
  precioVenta: number;
  tasaIva: number;
  activo: boolean;
  categoria?: string;
  unidadMedida?: string;
  promoTipo?: 'PORCENTAJE'|'PRECIO_ESPECIAL'|'DOS_POR_UNO'|'TRES_POR_DOS'|null;
  promoValor?: number|null;
}

interface SeccionProductosCaja {
  categoria: string;
  productos: ProductoCaja[];
}

interface ClienteCaja { id: number; nombre: string; telefono: string; activo: boolean; limiteCredito:number; adeudo:number; fiadosVencidos:number; }
interface LineaCarrito extends ProductoCaja {
  /** Cantidad normalizada: kg para granel y unidades para productos por pieza. */
  cantidad: number;
  cantidadCapturada: number;
  unidadCaptura: 'Pieza' | 'Kilogramo' | 'Gramo';
}
interface SesionCaja { id: number; estado: 'ABIERTA'; fondoInicial: number; fechaApertura: string; }
interface MovimientoCaja { id: number; compraId?:number|null; tipo: string; descripcion: string; metodo: string; monto: number; fecha: string; }

interface EstadoCaja {
  session: SesionCaja | null;
  totals: { ventas: number; efectivoEsperado: number; ventasEfectivo:number; ventasTarjeta:number; ventasTransferencia:number; ventasFiado:number;comprasCaja?:number;comprasEfectivo?:number;comprasTarjeta?:number;comprasTerminal?:number;comprasTransferencia?:number } | null;
  movements: MovimientoCaja[];
}
interface CorteCaja { sesionId?:number; fondoInicial:number; efectivoEsperado:number; efectivoContado?:number; diferencia?:number; ventasEfectivo:number; ventasTarjeta:number; ventasTransferencia:number; ventasFiado:number;comprasCaja?:number;comprasEfectivo?:number;comprasTarjeta?:number;comprasTerminal?:number;comprasTransferencia?:number; fechaCierre?:string; }
interface VentaPendiente { operacionUuid:string; payload:Record<string,unknown>; creada:string; intentos?:number; ultimoIntento?:string; ultimoError?:string; }
interface VentaResumen { id:number; folio:string; fecha:string; estado:'COMPLETADA'|'CANCELADA'|'DEVUELTA'; total:number; usuario:string; cliente:string; metodo:string; }
interface CompraCajaResumen { id:number;folio:string;fecha:string;estado:string;metodoPago:string;total:number;proveedor:string;usuario:string;montoCaja:number;pagoDetalle:string; }
interface VentaDetalle extends VentaResumen { subtotal:number; descuento:number; impuestos:number; items:Array<{nombre:string;cantidad:number;precioUnitario:number;importe:number}>; pagos:Array<{metodo:string;monto:number;referencia:string|null}>; fiado:{monto:number;saldoPendiente:number;fechaLimite:string}|null; }
interface Denominacion { valor:number; etiqueta:string; cantidad:number|null; }
interface Recarga {id:number;compania:string;telefono:string;monto:number;comision:number;estado:'PENDIENTE'|'EXITOSA'|'RECHAZADA'|'CANCELADA';folioProveedor:string|null;motivo:string|null;fecha:string;usuario:string;folioCaptura?:string;motivoCaptura?:string;validacion?:string;}
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
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(Auth);
  private readonly bluetoothPrinter = inject(BluetoothPrinterService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly offline = inject(OfflineStorage);
  readonly navigator = window.navigator;

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
  nuevoClienteCreditoVisible = false;
  guardandoClienteCredito = false;
  nuevoClienteCredito = { nombre: '', telefono: '', direccion: '', limiteCredito: null as number | null };
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
  recargaComision:number|null=0;
  recargas:Recarga[]=[];
  recargaCancelar:Recarga|null=null;
  motivoCancelacionRecarga='';
  conciliacionRecargas:ConciliacionRecargas={total:0,comisiones:0,pendientes:0,exitosas:0,rechazadas:0,canceladas:0,porCompania:[]};
  efectivoContado: number | null = null;
  observacionesCierre = '';
  movimientoTipo: 'INGRESO' | 'SALIDA' = 'SALIDA';
  movimientoMonto: number | null = null;
  movimientoDescripcion = '';
  mensaje = '';
  error = '';
  procesando = false;
  sincronizandoPendientes = false;
  ventasSuspendidas: Array<{ id: number; fecha: string; carrito: LineaCarrito[] }> = this.cargarSuspendidas();
  ventasPendientes:VentaPendiente[]=this.cargarPendientes();
  historialVentas:VentaResumen[]=[];
  historialCompras:CompraCajaResumen[]=[];
  historialVentasVisible=true;
  historialComprasVisible=true;
  movimientosTurnoVisibles=true;
  busquedaVentas='';
  ventaSeleccionada:VentaDetalle|null=null;
  motivoCancelacion='';
  confirmacionCobroVisible=false;
  readonly puedeCancelar=this.auth.obtenerRol()==='administrador'||this.auth.obtenerRol()==='gerente';
  readonly puedeAdministrarRecargas=this.puedeCancelar;
  denominaciones:Denominacion[]=[1000,500,200,100,50,20,10,5,2,1,.5].map(valor=>({valor,etiqueta:valor>=20?`Billetes de $${valor}`:`Monedas de $${valor}`,cantidad:null}));

  private productosSeccionesFuente: ProductoCaja[] | null = null;
  private productosSeccionesBusqueda = '';
  private productosSeccionesCache: SeccionProductosCaja[] = [];

  private readonly alVolverConexion = ():void => { void this.sincronizarPendientes(); };

  async ngOnInit(): Promise<void> {
    await this.cargarTodo();
    this.agregarProductoSolicitado();
    await this.sincronizarPendientes();
    window.addEventListener('online',this.alVolverConexion);
  }
  ngOnDestroy():void { window.removeEventListener('online',this.alVolverConexion); }

  get productosFiltrados(): ProductoCaja[] {
    const term = this.busqueda.trim().toLowerCase();
    return this.productos.filter((p) => p.activo && (!term || p.nombre.toLowerCase().includes(term) || p.codigo?.toLowerCase().includes(term)));
  }

  get seccionesProductos(): SeccionProductosCaja[] {
    const busqueda = this.busqueda.trim().toLowerCase();
    if (this.productosSeccionesFuente === this.productos && this.productosSeccionesBusqueda === busqueda) {
      return this.productosSeccionesCache;
    }
    const secciones = new Map<string, ProductoCaja[]>();
    for (const producto of this.productosFiltrados) {
      const categoria = producto.categoria?.trim() || 'Sin categoría';
      const productos = secciones.get(categoria) ?? [];
      productos.push(producto);
      secciones.set(categoria, productos);
    }
    this.productosSeccionesFuente = this.productos;
    this.productosSeccionesBusqueda = busqueda;
    this.productosSeccionesCache = [...secciones.entries()]
      .sort(([categoriaA], [categoriaB]) => categoriaA.localeCompare(categoriaB, 'es', { sensitivity: 'base' }))
      .map(([categoria, productos]) => ({
        categoria,
        productos: productos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })),
      }));
    return this.productosSeccionesCache;
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
  get clienteSeleccionado():ClienteCaja|undefined{return this.clientes.find(c=>c.id===Number(this.clienteId));}
  get montoFiadoActual():number{return this.metodo==='FIADO'?this.total:this.metodo==='MIXTO'?Number(this.pagoMixtoFiado||0):0;}
  get creditoDisponibleCliente():number{const cliente=this.clienteSeleccionado;if(!cliente)return 0;return Math.max(0,Number(cliente.limiteCredito)-Number(cliente.adeudo));}
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
  get etiquetaMetodoPago():string{return ({EFECTIVO:'Efectivo',TARJETA:'Terminal',TRANSFERENCIA:'Transferencia',FIADO:'Fiado',MIXTO:'Pago mixto'} as Record<string,string>)[this.metodo]??this.metodo;}

  usarEfectivo(monto: number): void { this.efectivoRecibido = monto; }
  usarMontoExacto(): void { this.efectivoRecibido = this.total; }

  abrirConfirmacionCobro():void {
    const error=this.validarCobro();
    if(error)return this.fallar(error);
    this.error='';
    this.confirmacionCobroVisible=true;
  }

  cerrarConfirmacionCobro():void {
    if(!this.procesando)this.confirmacionCobroVisible=false;
  }

  alternarNuevoClienteCredito(): void {
    this.nuevoClienteCreditoVisible = !this.nuevoClienteCreditoVisible;
    this.nuevoClienteCredito = { nombre: '', telefono: '', direccion: '', limiteCredito: null };
    this.error = '';
  }

  async guardarClienteCredito(): Promise<void> {
    const nombre = this.nuevoClienteCredito.nombre.trim();
    const telefono = this.nuevoClienteCredito.telefono.replace(/\D/g, '');
    const direccion = this.nuevoClienteCredito.direccion.trim();
    const limiteCredito = Number(this.nuevoClienteCredito.limiteCredito);
    if (nombre.length < 3) return this.fallar('Escribe el nombre completo del cliente.');
    if (!/^\d{10}$/.test(telefono)) return this.fallar('El teléfono del cliente debe tener 10 dígitos para poder enviar recordatorios.');
    if (!Number.isFinite(limiteCredito) || limiteCredito <= 0) return this.fallar('Asigna un límite de crédito mayor a cero.');
    if (limiteCredito < this.montoFiadoActual) return this.fallar(`El límite debe cubrir al menos los ${this.montoFiadoActual.toFixed(2)} de esta venta.`);
    const existente = this.clientes.find((cliente) => cliente.telefono.replace(/\D/g, '') === telefono);
    if (existente) {
      this.clienteId = existente.id;
      this.nuevoClienteCreditoVisible = false;
      this.nuevoClienteCredito = { nombre: '', telefono: '', direccion: '', limiteCredito: null };
      this.mensaje = `${existente.nombre} ya estaba registrado y quedó seleccionado.`;
      this.error = '';
      return;
    }
    this.guardandoClienteCredito = true;
    this.error = '';
    try {
      const creado = await this.api.post<{ id: number }>('clients', { nombre, telefono, direccion, limiteCredito });
      await this.cargarCatalogos();
      this.clienteId = Number(creado.id);
      this.nuevoClienteCreditoVisible = false;
      this.nuevoClienteCredito = { nombre: '', telefono: '', direccion: '', limiteCredito: null };
      this.mensaje = `${nombre} fue registrado y seleccionado para esta venta fiada.`;
    } catch {
      this.fallar('No fue posible registrar al cliente. Verifica los datos e inténtalo nuevamente.');
    } finally {
      this.guardandoClienteCredito = false;
    }
  }

  agregar(producto: ProductoCaja): void {
    if (producto.costo === null) {
      this.fallar(`${producto.nombre} tiene costo pendiente. Registra primero una compra o entrada con costo real.`);
      return;
    }
    if (producto.stock <= 0) {
      this.fallar(`${producto.nombre} está agotado. Registra una entrada desde Inventario.`);
      return;
    }
    const linea = this.carrito.find((item) => item.id === producto.id);
    if (linea) {
      const incremento = this.esVentaGranel(producto) ? .5 : 1;
      if (linea.cantidad < producto.stock) {
        linea.cantidad = Math.min(producto.stock, linea.cantidad + incremento);
        this.sincronizarCantidadCapturada(linea);
      }
    } else {
      const esGranel = this.esVentaGranel(producto);
      const cantidad = Math.min(producto.stock, esGranel ? .5 : 1);
      this.carrito = [...this.carrito, {
        ...producto,
        cantidad,
        cantidadCapturada: esGranel ? cantidad * 1000 : cantidad,
        unidadCaptura: esGranel ? 'Gramo' : 'Pieza',
      }];
    }
  }

  private agregarProductoSolicitado(): void {
    const productoId = Number(this.route.snapshot.queryParamMap.get('producto'));
    if (!Number.isInteger(productoId) || productoId <= 0) return;
    const producto = this.productos.find((item) => item.id === productoId && item.activo);
    if (!producto) {
      this.fallar('El producto seleccionado ya no está disponible en Caja.');
      return;
    }
    this.agregar(producto);
    if (producto.stock > 0) {
      this.mensaje = `${producto.nombre} se agregó a la venta actual.`;
      this.error = '';
    }
  }

  procesarCodigo(): void {
    const codigo = this.busqueda.trim().toLowerCase();
    if (!codigo) return;
    const exacto = this.productos.find((p) => p.activo && (p.codigo?.toLowerCase() === codigo || p.nombre.toLowerCase() === codigo));
    if (exacto) { this.agregar(exacto); this.busqueda = ''; this.mensaje = `${exacto.nombre} agregado.`; this.error = ''; }
    else this.fallar('Este producto no está registrado. Agrégalo primero desde Inventario.');
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
    this.carrito = venta.carrito.map((p) => {
      const unidadCaptura = p.unidadCaptura ?? (this.esVentaGranel(p) ? 'Gramo' : 'Pieza');
      return { ...p, unidadCaptura, cantidadCapturada: p.cantidadCapturada ?? (unidadCaptura === 'Gramo' ? p.cantidad * 1000 : p.cantidad) };
    });
    this.ventasSuspendidas = this.ventasSuspendidas.filter((v) => v.id !== id);
    localStorage.setItem('ventasSuspendidas', JSON.stringify(this.ventasSuspendidas));
    this.mensaje = 'Venta recuperada.';
  }
  totalSuspendida(venta: { carrito: LineaCarrito[] }): number { return venta.carrito.reduce((s, p) => s + p.precioVenta * p.cantidad * (1 + p.tasaIva / 100), 0); }

  cambiarCantidad(linea: LineaCarrito, cantidad: unknown): void {
    const nueva = Number(cantidad);
    // Ionic emite temporalmente null al editar o cambiar el selector. La línea
    // sólo se elimina con el botón "Quitar", nunca por un valor transitorio.
    if (cantidad === null || cantidad === undefined || cantidad === '' || !Number.isFinite(nueva) || nueva <= 0) {
      this.sincronizarCantidadCapturada(linea);
      return;
    }
    const normalizada = linea.unidadCaptura === 'Gramo' ? nueva / 1000 : nueva;
    linea.cantidad = Math.min(normalizada, linea.stock);
    this.sincronizarCantidadCapturada(linea);
  }

  quitar(id: number): void { this.carrito = this.carrito.filter((item) => item.id !== id); }

  cambiarUnidadCaptura(linea: LineaCarrito, unidad: 'Kilogramo'|'Gramo'): void {
    if (unidad !== 'Kilogramo' && unidad !== 'Gramo') return;
    linea.unidadCaptura = unidad;
    this.sincronizarCantidadCapturada(linea);
  }

  etiquetaCantidad(linea: LineaCarrito): string {
    if (!this.esVentaGranel(linea)) return `${linea.cantidad} pza${linea.cantidad === 1 ? '' : 's'}`;
    return linea.cantidad < 1 ? `${Math.round(linea.cantidad * 1000)} g` : `${Number(linea.cantidad.toFixed(3))} kg`;
  }

  private sincronizarCantidadCapturada(linea: LineaCarrito): void {
    linea.cantidadCapturada = linea.unidadCaptura === 'Gramo'
      ? Math.round(linea.cantidad * 1000)
      : Number(linea.cantidad.toFixed(3));
  }

  esVentaGranel(producto: ProductoCaja): boolean { return producto.unidadMedida === 'Kilogramo'; }

  async abrirCaja(): Promise<void> {
    const fondo = Number(this.fondoInicial);
    if (!Number.isFinite(fondo) || fondo < 0) return this.fallar('Ingresa un fondo inicial válido.');
    await this.ejecutar(async () => {
      try {
        await this.api.post('cash/open', { fondoInicial: fondo });
        await this.cargarEstado();
        this.mensaje = 'Caja abierta correctamente.';
      } catch (error: unknown) {
        const status = Number((error as { status?: number })?.status ?? 0);
        if (status !== 0 && navigator.onLine) throw error;
        const fechaApertura = new Date().toISOString();
        this.sesion = { id: -Date.now(), estado: 'ABIERTA', fondoInicial: fondo, fechaApertura };
        this.movimientos = [];
        this.ventasTurno = 0;
        this.efectivoEsperado = fondo;
        this.ventasPorMetodo = { EFECTIVO: 0, TARJETA: 0, TRANSFERENCIA: 0, FIADO: 0 };
        localStorage.setItem('cajaAperturaPendiente', JSON.stringify({ fondoInicial: fondo, fechaApertura }));
        this.guardarEstadoLocal();
        this.mensaje = 'Caja abierta sin conexión. Podrás vender y se sincronizará cuando regrese internet.';
      }
    });
  }

  async cobrar(): Promise<void> {
    const error=this.validarCobro();
    if(error){this.confirmacionCobroVisible=false;return this.fallar(error);}
    this.confirmacionCobroVisible=false;
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
      let venta:{id:number;folio:string;total:number};
      try{venta=await this.api.post<{id:number;folio:string;total:number}>('sales',payload);}catch(e:unknown){const x=e as{status?:number};if(x.status===0||!navigator.onLine){
        const productosVendidos=this.carrito.map(item=>({id:item.id,cantidad:item.cantidad}));
        const totalLocal=this.total;
        const metodoLocal=this.metodo;
        this.ventasPendientes=[...this.ventasPendientes,{operacionUuid,payload,creada:new Date().toISOString(),intentos:0}];
        this.guardarPendientes();
        this.aplicarVentaLocal(productosVendidos,totalLocal,metodoLocal);
        this.limpiarCobro();
        this.mensaje=`Venta guardada sin conexión por $${totalLocal.toFixed(2)}. Se sincronizará automáticamente.`;
        return;
      }throw e;}
      const cambio = this.cambio;
      this.mensaje = `Venta ${venta.folio} registrada por $${Number(venta.total).toFixed(2)}${cambio ? `; cambio $${cambio.toFixed(2)}` : ''}.`;
      await this.imprimirTicket(venta.id,cambio);
      this.limpiarCobro();
      await this.cargarTodo();
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
  async resolverRecarga(item:Recarga,estado:'EXITOSA'|'RECHAZADA'):Promise<void>{const folio=String(item.folioCaptura||'').trim(),motivo=String(item.motivoCaptura||'').trim();item.validacion='';if(estado==='EXITOSA'&&!folio){item.validacion='Captura el folio entregado por el proveedor para confirmar.';return;}if(estado==='RECHAZADA'&&motivo.length<4){item.validacion='Escribe un motivo de al menos 4 caracteres para rechazarla.';return;}await this.ejecutar(async()=>{await this.api.patch(`recharges/${item.id}/resolve`,{estado,folioProveedor:folio,motivo});const comprobante:Recarga={...item,estado,folioProveedor:folio||null};await Promise.all([this.cargarRecargas(),this.cargarEstado()]);this.mensaje=`Recarga marcada como ${estado.toLowerCase()}.`;if(estado==='EXITOSA')await this.imprimirTicketRecarga(comprobante);});}
  cancelarRecarga(item:Recarga):void{this.recargaCancelar=item;this.motivoCancelacionRecarga='';this.error='';}
  cerrarCancelacionRecarga():void{if(this.procesando)return;this.recargaCancelar=null;this.motivoCancelacionRecarga='';}
  async confirmarCancelacionRecarga():Promise<void>{const item=this.recargaCancelar,motivo=this.motivoCancelacionRecarga.trim();if(!item||motivo.length<5)return this.fallar('El motivo debe tener al menos 5 caracteres.');await this.ejecutar(async()=>{await this.api.post(`recharges/${item.id}/cancel`,{motivo});this.recargaCancelar=null;this.motivoCancelacionRecarga='';await Promise.all([this.cargarRecargas(),this.cargarEstado()]);this.mensaje='Recarga cancelada y reembolso registrado en caja.';});}

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
  async cargarHistorialCompras():Promise<void>{try{const datos=await this.api.get<CompraCajaResumen[]>('cash/purchase-history');this.historialCompras=datos.map(c=>({...c,total:Number(c.total),montoCaja:Number(c.montoCaja)}));}catch{this.historialCompras=[];}}
  async verVenta(id:number):Promise<void>{await this.ejecutar(async()=>{this.ventaSeleccionada=await this.obtenerVenta(id);});}
  cerrarDetalleVenta():void{this.ventaSeleccionada=null;this.motivoCancelacion='';}
  async cancelarVenta():Promise<void>{if(!this.ventaSeleccionada)return;const motivo=this.motivoCancelacion.trim();if(motivo.length<5)return this.fallar('Escribe un motivo de cancelación de al menos 5 caracteres.');await this.ejecutar(async()=>{await this.api.post(`sales/${this.ventaSeleccionada!.id}/cancel`,{motivo});this.cerrarDetalleVenta();await Promise.all([this.cargarHistorial(),this.cargarTodo()]);this.mensaje='Venta cancelada, inventario y caja actualizados.';});}
  async imprimirTicket(id:number,cambio=0):Promise<void>{
    const venta=await this.obtenerVenta(id);
    if (this.bluetoothPrinter.disponible) {
      try {
        const impresora = await this.bluetoothPrinter.imprimir(this.construirTicketBluetooth(venta, cambio));
        this.mensaje = `${this.mensaje} Ticket impreso en ${impresora}.`.trim();
      } catch (error: unknown) {
        const detalle = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? '');
        this.error = `La venta quedó registrada, pero el ticket no se imprimió. ${detalle || 'Revisa que “Bluetooth Printer” esté encendida y emparejada.'}`;
      }
      return;
    }
    const w=window.open('','_blank','width=420,height=720');
    if(!w){this.error='Permite ventanas emergentes para imprimir el ticket.';return;}
    const dinero=(n:number)=>`$${Number(n).toFixed(2)}`;
    const logo=`${window.location.origin}/assets/logo-pedernal.png`;
    const filas=venta.items.map(i=>`<tr><td>${i.cantidad} × ${this.escapar(i.nombre)}</td><td>${dinero(i.importe)}</td></tr>`).join('');
    const pagos=venta.pagos.map(p=>`<tr><td>${this.escapar(p.metodo==='TARJETA'?'TERMINAL / TARJETA':p.metodo)}</td><td>${dinero(p.monto)}</td></tr>`).join('');
    const credito=venta.fiado?`<section class="credit"><b>VENTA A FIADO</b><div>Cliente: ${this.escapar(venta.cliente)}</div><div>Monto fiado: ${dinero(venta.fiado.monto)}</div><div>Total que debe: ${dinero(venta.fiado.saldoPendiente)}</div><div>Vence: ${new Date(`${venta.fiado.fechaLimite}T00:00:00`).toLocaleDateString('es-MX')}</div></section>`:'';
    w.document.write(`<html><head><title>${this.escapar(venta.folio)}</title><style>body{font:13px monospace;width:300px;margin:18px auto;color:#111}h2,p{text-align:center;margin:6px}table{width:100%;border-collapse:collapse;margin:10px 0}td{padding:5px 0;border-bottom:1px dashed #bbb}td:last-child{text-align:right}.total{font-size:17px;font-weight:bold}.credit{border:2px solid #111;padding:10px;margin-top:12px}.credit b{display:block;text-align:center;margin-bottom:8px}.credit div{padding:3px 0}small{display:block;text-align:center;margin-top:16px}.ticket-logo{display:block;max-width:130px;max-height:90px;object-fit:contain;margin:14px auto 0;filter:grayscale(1) contrast(1.35)}@media print{.ticket-logo{filter:grayscale(1) contrast(1.5)}}</style></head><body><h2>Abarrotes El Pedernal</h2><p>${this.escapar(venta.folio)}<br>${new Date(venta.fecha).toLocaleString('es-MX')}<br>Atendió: ${this.escapar(venta.usuario)}</p><table>${filas}</table><table><tr><td>Subtotal</td><td>${dinero(venta.subtotal)}</td></tr>${venta.descuento?`<tr><td>Descuento</td><td>-${dinero(venta.descuento)}</td></tr>`:''}<tr><td>IVA</td><td>${dinero(venta.impuestos)}</td></tr><tr class="total"><td>Total</td><td>${dinero(venta.total)}</td></tr>${pagos}${cambio?`<tr><td>Cambio</td><td>${dinero(cambio)}</td></tr>`:''}</table>${credito}<small>Gracias por su compra</small><img class="ticket-logo" src="${this.escapar(logo)}" alt="Abarrotes El Pedernal"><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();
  }

  async imprimirTicketRecarga(recarga:Recarga):Promise<void>{
    if(recarga.estado!=='EXITOSA')return;
    const texto=this.construirTicketRecargaBluetooth(recarga);
    if(this.bluetoothPrinter.disponible){
      try{
        const impresora=await this.bluetoothPrinter.imprimir(texto);
        this.mensaje=`${this.mensaje} Ticket de recarga impreso en ${impresora}.`.trim();
      }catch(error:unknown){
        const detalle=error instanceof Error?error.message:String((error as{message?:string})?.message??'');
        this.error=`La recarga quedó confirmada, pero el ticket no se imprimió. ${detalle||'Revisa que “Bluetooth Printer” esté encendida y emparejada.'}`;
      }
      return;
    }
    const w=window.open('','_blank','width=420,height=620');
    if(!w){this.error='La recarga quedó confirmada. Permite ventanas emergentes para imprimir su ticket.';return;}
    const dinero=(n:number)=>`$${Number(n).toFixed(2)}`;
    const logo=`${window.location.origin}/assets/logo-pedernal.png`;
    w.document.write(`<html><head><title>Recarga ${this.escapar(recarga.folioProveedor||String(recarga.id))}</title><style>body{font:13px monospace;width:300px;margin:18px auto;color:#111}h2,h3,p{text-align:center;margin:6px}.divider{border-top:1px dashed #777;margin:14px 0}table{width:100%;border-collapse:collapse}td{padding:6px 0;border-bottom:1px dashed #bbb}td:last-child{text-align:right;font-weight:bold}.total{font-size:18px}.phone{font-size:21px;font-weight:bold;letter-spacing:1px}.ticket-logo{display:block;max-width:130px;max-height:90px;object-fit:contain;margin:16px auto 0;filter:grayscale(1) contrast(1.35)}</style></head><body><h2>Abarrotes El Pedernal</h2><h3>COMPROBANTE DE RECARGA</h3><p>${new Date(recarga.fecha).toLocaleString('es-MX')}<br>Atendió: ${this.escapar(recarga.usuario)}</p><div class="divider"></div><p>${this.escapar(recarga.compania)}</p><p class="phone">${this.escapar(recarga.telefono)}</p><table><tr class="total"><td>Monto</td><td>${dinero(recarga.monto)}</td></tr><tr><td>Comisión</td><td>${dinero(recarga.comision)}</td></tr><tr><td>Folio</td><td>${this.escapar(recarga.folioProveedor||'Sin folio')}</td></tr><tr><td>Estado</td><td>EXITOSA</td></tr></table><p class="divider">Conserva este comprobante</p><img class="ticket-logo" src="${this.escapar(logo)}" alt="Abarrotes El Pedernal"><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();
  }

  private construirTicketRecargaBluetooth(recarga:Recarga):string{
    const ancho=32;
    const centro=(texto:string)=>{const limpio=texto.slice(0,ancho);return ' '.repeat(Math.max(0,Math.floor((ancho-limpio.length)/2)))+limpio;};
    const fila=(etiqueta:string,valor:string)=>{const derecha=valor.slice(0,18);const izquierda=etiqueta.slice(0,Math.max(1,ancho-derecha.length-1));return izquierda+' '.repeat(Math.max(1,ancho-izquierda.length-derecha.length))+derecha;};
    const dinero=(n:number)=>`$${Number(n).toFixed(2)}`;
    return [centro('ABARROTES EL PEDERNAL'),centro('COMPROBANTE DE RECARGA'),'-'.repeat(ancho),centro(recarga.compania),centro(recarga.telefono),'-'.repeat(ancho),fila('Monto',dinero(recarga.monto)),fila('Comision',dinero(recarga.comision)),fila('Folio',recarga.folioProveedor||'Sin folio'),fila('Estado','EXITOSA'),'-'.repeat(ancho),new Date(recarga.fecha).toLocaleString('es-MX'),`Atendio: ${recarga.usuario}`.slice(0,ancho),centro('Conserva este comprobante')].join('\n');
  }

  private construirTicketBluetooth(venta:VentaDetalle,cambio:number):string {
    const ancho=32;
    const centro=(texto:string)=>{const limpio=texto.slice(0,ancho);return ' '.repeat(Math.max(0,Math.floor((ancho-limpio.length)/2)))+limpio;};
    const fila=(etiqueta:string,valor:string)=>{const derecha=valor.slice(0,12);const izquierda=etiqueta.slice(0,Math.max(1,ancho-derecha.length-1));return izquierda+' '.repeat(Math.max(1,ancho-izquierda.length-derecha.length))+derecha;};
    const dinero=(n:number)=>`$${Number(n).toFixed(2)}`;
    const lineas=[
      centro('ABARROTES EL PEDERNAL'),
      centro(venta.folio),
      centro(new Date(venta.fecha).toLocaleString('es-MX')),
      centro(`Atendio: ${venta.usuario}`),
      '-'.repeat(ancho),
      ...venta.items.reduce<string[]>((resultado,item)=>[
        ...resultado,
        `${item.cantidad} x ${item.nombre}`.slice(0,ancho),
        fila('',dinero(item.importe)),
      ],[]),
      '-'.repeat(ancho),
      fila('Subtotal',dinero(venta.subtotal)),
      ...(venta.descuento?[fila('Descuento',`-${dinero(venta.descuento)}`)]:[]),
      fila('IVA',dinero(venta.impuestos)),
      fila('TOTAL',dinero(venta.total)),
      ...venta.pagos.map(p=>fila(p.metodo==='TARJETA'?'TARJETA':p.metodo,dinero(p.monto))),
      ...(cambio?[fila('Cambio',dinero(cambio))]:[]),
    ];
    if(venta.fiado)lineas.push('-'.repeat(ancho),centro('VENTA A FIADO'),`Cliente: ${venta.cliente}`.slice(0,ancho),fila('Monto fiado',dinero(venta.fiado.monto)),fila('Total que debe',dinero(venta.fiado.saldoPendiente)),`Vence: ${new Date(`${venta.fiado.fechaLimite}T00:00:00`).toLocaleDateString('es-MX')}`);
    lineas.push('-'.repeat(ancho),centro('Gracias por su compra'));
    return lineas.join('\n');
  }

  imprimirCorteX(): void {
    if (!this.sesion) return;
    const compras=this.movimientos.filter(m=>m.tipo==='SALIDA'&&m.metodo==='EFECTIVO'&&m.descripcion.startsWith('Pago a proveedor'));
    const suma=(metodo?:string)=>compras.filter(m=>!metodo||m.metodo===metodo).reduce((total,m)=>total+Number(m.monto),0);
    this.imprimirCorte({ fondoInicial:this.sesion.fondoInicial,efectivoEsperado:this.efectivoEsperado,ventasEfectivo:this.ventasPorMetodo.EFECTIVO,ventasTarjeta:this.ventasPorMetodo.TARJETA,ventasTransferencia:this.ventasPorMetodo.TRANSFERENCIA,ventasFiado:this.ventasPorMetodo.FIADO,comprasCaja:suma(),comprasEfectivo:suma('EFECTIVO'),comprasTarjeta:suma('TARJETA'),comprasTerminal:suma('TERMINAL'),comprasTransferencia:suma('TRANSFERENCIA') }, 'X');
  }

  private async imprimirCorte(c:CorteCaja,tipo:'X'|'Z'):Promise<void> {
    if(this.bluetoothPrinter.disponible){
      try{
        const impresora=await this.bluetoothPrinter.imprimir(this.construirCorteBluetooth(c,tipo));
        this.mensaje=`${this.mensaje} Corte ${tipo} impreso como ticket en ${impresora}.`.trim();
      }catch(error:unknown){
        const detalle=error instanceof Error?error.message:String((error as{message?:string})?.message??'');
        this.error=`No se pudo imprimir el Corte ${tipo}. ${detalle||'Revisa que “Bluetooth Printer” esté encendida y emparejada.'}`;
      }
      return;
    }
    const w=window.open('','_blank','width=400,height=700'); if(!w){this.error='Permite ventanas emergentes para imprimir el corte.';return;}
    const row=(label:string,value:number|undefined)=>`<tr><td>${label}</td><td>$${Number(value??0).toFixed(2)}</td></tr>`;
    w.document.write(`<html><head><title>Corte ${tipo}</title><style>@page{size:80mm auto;margin:0}*{box-sizing:border-box}html,body{width:80mm;margin:0;padding:0}body{padding:4mm;font:12px/1.25 monospace;color:#000}h2{font-size:16px;margin:0 0 3px;text-align:center}p{text-align:center;margin:5px 0 10px}table{width:100%;border-collapse:collapse}td{padding:3px 0;vertical-align:top}td:first-child{padding-right:5px}td:last-child{text-align:right;white-space:nowrap}.footer{margin-top:10px;border-top:1px dashed #000;padding-top:8px}@media print{html,body{width:80mm}body{padding:3mm}}</style></head><body><h2>Abarrotes El Pedernal</h2><p>CORTE ${tipo}<br>${new Date(c.fechaCierre??Date.now()).toLocaleString('es-MX')}</p><table>${row('Fondo inicial',c.fondoInicial)}${row('Ventas efectivo',c.ventasEfectivo)}${row('Ventas tarjeta',c.ventasTarjeta)}${row('Transferencias',c.ventasTransferencia)}${row('Fiado',c.ventasFiado)}${row('Compras desde caja',-(c.comprasCaja??0))}${row('  Efectivo',-(c.comprasEfectivo??0))}${row('  Tarjeta',-(c.comprasTarjeta??0))}${row('  Terminal',-(c.comprasTerminal??0))}${row('  Transferencia',-(c.comprasTransferencia??0))}${row('Efectivo esperado',c.efectivoEsperado)}${tipo==='Z'?row('Efectivo contado',c.efectivoContado)+row('Diferencia',c.diferencia):''}</table><p class="footer">${tipo==='X'?'Corte informativo<br>La caja continúa abierta.':'Corte definitivo de cierre.'}</p><script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}<\/script></body></html>`);w.document.close();
  }

  private construirCorteBluetooth(c:CorteCaja,tipo:'X'|'Z'):string{
    const ancho=32;
    const centro=(texto:string)=>{const limpio=texto.slice(0,ancho);return ' '.repeat(Math.max(0,Math.floor((ancho-limpio.length)/2)))+limpio;};
    const dinero=(valor:number|undefined)=>`$${Number(valor??0).toFixed(2)}`;
    const fila=(etiqueta:string,valor:number|undefined)=>{const derecha=dinero(valor);const izquierda=etiqueta.slice(0,Math.max(1,ancho-derecha.length-1));return izquierda+' '.repeat(Math.max(1,ancho-izquierda.length-derecha.length))+derecha;};
    const lineas=[
      centro('ABARROTES EL PEDERNAL'),centro(`CORTE ${tipo}`),centro(new Date(c.fechaCierre??Date.now()).toLocaleString('es-MX')),
      '-'.repeat(ancho),fila('Fondo inicial',c.fondoInicial),fila('Ventas efectivo',c.ventasEfectivo),fila('Ventas tarjeta',c.ventasTarjeta),fila('Transferencias',c.ventasTransferencia),fila('Fiado',c.ventasFiado),
      '-'.repeat(ancho),fila('Compras desde caja',-(c.comprasCaja??0)),fila('  Efectivo',-(c.comprasEfectivo??0)),fila('  Tarjeta',-(c.comprasTarjeta??0)),fila('  Terminal',-(c.comprasTerminal??0)),fila('  Transferencia',-(c.comprasTransferencia??0)),
      '-'.repeat(ancho),fila('Efectivo esperado',c.efectivoEsperado),
    ];
    if(tipo==='Z')lineas.push(fila('Efectivo contado',c.efectivoContado),fila('Diferencia',c.diferencia));
    lineas.push('-'.repeat(ancho),centro(tipo==='X'?'CAJA CONTINUA ABIERTA':'CIERRE DEFINITIVO'),'\n\n');
    return lineas.join('\n');
  }

  private async cargarTodo(): Promise<void> {
    const resultados = await Promise.allSettled([this.cargarEstado(), this.cargarCatalogos(),this.cargarHistorial(),this.cargarHistorialCompras(),this.cargarRecargas()]);
    if (resultados[0].status === 'rejected' || resultados[1].status === 'rejected') {
      this.error = 'Conéctate una vez para descargar productos y abrir la caja en esta tablet.';
    }
  }

  private async cargarCatalogos(): Promise<void> {
    const [productos, clientes] = await Promise.all([
      this.api.get<ProductoCaja[]>('products'),
      this.api.get<ClienteCaja[]>('clients'),
    ]);
    this.productos = productos.map((p) => ({ ...p, stock: Number(p.stock), costo:p.costo===null?null:Number(p.costo), precioVenta: Number(p.precioVenta), tasaIva: Number(p.tasaIva),promoValor:p.promoValor===null?null:Number(p.promoValor) }));
    this.clientes = clientes
      .filter((c) => c.activo)
      .map(c=>({...c,limiteCredito:Number(c.limiteCredito||0),adeudo:Number(c.adeudo||0),fiadosVencidos:Number(c.fiadosVencidos||0)}))
      .sort((a,b)=>a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'}));
  }
  private async cargarRecargas():Promise<void>{try{const [datos,resumen]=await Promise.all([this.api.get<Recarga[]>('recharges'),this.api.get<ConciliacionRecargas>('recharges/reconciliation')]);this.recargas=datos.map(x=>({...x,monto:Number(x.monto),comision:Number(x.comision)}));this.conciliacionRecargas={...resumen,total:Number(resumen.total),comisiones:Number(resumen.comisiones),pendientes:Number(resumen.pendientes),exitosas:Number(resumen.exitosas),rechazadas:Number(resumen.rechazadas),canceladas:Number(resumen.canceladas),porCompania:resumen.porCompania.map(x=>({...x,operaciones:Number(x.operaciones),monto:Number(x.monto),comision:Number(x.comision)}))};}catch{this.recargas=[];}}
  private async obtenerVenta(id:number):Promise<VentaDetalle>{const v=await this.api.get<VentaDetalle>(`sales/${id}`);return {...v,subtotal:Number(v.subtotal),descuento:Number(v.descuento),impuestos:Number(v.impuestos),total:Number(v.total),items:v.items.map(i=>({...i,cantidad:Number(i.cantidad),precioUnitario:Number(i.precioUnitario),importe:Number(i.importe)})),pagos:v.pagos.map(p=>({...p,monto:Number(p.monto)})),fiado:v.fiado?{...v.fiado,monto:Number(v.fiado.monto),saldoPendiente:Number(v.fiado.saldoPendiente)}:null};}
  private escapar(valor:unknown):string{return String(valor??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c));}

  private validarCobro():string|null {
    if(!this.sesion)return 'Abre la caja antes de cobrar.';
    if(!this.carrito.length)return 'Agrega al menos un producto.';
    if(this.metodo==='FIADO'&&!this.clienteId)return 'Selecciona un cliente para el fiado.';
    if(this.metodo==='MIXTO'&&Number(this.pagoMixtoFiado||0)>0&&!this.clienteId)return 'Selecciona un cliente para la parte a fiado.';
    if(this.montoFiadoActual>0&&Number(this.clienteSeleccionado?.fiadosVencidos||0)>0)return 'El cliente tiene pagos atrasados y no puede recibir otro fiado.';
    if(this.montoFiadoActual>0&&Number(this.clienteSeleccionado?.limiteCredito||0)>0&&this.creditoDisponibleCliente<this.montoFiadoActual)return 'El crédito disponible del cliente no alcanza para esta venta.';
    if(['TARJETA','TRANSFERENCIA'].includes(this.metodo)&&!this.referencia.trim())return 'Captura la referencia del pago.';
    if(this.metodo==='EFECTIVO'&&Number(this.efectivoRecibido)<this.total)return 'El efectivo recibido es menor al total.';
    if(this.metodo==='MIXTO'&&Math.abs(this.diferenciaPagoMixto)>.009)return 'La suma del pago mixto debe coincidir con el total.';
    return null;
  }

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
  async sincronizarPendientes():Promise<void>{
    if(this.sincronizandoPendientes||!this.ventasPendientes.length)return;
    this.sincronizandoPendientes=true;
    try{
      if(!await this.connectivity.checkNow())return;
      await this.asegurarCajaServidor();
      for(const pendiente of [...this.ventasPendientes]){
        pendiente.intentos=Number(pendiente.intentos||0)+1;
        pendiente.ultimoIntento=new Date().toISOString();
        pendiente.ultimoError='';
        this.guardarPendientes();
        try{
          await this.api.post('sales',pendiente.payload);
          this.ventasPendientes=this.ventasPendientes.filter(v=>v.operacionUuid!==pendiente.operacionUuid);
          this.guardarPendientes();
        }catch(error:unknown){
          const respuesta=error as{error?:{error?:string};message?:string};
          pendiente.ultimoError=respuesta.error?.error||respuesta.message||'El servidor rechazó la sincronización.';
          this.guardarPendientes();
          break;
        }
      }
      if(!this.ventasPendientes.length){
        localStorage.removeItem('cajaAperturaPendiente');
        this.mensaje='Todas las ventas pendientes se sincronizaron correctamente.';
        await this.cargarTodo();
      }
    }finally{this.sincronizandoPendientes=false;}
  }
  private guardarPendientes():void{localStorage.setItem('ventasPendientesSync',JSON.stringify(this.ventasPendientes));}

  private async asegurarCajaServidor(): Promise<void> {
    const aperturaRaw = localStorage.getItem('cajaAperturaPendiente');
    if (!aperturaRaw) return;
    const apertura = JSON.parse(aperturaRaw) as { fondoInicial: number };
    const estado = await this.api.get<EstadoCaja>('cash/current');
    if (!estado.session) await this.api.post('cash/open', { fondoInicial: Number(apertura.fondoInicial) });
  }

  private aplicarVentaLocal(productosVendidos:Array<{id:number;cantidad:number}>,total:number,metodo:string):void {
    for (const vendido of productosVendidos) {
      const producto = this.productos.find(item => item.id === vendido.id);
      if (producto) producto.stock = Math.max(0, Number(producto.stock) - vendido.cantidad);
    }
    this.offline.saveCache('products', this.productos);
    this.ventasTurno = Math.round((this.ventasTurno + total) * 100) / 100;
    if (metodo in this.ventasPorMetodo) {
      const key = metodo as keyof typeof this.ventasPorMetodo;
      this.ventasPorMetodo[key] = Math.round((this.ventasPorMetodo[key] + total) * 100) / 100;
    }
    if (metodo === 'EFECTIVO') this.efectivoEsperado = Math.round((this.efectivoEsperado + total) * 100) / 100;
    this.guardarEstadoLocal();
  }

  private guardarEstadoLocal():void {
    const estado:EstadoCaja = {
      session: this.sesion,
      totals: this.sesion ? {
        ventas: this.ventasTurno,
        efectivoEsperado: this.efectivoEsperado,
        ventasEfectivo: this.ventasPorMetodo.EFECTIVO,
        ventasTarjeta: this.ventasPorMetodo.TARJETA,
        ventasTransferencia: this.ventasPorMetodo.TRANSFERENCIA,
        ventasFiado: this.ventasPorMetodo.FIADO,
      } : null,
      movements: this.movimientos,
    };
    this.offline.saveCache('cash/current', estado);
  }

  private limpiarCobro():void {
    this.carrito = [];
    this.referencia = '';
    this.clienteId = null;
    this.efectivoRecibido = null;
    this.pagoMixtoEfectivo = null;
    this.pagoMixtoTarjeta = null;
    this.pagoMixtoTransferencia = null;
    this.pagoMixtoFiado = null;
  }
}

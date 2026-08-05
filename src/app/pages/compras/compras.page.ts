import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import { BusinessApi } from '../../services/business-api';

interface Proveedor { id: number; empresa: string; estado: string; }
interface Producto { id: number; nombre: string; codigo: string | null; costo: number; tasaIva:number; proveedorId:number|null; proveedor:string|null; }
interface Partida { productoId: number | null; cantidad: number | null; costoUnitario: number | null; lote: string; fechaCaducidad: string; }
interface Compra { id: number; folio: string; fecha: string; proveedor: string; estado: string; metodoPago: string; pagoDetalle:string; total: number; saldoPendiente: number; }
interface Sugerencia { productoId:number; nombre:string; stock:number; minimo:number; cantidadSugerida:number; costo:number; proveedorId:number|null; proveedor:string|null; }

@Component({ selector: 'app-compras', templateUrl: './compras.page.html', styleUrls: ['./compras.page.scss'], standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem, IonLabel, IonInput, IonSelect, IonSelectOption, IonButton] })
export class ComprasPage implements OnInit {
  private readonly api = inject(BusinessApi);
  proveedores: Proveedor[] = []; productos: Producto[] = []; compras: Compra[] = []; sugerencias:Sugerencia[]=[];
  proveedorId: number | null = null; folio = ''; metodoPago = 'CREDITO'; notas = '';
  efectivoCompra:number|null=null; tarjetaCompra:number|null=null; terminalCompra:number|null=null; transferenciaCompra:number|null=null;
  origenPago:'CAJA'|'EXTERNO'='CAJA';origenEfectivo:'CAJA'|'EXTERNO'='CAJA';origenTarjeta:'CAJA'|'EXTERNO'='EXTERNO';origenTerminal:'CAJA'|'EXTERNO'='CAJA';origenTransferencia:'CAJA'|'EXTERNO'='EXTERNO';
  partidas: Partida[] = [this.nuevaPartida()]; mensaje = ''; error = ''; guardando = false;
  confirmacionVisible = false;

  async ngOnInit(): Promise<void> { await this.cargar(); }
  get subtotal(): number { return this.partidas.reduce((s, p) => s + Number(p.cantidad || 0) * Number(p.costoUnitario || 0), 0); }
  get impuestos():number{return this.partidas.reduce((s,p)=>{const producto=this.productos.find(x=>x.id===Number(p.productoId));return s+Number(p.cantidad||0)*Number(p.costoUnitario||0)*Number(producto?.tasaIva||0)/100;},0);}
  get totalCompra():number{return Math.round((this.subtotal+this.impuestos)*100)/100;}
  get totalPagoMixto():number{return Number(this.efectivoCompra||0)+Number(this.tarjetaCompra||0)+Number(this.terminalCompra||0)+Number(this.transferenciaCompra||0);}
  get proveedorSeleccionado():Proveedor|undefined{return this.proveedores.find(item=>item.id===Number(this.proveedorId));}
  get productosDelProveedor():Producto[]{
    const proveedor=this.proveedorSeleccionado;if(!proveedor)return[];
    const empresa=proveedor.empresa.toLowerCase();let patron:RegExp|null=null;
    if(/sabritas|pepsico/.test(empresa))patron=/sabritas|doritos|cheetos|ruffles|tostitos|fritos|churrumais|rancheritos|sabritones|crujitos/i;
    else if(/bimbo/.test(empresa))patron=/bimbo|tía rosa|tortillinas/i;
    else if(/lala/.test(empresa))patron=/lala/i;
    else if(/coca.?cola/.test(empresa))patron=/coca.?cola|ciel|del valle|fanta|sprite|fresca/i;
    return this.productos.filter(producto=>producto.proveedorId===proveedor.id||!!patron&&patron.test(producto.nombre)).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'}));
  }
  get productosElegidos():Array<{producto:Producto;partida:Partida;importe:number}>{
    return this.partidas.map(partida=>{const producto=this.productos.find(item=>item.id===Number(partida.productoId));return producto?{producto,partida,importe:Number(partida.cantidad||0)*Number(partida.costoUnitario||0)*(1+Number(producto.tasaIva||0)/100)}:null;}).filter((item):item is {producto:Producto;partida:Partida;importe:number}=>item!==null);
  }
  agregarPartida(): void { this.partidas = [...this.partidas, this.nuevaPartida()]; }
  cambiarProveedor():void{this.partidas=[this.nuevaPartida()];this.mensaje='Selecciona los productos que llegaron de este proveedor.';this.error='';}
  cambiarMetodoPago():void{this.origenPago=this.metodoPago==='EFECTIVO'||this.metodoPago==='TERMINAL'?'CAJA':'EXTERNO';}
  agregarProductoProveedor(producto:Producto):void{
    if(this.partidas.some(partida=>Number(partida.productoId)===producto.id)){this.error=`${producto.nombre} ya está agregado a esta compra.`;return;}
    const nueva={productoId:producto.id,cantidad:1,costoUnitario:producto.costo,lote:'',fechaCaducidad:''};
    this.partidas=[...this.partidas.filter(partida=>partida.productoId),nueva];this.error='';this.mensaje=`${producto.nombre} agregado. Captura la cantidad recibida.`;
  }
  quitarPartida(index: number): void { this.partidas = this.partidas.filter((_, i) => i !== index); if (!this.partidas.length) this.agregarPartida(); }
  seleccionarProducto(partida: Partida): void { const p = this.productos.find((item) => item.id === Number(partida.productoId)); if (p && partida.costoUnitario === null) partida.costoUnitario = p.costo; }
  usarSugerencia(s:Sugerencia):void{const cambiaProveedor=!!s.proveedorId&&Number(this.proveedorId)!==Number(s.proveedorId);if(s.proveedorId)this.proveedorId=Number(s.proveedorId);const existentes=cambiaProveedor?[]:this.partidas.filter(p=>p.productoId&&Number(p.productoId)!==Number(s.productoId));this.partidas=[...existentes,{productoId:Number(s.productoId),cantidad:Number(s.cantidadSugerida),costoUnitario:Number(s.costo),lote:'',fechaCaducidad:''}];this.mensaje=`${s.nombre} agregado a la compra sugerida.`;}

  abrirConfirmacion():void{const error=this.validarCompra();if(error){this.error=error;this.confirmacionVisible=false;return;}this.error='';this.confirmacionVisible=true;}
  cerrarConfirmacion():void{if(!this.guardando)this.confirmacionVisible=false;}

  async guardar(): Promise<void> {
    this.error = ''; this.mensaje = '';
    const validacion=this.validarCompra();if(validacion){this.error=validacion;this.confirmacionVisible=false;return;}
    this.confirmacionVisible=false;
    this.guardando = true;
    try {
      const pagos=this.metodoPago==='MIXTO'?[{metodo:'EFECTIVO',monto:Number(this.efectivoCompra||0),origen:this.origenEfectivo},{metodo:'TARJETA',monto:Number(this.tarjetaCompra||0),origen:this.origenTarjeta},{metodo:'TERMINAL',monto:Number(this.terminalCompra||0),origen:this.origenTerminal},{metodo:'TRANSFERENCIA',monto:Number(this.transferenciaCompra||0),origen:this.origenTransferencia}]:this.metodoPago==='CREDITO'?[]:[{metodo:this.metodoPago,monto:this.totalCompra,origen:this.origenPago}];
      const montoCajaEsperado=pagos.filter(p=>p.origen==='CAJA').reduce((s,p)=>s+Number(p.monto),0);
      const result = await this.api.post<{ folio: string; total: number;cajaDescontada:number }>('purchases', { proveedorId: this.proveedorId, folio: this.folio, metodoPago: this.metodoPago, origenPago:this.origenPago, montoCajaEsperado, notas: this.notas, items: this.partidas,pagos });
      if(Math.abs(Number(result.cajaDescontada)-montoCajaEsperado)>.009)throw new Error('La compra se recibió, pero la salida de caja no coincide. No hagas otra captura y repórtala para corregirla.');
      this.mensaje = `Compra ${result.folio} recibida por $${Number(result.total).toFixed(2)}. Inventario actualizado.${Number(result.cajaDescontada)>0?` Se descontaron $${Number(result.cajaDescontada).toFixed(2)} de caja.`:' No se descontó dinero de caja.'}`;
      this.proveedorId = null; this.folio = ''; this.notas = ''; this.partidas = [this.nuevaPartida()];this.efectivoCompra=null;this.tarjetaCompra=null;this.terminalCompra=null;this.transferenciaCompra=null;this.origenPago='CAJA'; await this.cargar();
    } catch (e: unknown) { const x = e as { message?:string;error?: { error?: { error?: string } } }; this.error = x.error?.error?.error ?? x.message ?? 'No fue posible registrar la compra.'; }
    finally { this.guardando = false; }
  }

  private nuevaPartida(): Partida { return { productoId: null, cantidad: 1, costoUnitario: null, lote: '', fechaCaducidad: '' }; }
  private validarCompra():string|null{
    if(!this.proveedorId||this.partidas.some(p=>!p.productoId||Number(p.cantidad)<=0||Number(p.costoUnitario)<0))return 'Completa proveedor, productos, cantidades y costos.';
    const ids=this.partidas.map(p=>Number(p.productoId));if(new Set(ids).size!==ids.length)return 'Un producto está repetido. Conserva una sola partida y suma su cantidad.';
    if(this.metodoPago==='MIXTO'&&Math.abs(this.totalPagoMixto-this.totalCompra)>.009)return `El pago mixto debe sumar $${this.totalCompra.toFixed(2)}.`;
    if(this.partidas.some(p=>!!p.fechaCaducidad&&!p.lote.trim()))return 'Captura el lote de cada producto que tenga fecha de caducidad.';
    return null;
  }
  private async cargar(): Promise<void> {
    try {
      const [providers, products, purchases,suggestions] = await Promise.all([this.api.get<Proveedor[]>('providers'), this.api.get<Producto[]>('products'), this.api.get<Compra[]>('purchases'),this.api.get<Sugerencia[]>('purchase-suggestions')]);
      this.proveedores = providers.filter((p) => p.estado === 'ACTIVO');
      this.productos = products.map((p) => ({ ...p, costo: Number(p.costo),tasaIva:Number(p.tasaIva||0),proveedorId:p.proveedorId?Number(p.proveedorId):null,proveedor:p.proveedor??null }));
      this.compras = purchases.map((p) => ({ ...p, total: Number(p.total), saldoPendiente: Number(p.saldoPendiente) }));
      this.sugerencias=suggestions.map(s=>({...s,stock:Number(s.stock),minimo:Number(s.minimo),cantidadSugerida:Number(s.cantidadSugerida),costo:Number(s.costo)}));
    } catch { this.error = 'No fue posible cargar compras y catálogos.'; }
  }
}

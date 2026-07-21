import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import { BusinessApi } from '../../services/business-api';

interface Proveedor { id: number; empresa: string; estado: string; }
interface Producto { id: number; nombre: string; codigo: string | null; costo: number; tasaIva:number; }
interface Partida { productoId: number | null; cantidad: number | null; costoUnitario: number | null; lote: string; fechaCaducidad: string; }
interface Compra { id: number; folio: string; fecha: string; proveedor: string; estado: string; metodoPago: string; total: number; saldoPendiente: number; }
interface Sugerencia { productoId:number; nombre:string; stock:number; minimo:number; cantidadSugerida:number; costo:number; proveedorId:number|null; proveedor:string|null; }

@Component({ selector: 'app-compras', templateUrl: './compras.page.html', styleUrls: ['./compras.page.scss'], standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem, IonLabel, IonInput, IonSelect, IonSelectOption, IonButton] })
export class ComprasPage implements OnInit {
  private readonly api = inject(BusinessApi);
  proveedores: Proveedor[] = []; productos: Producto[] = []; compras: Compra[] = []; sugerencias:Sugerencia[]=[];
  proveedorId: number | null = null; folio = ''; metodoPago = 'CREDITO'; notas = '';
  efectivoCompra:number|null=null; tarjetaCompra:number|null=null; transferenciaCompra:number|null=null;
  efectivoDesdeCaja = false;
  partidas: Partida[] = [this.nuevaPartida()]; mensaje = ''; error = ''; guardando = false;

  async ngOnInit(): Promise<void> { await this.cargar(); }
  get subtotal(): number { return this.partidas.reduce((s, p) => s + Number(p.cantidad || 0) * Number(p.costoUnitario || 0), 0); }
  get impuestos():number{return this.partidas.reduce((s,p)=>{const producto=this.productos.find(x=>x.id===Number(p.productoId));return s+Number(p.cantidad||0)*Number(p.costoUnitario||0)*Number(producto?.tasaIva||0)/100;},0);}
  get totalCompra():number{return Math.round((this.subtotal+this.impuestos)*100)/100;}
  get totalPagoMixto():number{return Number(this.efectivoCompra||0)+Number(this.tarjetaCompra||0)+Number(this.transferenciaCompra||0);}
  agregarPartida(): void { this.partidas = [...this.partidas, this.nuevaPartida()]; }
  quitarPartida(index: number): void { this.partidas = this.partidas.filter((_, i) => i !== index); if (!this.partidas.length) this.agregarPartida(); }
  seleccionarProducto(partida: Partida): void { const p = this.productos.find((item) => item.id === Number(partida.productoId)); if (p && partida.costoUnitario === null) partida.costoUnitario = p.costo; }
  usarSugerencia(s:Sugerencia):void{if(s.proveedorId)this.proveedorId=Number(s.proveedorId);this.partidas=[...this.partidas.filter(p=>p.productoId),{productoId:Number(s.productoId),cantidad:Number(s.cantidadSugerida),costoUnitario:Number(s.costo),lote:'',fechaCaducidad:''}];this.mensaje=`${s.nombre} agregado a la compra sugerida.`;}

  async guardar(): Promise<void> {
    this.error = ''; this.mensaje = '';
    if (!this.proveedorId || this.partidas.some((p) => !p.productoId || Number(p.cantidad) <= 0 || Number(p.costoUnitario) < 0)) { this.error = 'Completa proveedor, productos, cantidades y costos.'; return; }
    if(this.metodoPago==='MIXTO'&&Math.abs(this.totalPagoMixto-this.totalCompra)>.009){this.error=`El pago mixto debe sumar $${this.totalCompra.toFixed(2)}.`;return;}
    this.guardando = true;
    try {
      const result = await this.api.post<{ folio: string; total: number }>('purchases', { proveedorId: this.proveedorId, folio: this.folio, metodoPago: this.metodoPago, notas: this.notas, items: this.partidas,efectivoDesdeCaja:this.efectivoDesdeCaja,pagos:this.metodoPago==='MIXTO'?[{metodo:'EFECTIVO',monto:Number(this.efectivoCompra||0)},{metodo:'TARJETA',monto:Number(this.tarjetaCompra||0)},{metodo:'TRANSFERENCIA',monto:Number(this.transferenciaCompra||0)}]:undefined });
      this.mensaje = `Compra ${result.folio} recibida por $${Number(result.total).toFixed(2)}. El inventario fue actualizado.`;
      this.proveedorId = null; this.folio = ''; this.notas = ''; this.partidas = [this.nuevaPartida()];this.efectivoCompra=null;this.tarjetaCompra=null;this.transferenciaCompra=null;this.efectivoDesdeCaja=false; await this.cargar();
    } catch (e: unknown) { const x = e as { error?: { error?: { error?: string } } }; this.error = x.error?.error?.error ?? 'No fue posible registrar la compra.'; }
    finally { this.guardando = false; }
  }

  private nuevaPartida(): Partida { return { productoId: null, cantidad: 1, costoUnitario: null, lote: '', fechaCaducidad: '' }; }
  private async cargar(): Promise<void> {
    try {
      const [providers, products, purchases,suggestions] = await Promise.all([this.api.get<Proveedor[]>('providers'), this.api.get<Producto[]>('products'), this.api.get<Compra[]>('purchases'),this.api.get<Sugerencia[]>('purchase-suggestions')]);
      this.proveedores = providers.filter((p) => p.estado === 'ACTIVO');
      this.productos = products.map((p) => ({ ...p, costo: Number(p.costo),tasaIva:Number(p.tasaIva||0) }));
      this.compras = purchases.map((p) => ({ ...p, total: Number(p.total), saldoPendiente: Number(p.saldoPendiente) }));
      this.sugerencias=suggestions.map(s=>({...s,stock:Number(s.stock),minimo:Number(s.minimo),cantidadSugerida:Number(s.cantidadSugerida),costo:Number(s.costo)}));
    } catch { this.error = 'No fue posible cargar compras y catálogos.'; }
  }
}

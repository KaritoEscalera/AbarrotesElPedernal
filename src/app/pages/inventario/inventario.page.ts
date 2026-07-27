import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  IonButton,
  IonContent,
  IonInput,
  IonItem,
  IonLabel,
  IonSearchbar,
  IonSelect,
  IonSelectOption
} from '@ionic/angular/standalone';
import { BusinessApi } from '../../services/business-api';

interface ProductoInventario {
  id: number;
  codigo: string;
  nombre: string;
  categoria: string;
  stock: number;
  stockMinimo: number;
  precioVenta: number;
  costo:number;
  unidadMedida:'Pieza'|'Kilogramo'|'Gramo'|'Litro';
  tasaIva:number;
  proveedorId:number|null;
  proveedor:string|null;
  numeroProveedor:string;
}
interface ProveedorInventario {id:number;empresa:string;nombre:string;telefono:string;estado:string;}
interface LoteAlerta { id:number; nombre:string; lote:string; fechaCaducidad:string; cantidad:number; dias:number; }
interface SugerenciaCompra { productoId:number;nombre:string;stock:number;minimo:number;cantidadSugerida:number;costo:number;proveedor:string|null; }
interface MovimientoInventario {id:number;productoId:number;nombre:string;unidadMedida:string;tipo:string;cantidad:number;stockAnterior:number;stockNuevo:number;costoUnitario:number|null;motivo:string;fecha:string;usuario:string;}

@Component({
  selector: 'app-inventario',
  templateUrl: './inventario.page.html',
  styleUrls: ['./inventario.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonButton,
    IonInput,
    IonItem,
    IonLabel,
    IonSearchbar,
    IonSelect,
    IonSelectOption
  ]
})
export class InventarioPage implements OnInit {
  confirmandoEliminarId:number|null=null;
  private readonly api = inject(BusinessApi);

  busqueda = '';
  filtroEstado = 'todos';
  entradaVisible = false;
  productoNuevoVisible = false;
  guardandoProducto = false;
  nuevoProducto = {
    codigo: '',
    nombre: '',
    categoria: 'Abarrotes',
    unidadMedida: 'Pieza' as 'Pieza' | 'Kilogramo',
    stock: 0 as number | null,
    stockMinimo: 0 as number | null,
    costo: 0 as number | null,
    precioVenta: null as number | null,
    tasaIva: 0 as number | null,
  };
  productoEntradaId = 1;
  cantidadEntrada: number | null = null;
  costoEntrada:number|null=null;
  loteEntrada='';
  caducidadEntrada='';
  motivoEntrada='Recepción de mercancía';
  mensajeEntrada = '';
  operacionVisible:false|'merma'|'conteo'|'config'=false;
  productoOperacion:ProductoInventario|null=null;
  cantidadOperacion:number|null=null;
  motivoOperacion='';
  unidadOperacion:'Pieza'|'Kilogramo'|'Gramo'|'Litro'='Pieza';
  minimoOperacion:number|null=null;
  productoEditando:ProductoInventario|null=null;
  edicionProducto={codigo:'',nombre:'',categoria:'',unidadMedida:'Pieza' as 'Pieza'|'Kilogramo',stockMinimo:0,costo:0,precioVenta:0,tasaIva:0,proveedorId:null as number|null,numeroProveedor:''};

  productos: ProductoInventario[] = [];
  lotesAlerta: LoteAlerta[] = [];
  sugerencias:SugerenciaCompra[]=[];
  movimientos:MovimientoInventario[]=[];
  proveedores:ProveedorInventario[]=[];

  async ngOnInit(): Promise<void> { await Promise.all([this.cargarProductos(),this.cargarLotes(),this.cargarSugerencias(),this.cargarMovimientos(),this.cargarProveedores()]); }

  get productosFiltrados(): ProductoInventario[] {
    const texto = this.busqueda.toLowerCase().trim();

    return this.productos.filter((producto) => {
      const coincideBusqueda =
        producto.nombre.toLowerCase().includes(texto) ||
        producto.codigo.toLowerCase().includes(texto) ||
        producto.categoria.toLowerCase().includes(texto);

      const estado = this.obtenerEstado(producto);

      const coincideEstado =
        this.filtroEstado === 'todos' ||
        this.filtroEstado === estado;

      return coincideBusqueda && coincideEstado;
    });
  }

  get totalProductos(): number {
    return this.productos.length;
  }

  get productosBajos(): number {
    return this.productos.filter(
      producto =>
        producto.stock > 0 &&
        producto.stock <= producto.stockMinimo
    ).length;
  }

  get productosAgotados(): number {
    return this.productos.filter(
      producto => producto.stock === 0
    ).length;
  }

  obtenerEstado(
    producto: ProductoInventario
  ): 'disponible' | 'bajo' | 'agotado' {

    if (producto.stock === 0) {
      return 'agotado';
    }

    if (producto.stock <= producto.stockMinimo) {
      return 'bajo';
    }

    return 'disponible';
  }

  async aumentarStock(producto: ProductoInventario): Promise<void> { await this.ajustarStock(producto,this.esGranel(producto) ? .1 : 1); }

  async disminuirStock(producto: ProductoInventario): Promise<void> {
    if (producto.stock > 0) {
      await this.ajustarStock(producto, this.esGranel(producto)?-.1:-1);
    }
  }
  registrarMerma(producto:ProductoInventario):void{this.abrirOperacion('merma',producto);}
  conteoFisico(producto:ProductoInventario):void{this.abrirOperacion('conteo',producto);this.cantidadOperacion=producto.stock;}
  configurarProducto(producto:ProductoInventario):void{this.abrirOperacion('config',producto);this.unidadOperacion=producto.unidadMedida;this.minimoOperacion=producto.stockMinimo;}
  editarProducto(producto:ProductoInventario):void{this.productoEditando=producto;this.edicionProducto={codigo:producto.codigo,nombre:producto.nombre,categoria:producto.categoria,unidadMedida:producto.unidadMedida==='Kilogramo'?'Kilogramo':'Pieza',stockMinimo:producto.stockMinimo,costo:producto.costo,precioVenta:producto.precioVenta,tasaIva:producto.tasaIva,proveedorId:producto.proveedorId,numeroProveedor:producto.numeroProveedor||''};}
  cerrarEdicion():void{this.productoEditando=null;}
  async guardarEdicion():Promise<void>{if(!this.productoEditando)return;try{await this.api.put(`products/${this.productoEditando.id}`,this.edicionProducto);this.cerrarEdicion();await Promise.all([this.cargarProductos(),this.cargarSugerencias()]);this.mensajeEntrada='Producto actualizado correctamente.';}catch{this.mensajeEntrada='No fue posible actualizar el producto. Revisa código, precio y proveedor.';}}
  async eliminarProducto(producto:ProductoInventario):Promise<void>{if(this.confirmandoEliminarId!==producto.id){this.confirmandoEliminarId=producto.id;this.mensajeEntrada=`Confirma eliminar ${producto.nombre}. Se quitará de Caja y se conservará su historial.`;return;}try{await this.api.delete(`products/${producto.id}`);await this.cargarProductos();this.confirmandoEliminarId=null;this.mensajeEntrada='Producto eliminado del catálogo; su historial se conservó.';}catch{this.mensajeEntrada='No fue posible eliminar el producto.';}}
  abrirOperacion(tipo:'merma'|'conteo'|'config',producto:ProductoInventario):void{this.operacionVisible=tipo;this.productoOperacion=producto;this.cantidadOperacion=null;this.motivoOperacion='';}
  cerrarOperacion():void{this.operacionVisible=false;this.productoOperacion=null;}
  async guardarOperacion():Promise<void>{const p=this.productoOperacion;if(!p||!this.operacionVisible)return;try{if(this.operacionVisible==='merma'){const cantidad=Number(this.cantidadOperacion);if(!Number.isFinite(cantidad)||cantidad<=0||this.motivoOperacion.trim().length<4){this.mensajeEntrada='Captura cantidad y motivo de la merma.';return;}const r=await this.api.post<{stock:number}>(`products/${p.id}/waste`,{cantidad,motivo:this.motivoOperacion});p.stock=Number(r.stock);this.mensajeEntrada='Merma registrada con trazabilidad.';}else if(this.operacionVisible==='conteo'){const stockContado=Number(this.cantidadOperacion);if(!Number.isFinite(stockContado)||stockContado<0){this.mensajeEntrada='Captura una existencia física válida.';return;}const r=await this.api.post<{stock:number;diferencia:number}>(`products/${p.id}/count`,{stockContado,motivo:this.motivoOperacion.trim()||'Conteo físico'});p.stock=Number(r.stock);this.mensajeEntrada=`Conteo guardado. Diferencia: ${Number(r.diferencia).toFixed(3)}.`;}else{const minimo=Number(this.minimoOperacion);await this.api.patch(`products/${p.id}/inventory-settings`,{unidadMedida:this.unidadOperacion,stockMinimo:minimo});p.unidadMedida=this.unidadOperacion;p.stockMinimo=minimo;this.mensajeEntrada='Unidad y existencia mínima actualizadas.';}this.cerrarOperacion();await Promise.all([this.cargarMovimientos(),this.cargarSugerencias(),this.cargarLotes()]);}catch{this.mensajeEntrada='No fue posible guardar la operación de inventario.';}}

  registrarEntrada(): void {
    this.entradaVisible = !this.entradaVisible;
    if (this.entradaVisible) this.productoNuevoVisible = false;
    this.mensajeEntrada = '';
  }

  mostrarProductoNuevo():void {
    this.productoNuevoVisible = !this.productoNuevoVisible;
    if (this.productoNuevoVisible) this.entradaVisible = false;
    this.mensajeEntrada = '';
  }

  async guardarProductoNuevo():Promise<void> {
    const p=this.nuevoProducto;
    const nombre=p.nombre.trim(),categoria=p.categoria.trim(),stock=Number(p.stock),stockMinimo=Number(p.stockMinimo);
    const costo=Number(p.costo),precioVenta=Number(p.precioVenta),tasaIva=Number(p.tasaIva);
    if(!nombre||!categoria){this.mensajeEntrada='Captura el nombre y la categoría.';return;}
    if(![stock,stockMinimo,costo,precioVenta,tasaIva].every(Number.isFinite)||stock<0||stockMinimo<0||costo<0||precioVenta<=0||tasaIva<0){
      this.mensajeEntrada='Existencias, costo, precio e IVA deben ser cantidades válidas.';return;
    }
    if(p.unidadMedida==='Pieza'&&(!Number.isInteger(stock)||!Number.isInteger(stockMinimo))){
      this.mensajeEntrada='Las existencias por pieza deben ser números enteros.';return;
    }
    this.guardandoProducto=true;
    try{
      await this.api.post('products',{codigo:p.codigo.trim()||null,nombre,categoria,unidadMedida:p.unidadMedida,stock,stockMinimo,costo,precioVenta,tasaIva});
      this.nuevoProducto={codigo:'',nombre:'',categoria:'Abarrotes',unidadMedida:'Pieza',stock:0,stockMinimo:0,costo:0,precioVenta:null,tasaIva:0};
      this.productoNuevoVisible=false;
      await Promise.all([this.cargarProductos(),this.cargarSugerencias(),this.cargarMovimientos()]);
      this.mensajeEntrada=`${nombre} fue agregado al inventario y ya aparecerá en Caja.`;
    }catch{this.mensajeEntrada='No fue posible guardar el producto. Verifica que el código de barras no esté repetido.';}
    finally{this.guardandoProducto=false;}
  }

  async guardarEntrada(): Promise<void> {
    const producto = this.productos.find(
      item => item.id === Number(this.productoEntradaId)
    );
    const cantidad = Number(this.cantidadEntrada);

    const costo=Number(this.costoEntrada);
    if (!producto || !Number.isFinite(cantidad) || cantidad <= 0 || !Number.isFinite(costo)||costo<0) {
      this.mensajeEntrada = 'Ingresa una cantidad válida mayor a cero.';
      return;
    }

    try { const r=await this.api.post<{stock:number}>('inventory/receipts',{productoId:producto.id,cantidad,costo,lote:this.loteEntrada.trim(),fechaCaducidad:this.caducidadEntrada||null,motivo:this.motivoEntrada});producto.stock=Number(r.stock);producto.costo=costo;this.mensajeEntrada = `Se recibieron ${cantidad} ${this.etiquetaUnidad(producto)} de ${producto.nombre}.`; this.cantidadEntrada = null;this.costoEntrada=null;this.loteEntrada='';this.caducidadEntrada='';await Promise.all([this.cargarMovimientos(),this.cargarSugerencias(),this.cargarLotes()]); }
    catch { this.mensajeEntrada = 'No fue posible actualizar el inventario.'; }
  }

  private async ajustarStock(producto: ProductoInventario, cantidad: number): Promise<void> { const r = await this.api.patch<{ stock: number }>(`products/${producto.id}/stock`, { cantidad,motivo:'Ajuste rápido desde inventario' }); producto.stock = Number(r.stock);await Promise.all([this.cargarMovimientos(),this.cargarSugerencias()]); }
  esGranel(p:ProductoInventario):boolean{return ['Kilogramo','Gramo','Litro'].includes(p.unidadMedida);}
  etiquetaUnidad(p:ProductoInventario):string{return p.unidadMedida==='Kilogramo'?'kg':p.unidadMedida==='Gramo'?'g':p.unidadMedida==='Litro'?'L':'pzas.';}
  private async cargarProductos(): Promise<void> { try { const datos = await this.api.get<Array<ProductoInventario & { codigo: string | null; categoria: string | null;numeroProveedor:string|null }>>('products'); this.productos = datos.map((p) => ({ ...p, codigo: p.codigo ?? '', categoria: p.categoria ?? 'Sin categoría',unidadMedida:p.unidadMedida||'Pieza', stock: Number(p.stock), stockMinimo: Number(p.stockMinimo),costo:Number(p.costo), precioVenta: Number(p.precioVenta),tasaIva:Number(p.tasaIva),proveedorId:p.proveedorId?Number(p.proveedorId):null,proveedor:p.proveedor??null,numeroProveedor:p.numeroProveedor??'' }));if(this.productos.length&&!this.productos.some(p=>p.id===Number(this.productoEntradaId)))this.productoEntradaId=this.productos[0].id; } catch { this.mensajeEntrada = 'No fue posible consultar el inventario en MySQL.'; } }
  private async cargarLotes():Promise<void>{try{const datos=await this.api.get<LoteAlerta[]>('lots/alerts');this.lotesAlerta=datos.map(l=>({...l,cantidad:Number(l.cantidad),dias:Number(l.dias)}));}catch{this.lotesAlerta=[];}}
  private async cargarSugerencias():Promise<void>{try{const datos=await this.api.get<SugerenciaCompra[]>('purchase-suggestions');this.sugerencias=datos.map(x=>({...x,stock:Number(x.stock),minimo:Number(x.minimo),cantidadSugerida:Number(x.cantidadSugerida),costo:Number(x.costo)}));}catch{this.sugerencias=[];}}
  private async cargarMovimientos():Promise<void>{try{const datos=await this.api.get<MovimientoInventario[]>('inventory/movements');this.movimientos=datos.map(x=>({...x,cantidad:Number(x.cantidad),stockAnterior:Number(x.stockAnterior),stockNuevo:Number(x.stockNuevo),costoUnitario:x.costoUnitario===null?null:Number(x.costoUnitario)}));}catch{this.movimientos=[];}}
  private async cargarProveedores():Promise<void>{try{this.proveedores=await this.api.get<ProveedorInventario[]>('providers');}catch{this.proveedores=[];}}
}

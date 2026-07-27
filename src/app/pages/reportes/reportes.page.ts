import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  IonButton,
  IonContent,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption
} from '@ionic/angular/standalone';

import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { BusinessApi } from '../../services/business-api';

type PeriodoReporte =
  | 'diario'
  | 'semanal'
  | 'mensual'
  | 'anual';

type TipoReporte =
  | 'ventas'
  | 'inventario'
  | 'fiados';

interface VentaReporte {
  id: number;
  folio: string;
  fecha: Date;
  usuario: string;
  metodoPago: string;
  productos: number;
  total: number;
}

interface InventarioReporte {
  id: number;
  codigo: string;
  producto: string;
  categoria: string;
  stock: number;
  stockMinimo: number;
  precioVenta: number;
}

interface FiadoReporte {
  id: number;
  cliente: string;
  fecha: Date;
  deudaOriginal: number;
  abonos: number;
  saldoPendiente: number;
  estado: string;
}
interface PartidaDevolucion { detalleId:number; nombre:string; cantidad:number; devuelto:number; disponible:number; devolver:number|null; }

@Component({
  selector: 'app-reportes',
  templateUrl: './reportes.page.html',
  styleUrls: ['./reportes.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonButton,
    IonItem,
    IonLabel,
    IonSelect,
    IonSelectOption
  ]
})
export class ReportesPage implements OnInit {

  private readonly api = inject(BusinessApi);

  periodoSeleccionado: PeriodoReporte = 'diario';
  tipoReporteSeleccionado: TipoReporte = 'ventas';

  fechaGeneracion = new Date();

  ventas: VentaReporte[] = [];
  inventario: InventarioReporte[] = [];
  fiados: FiadoReporte[] = [];

  mensaje = '';
  ventaCancelar:VentaReporte|null=null;
  motivoCancelacion='';
  ventaDevolver:VentaReporte|null=null;
  partidasDevolucion:PartidaDevolucion[]=[];
  motivoDevolucion='';
  procesandoOperacion=false;

  async ngOnInit(): Promise<void> {
    await this.cargarDatos();
  }

  cancelarVenta(venta: VentaReporte): void { this.ventaCancelar=venta;this.motivoCancelacion='';this.mensaje=''; }
  cerrarOperacion():void{if(this.procesandoOperacion)return;this.ventaCancelar=null;this.ventaDevolver=null;this.partidasDevolucion=[];}
  async confirmarCancelacion():Promise<void>{
    const venta=this.ventaCancelar,motivo=this.motivoCancelacion.trim();
    if(!venta||motivo.length<5){this.mensaje='Escribe un motivo de al menos 5 caracteres.';return;}
    this.procesandoOperacion=true;
    try{await this.api.post(`sales/${venta.id}/cancel`,{motivo});this.ventaCancelar=null;await this.cargarDatos();this.mensaje=`${venta.folio} fue cancelada; el inventario quedó repuesto.`;}
    catch(e:unknown){const x=e as{error?:{error?:{error?:string}}};this.mensaje=x.error?.error?.error??'No fue posible cancelar la venta.';}
    finally{this.procesandoOperacion=false;}
  }

  async imprimirTicket(venta: VentaReporte): Promise<void> {
    try {
      const detail = await this.api.get<{ folio: string; fecha: string; usuario: string; cliente: string | null; metodo: string; subtotal: number; impuestos: number; total: number; items: Array<{ nombre: string; cantidad: number; precioUnitario: number; importe: number }> }>(`sales/${venta.id}`);
      const popup = window.open('', '_blank', 'width=420,height=700');
      if (!popup) { this.mensaje = 'Permite ventanas emergentes para imprimir el ticket.'; return; }
      const safe = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c] ?? c));
      const rows = detail.items.map((i) => `<tr><td>${safe(i.nombre)} × ${Number(i.cantidad)}</td><td>$${Number(i.importe).toFixed(2)}</td></tr>`).join('');
      popup.document.write(`<html><head><title>${safe(detail.folio)}</title><style>body{font:14px monospace;width:300px;margin:20px auto}h2,p{text-align:center}table{width:100%}td:last-child{text-align:right}.total{font-size:18px;font-weight:bold;border-top:1px dashed;padding-top:8px}</style></head><body><h2>Abarrotes El Pedernal</h2><p>${safe(detail.folio)}<br>${new Date(detail.fecha).toLocaleString('es-MX')}<br>Atendió: ${safe(detail.usuario)}</p><table>${rows}<tr><td>Subtotal</td><td>$${Number(detail.subtotal).toFixed(2)}</td></tr><tr><td>IVA</td><td>$${Number(detail.impuestos).toFixed(2)}</td></tr><tr class="total"><td>Total</td><td>$${Number(detail.total).toFixed(2)}</td></tr></table><p>Pago: ${safe(detail.metodo)}<br>¡Gracias por su compra!</p><script>window.onload=()=>window.print()<\/script></body></html>`);
      popup.document.close();
    } catch { this.mensaje = 'No fue posible obtener el ticket.'; }
  }

  async devolverVenta(venta:VentaReporte):Promise<void>{
    try{const detail=await this.api.get<{items:Array<{detalleId:number;nombre:string;cantidad:number;devuelto:number}>}>(`sales/${venta.id}`);this.partidasDevolucion=detail.items.map(item=>({...item,cantidad:Number(item.cantidad),devuelto:Number(item.devuelto),disponible:Number(item.cantidad)-Number(item.devuelto),devolver:null})).filter(item=>item.disponible>0);if(!this.partidasDevolucion.length){this.mensaje='Esta venta ya no tiene productos disponibles para devolución.';return;}this.ventaDevolver=venta;this.motivoDevolucion='';this.mensaje='';}
    catch{this.mensaje='No fue posible consultar las partidas de la venta.';}
  }
  async confirmarDevolucion():Promise<void>{
    const venta=this.ventaDevolver;
    if(!venta)return;
    const invalid=this.partidasDevolucion.find(item=>Number(item.devolver)<0||Number(item.devolver)>item.disponible);
    const items=this.partidasDevolucion.filter(item=>Number(item.devolver)>0).map(item=>({detalleId:item.detalleId,cantidad:Number(item.devolver)}));
    if(invalid){this.mensaje=`Cantidad inválida para ${invalid.nombre}.`;return;}
    if(!items.length){this.mensaje='Selecciona al menos una cantidad para devolver.';return;}
    if(this.motivoDevolucion.trim().length<5){this.mensaje='Escribe un motivo de al menos 5 caracteres.';return;}
    this.procesandoOperacion=true;
    try{const result=await this.api.post<{reembolso:number}>(`sales/${venta.id}/returns`,{items,motivo:this.motivoDevolucion.trim()});this.ventaDevolver=null;this.partidasDevolucion=[];this.mensaje=`Devolución registrada. Reembolso: $${Number(result.reembolso).toFixed(2)}.`;await this.cargarDatos();}
    catch(e:unknown){const x=e as{error?:{error?:{error?:string}}};this.mensaje=x.error?.error?.error??'No fue posible registrar la devolución.';}
    finally{this.procesandoOperacion=false;}
  }

  private async cargarDatos(): Promise<void> {
    try {
      const datos = await this.api.get<{ sales: Array<Omit<VentaReporte, 'fecha'> & { fecha: string }>; inventory: InventarioReporte[]; credits: Array<Omit<FiadoReporte, 'fecha'> & { fecha: string }> }>('reports');
      this.ventas = datos.sales.map((v) => ({ ...v, fecha: new Date(v.fecha), productos: Number(v.productos), total: Number(v.total) }));
      this.inventario = datos.inventory.map((p) => ({ ...p, stock: Number(p.stock), stockMinimo: Number(p.stockMinimo), precioVenta: Number(p.precioVenta) }));
      this.fiados = datos.credits.map((f) => ({ ...f, fecha: new Date(f.fecha), deudaOriginal: Number(f.deudaOriginal), abonos: Number(f.abonos), saldoPendiente: Number(f.saldoPendiente) }));
    } catch { this.mensaje = 'No fue posible cargar los reportes desde MySQL.'; }
  }

  private crearDatosPrueba(): void {

    const hoy = new Date();

    const crearFecha = (diasAtras: number): Date => {
      const fecha = new Date(hoy);
      fecha.setDate(fecha.getDate() - diasAtras);
      return fecha;
    };

    this.ventas = [
      {
        id: 1,
        folio: 'V-1001',
        fecha: crearFecha(0),
        usuario: 'Cajera',
        metodoPago: 'Efectivo',
        productos: 5,
        total: 485
      },
      {
        id: 2,
        folio: 'V-1002',
        fecha: crearFecha(0),
        usuario: 'Cajera',
        metodoPago: 'Tarjeta',
        productos: 3,
        total: 320
      },
      {
        id: 3,
        folio: 'V-1003',
        fecha: crearFecha(1),
        usuario: 'Cajera',
        metodoPago: 'Efectivo',
        productos: 8,
        total: 760
      },
      {
        id: 4,
        folio: 'V-1004',
        fecha: crearFecha(3),
        usuario: 'Gerente',
        metodoPago: 'Transferencia',
        productos: 6,
        total: 625
      },
      {
        id: 5,
        folio: 'V-1005',
        fecha: crearFecha(6),
        usuario: 'Cajera',
        metodoPago: 'Efectivo',
        productos: 9,
        total: 890
      },
      {
        id: 6,
        folio: 'V-1006',
        fecha: crearFecha(12),
        usuario: 'Cajera',
        metodoPago: 'Tarjeta',
        productos: 4,
        total: 410
      },
      {
        id: 7,
        folio: 'V-1007',
        fecha: crearFecha(35),
        usuario: 'Gerente',
        metodoPago: 'Efectivo',
        productos: 10,
        total: 1050
      },
      {
        id: 8,
        folio: 'V-1008',
        fecha: crearFecha(120),
        usuario: 'Cajera',
        metodoPago: 'Efectivo',
        productos: 12,
        total: 1320
      }
    ];

    this.inventario = [
      {
        id: 1,
        codigo: '750105530001',
        producto: 'Coca-Cola 600 ml',
        categoria: 'Bebidas',
        stock: 28,
        stockMinimo: 10,
        precioVenta: 18
      },
      {
        id: 2,
        codigo: '750100011111',
        producto: 'Leche Lala 1 L',
        categoria: 'Lácteos',
        stock: 7,
        stockMinimo: 10,
        precioVenta: 30
      },
      {
        id: 3,
        codigo: '750103049292',
        producto: 'Sabritas Original',
        categoria: 'Botanas',
        stock: 3,
        stockMinimo: 8,
        precioVenta: 20
      },
      {
        id: 4,
        codigo: '750100015555',
        producto: 'Pan Blanco Bimbo',
        categoria: 'Panadería',
        stock: 14,
        stockMinimo: 6,
        precioVenta: 45
      },
      {
        id: 5,
        codigo: '750101700123',
        producto: 'Frijol a granel',
        categoria: 'Granel',
        stock: 0,
        stockMinimo: 5,
        precioVenta: 38
      }
    ];

    this.fiados = [
      {
        id: 1,
        cliente: 'Juan Pérez',
        fecha: crearFecha(2),
        deudaOriginal: 500,
        abonos: 150,
        saldoPendiente: 350,
        estado: 'Pendiente'
      },
      {
        id: 2,
        cliente: 'María López',
        fecha: crearFecha(5),
        deudaOriginal: 280,
        abonos: 0,
        saldoPendiente: 280,
        estado: 'Pendiente'
      },
      {
        id: 3,
        cliente: 'Carlos Hernández',
        fecha: crearFecha(15),
        deudaOriginal: 700,
        abonos: 700,
        saldoPendiente: 0,
        estado: 'Liquidado'
      },
      {
        id: 4,
        cliente: 'Ana Martínez',
        fecha: crearFecha(40),
        deudaOriginal: 420,
        abonos: 230,
        saldoPendiente: 190,
        estado: 'Vencido'
      }
    ];
  }

  get ventasFiltradas(): VentaReporte[] {

    const rango = this.obtenerRangoFechas();

    return this.ventas.filter((venta) => {
      return (
        venta.fecha >= rango.inicio &&
        venta.fecha <= rango.fin
      );
    });
  }

  get fiadosFiltrados(): FiadoReporte[] {

    const rango = this.obtenerRangoFechas();

    return this.fiados.filter((fiado) => {
      return (
        fiado.fecha >= rango.inicio &&
        fiado.fecha <= rango.fin
      );
    });
  }

  get totalVentas(): number {
    return this.ventasFiltradas.reduce(
      (total, venta) => total + venta.total,
      0
    );
  }

  get numeroVentas(): number {
    return this.ventasFiltradas.length;
  }

  get promedioVenta(): number {

    if (this.numeroVentas === 0) {
      return 0;
    }

    return this.totalVentas / this.numeroVentas;
  }

  get productosVendidos(): number {
    return this.ventasFiltradas.reduce(
      (total, venta) => total + venta.productos,
      0
    );
  }

  get valorInventario(): number {
    return this.inventario.reduce(
      (total, producto) =>
        total + producto.stock * producto.precioVenta,
      0
    );
  }

  get productosStockBajo(): number {
    return this.inventario.filter(
      producto =>
        producto.stock <= producto.stockMinimo
    ).length;
  }

  get saldoFiados(): number {
    return this.fiadosFiltrados.reduce(
      (total, fiado) =>
        total + fiado.saldoPendiente,
      0
    );
  }

  get totalAbonos(): number {
    return this.fiadosFiltrados.reduce(
      (total, fiado) =>
        total + fiado.abonos,
      0
    );
  }

  private obtenerRangoFechas(): {
    inicio: Date;
    fin: Date;
  } {

    const ahora = new Date();

    let inicio: Date;
    let fin: Date;

    switch (this.periodoSeleccionado) {

      case 'diario':

        inicio = new Date(
          ahora.getFullYear(),
          ahora.getMonth(),
          ahora.getDate(),
          0,
          0,
          0
        );

        fin = new Date(
          ahora.getFullYear(),
          ahora.getMonth(),
          ahora.getDate(),
          23,
          59,
          59
        );

        break;

      case 'semanal': {

        const diaSemana = ahora.getDay();

        const diferenciaLunes =
          diaSemana === 0
            ? -6
            : 1 - diaSemana;

        inicio = new Date(ahora);

        inicio.setDate(
          ahora.getDate() + diferenciaLunes
        );

        inicio.setHours(0, 0, 0, 0);

        fin = new Date(inicio);

        fin.setDate(
          inicio.getDate() + 6
        );

        fin.setHours(23, 59, 59, 999);

        break;
      }

      case 'mensual':

        inicio = new Date(
          ahora.getFullYear(),
          ahora.getMonth(),
          1,
          0,
          0,
          0
        );

        fin = new Date(
          ahora.getFullYear(),
          ahora.getMonth() + 1,
          0,
          23,
          59,
          59
        );

        break;

      case 'anual':

        inicio = new Date(
          ahora.getFullYear(),
          0,
          1,
          0,
          0,
          0
        );

        fin = new Date(
          ahora.getFullYear(),
          11,
          31,
          23,
          59,
          59
        );

        break;
    }

    return {
      inicio,
      fin
    };
  }

  obtenerNombrePeriodo(): string {

    const nombres: Record<PeriodoReporte, string> = {
      diario: 'Diario',
      semanal: 'Semanal',
      mensual: 'Mensual',
      anual: 'Anual'
    };

    return nombres[this.periodoSeleccionado];
  }

  obtenerNombreTipo(): string {

    const nombres: Record<TipoReporte, string> = {
      ventas: 'Ventas',
      inventario: 'Inventario',
      fiados: 'Fiados'
    };

    return nombres[this.tipoReporteSeleccionado];
  }

  formatearMoneda(cantidad: number): string {

    return new Intl.NumberFormat(
      'es-MX',
      {
        style: 'currency',
        currency: 'MXN'
      }
    ).format(cantidad);
  }

  formatearFecha(fecha: Date): string {

    return new Intl.DateTimeFormat(
      'es-MX',
      {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }
    ).format(fecha);
  }

  generarPDF(): void {

    const documento = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const colorCafe: [number, number, number] =
      [74, 44, 29];

    const colorNaranja: [number, number, number] =
      [245, 124, 31];

    documento.setFillColor(...colorCafe);
    documento.rect(0, 0, 297, 28, 'F');

    documento.setTextColor(255, 255, 255);
    documento.setFontSize(19);
    documento.setFont('helvetica', 'bold');

    documento.text(
      'Abarrotes El Pedernal',
      14,
      12
    );

    documento.setFontSize(11);
    documento.setFont('helvetica', 'normal');

    documento.text(
      `Reporte de ${this.obtenerNombreTipo()} - ${this.obtenerNombrePeriodo()}`,
      14,
      21
    );

    documento.setTextColor(...colorCafe);
    documento.setFontSize(10);

    documento.text(
      `Generado: ${this.formatearFecha(new Date())}`,
      235,
      36
    );

    if (this.tipoReporteSeleccionado === 'ventas') {
      this.generarPDFVentas(
        documento,
        colorCafe,
        colorNaranja
      );
    }

    if (this.tipoReporteSeleccionado === 'inventario') {
      this.generarPDFInventario(
        documento,
        colorCafe,
        colorNaranja
      );
    }

    if (this.tipoReporteSeleccionado === 'fiados') {
      this.generarPDFFiados(
        documento,
        colorCafe,
        colorNaranja
      );
    }

    const nombreArchivo =
      `reporte-${this.tipoReporteSeleccionado}-${this.periodoSeleccionado}.pdf`;

    documento.save(nombreArchivo);
  }

  private generarPDFVentas(
    documento: jsPDF,
    colorCafe: [number, number, number],
    colorNaranja: [number, number, number]
  ): void {

    documento.setFontSize(11);
    documento.setFont('helvetica', 'bold');

    documento.text(
      `Total vendido: ${this.formatearMoneda(this.totalVentas)}`,
      14,
      40
    );

    documento.text(
      `Ventas registradas: ${this.numeroVentas}`,
      105,
      40
    );

    documento.text(
      `Productos vendidos: ${this.productosVendidos}`,
      190,
      40
    );

    autoTable(documento, {
      startY: 48,

      head: [[
        'Folio',
        'Fecha',
        'Responsable',
        'Método de pago',
        'Productos',
        'Total'
      ]],

      body: this.ventasFiltradas.map(
        venta => [
          venta.folio,
          this.formatearFecha(venta.fecha),
          venta.usuario,
          venta.metodoPago,
          venta.productos.toString(),
          this.formatearMoneda(venta.total)
        ]
      ),

      theme: 'grid',

      headStyles: {
        fillColor: colorCafe,
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },

      alternateRowStyles: {
        fillColor: [255, 248, 241]
      },

      styles: {
        fontSize: 9,
        cellPadding: 4
      },

      didDrawPage: () => {
        this.agregarPiePagina(
          documento,
          colorNaranja
        );
      }
    });
  }

  private generarPDFInventario(
    documento: jsPDF,
    colorCafe: [number, number, number],
    colorNaranja: [number, number, number]
  ): void {

    documento.setFontSize(11);
    documento.setFont('helvetica', 'bold');

    documento.text(
      `Productos registrados: ${this.inventario.length}`,
      14,
      40
    );

    documento.text(
      `Stock bajo o agotado: ${this.productosStockBajo}`,
      105,
      40
    );

    documento.text(
      `Valor estimado: ${this.formatearMoneda(this.valorInventario)}`,
      190,
      40
    );

    autoTable(documento, {
      startY: 48,

      head: [[
        'Código',
        'Producto',
        'Categoría',
        'Stock',
        'Stock mínimo',
        'Precio',
        'Estado'
      ]],

      body: this.inventario.map(
        producto => [
          producto.codigo,
          producto.producto,
          producto.categoria,
          producto.stock.toString(),
          producto.stockMinimo.toString(),
          this.formatearMoneda(
            producto.precioVenta
          ),
          producto.stock === 0
            ? 'Agotado'
            : producto.stock <= producto.stockMinimo
            ? 'Stock bajo'
            : 'Disponible'
        ]
      ),

      theme: 'grid',

      headStyles: {
        fillColor: colorCafe,
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },

      alternateRowStyles: {
        fillColor: [255, 248, 241]
      },

      styles: {
        fontSize: 9,
        cellPadding: 4
      },

      didDrawPage: () => {
        this.agregarPiePagina(
          documento,
          colorNaranja
        );
      }
    });
  }

  private generarPDFFiados(
    documento: jsPDF,
    colorCafe: [number, number, number],
    colorNaranja: [number, number, number]
  ): void {

    documento.setFontSize(11);
    documento.setFont('helvetica', 'bold');

    documento.text(
      `Cuentas registradas: ${this.fiadosFiltrados.length}`,
      14,
      40
    );

    documento.text(
      `Abonos recibidos: ${this.formatearMoneda(this.totalAbonos)}`,
      105,
      40
    );

    documento.text(
      `Saldo pendiente: ${this.formatearMoneda(this.saldoFiados)}`,
      200,
      40
    );

    autoTable(documento, {
      startY: 48,

      head: [[
        'Cliente',
        'Fecha',
        'Deuda original',
        'Abonos',
        'Saldo pendiente',
        'Estado'
      ]],

      body: this.fiadosFiltrados.map(
        fiado => [
          fiado.cliente,
          this.formatearFecha(fiado.fecha),
          this.formatearMoneda(
            fiado.deudaOriginal
          ),
          this.formatearMoneda(
            fiado.abonos
          ),
          this.formatearMoneda(
            fiado.saldoPendiente
          ),
          fiado.estado
        ]
      ),

      theme: 'grid',

      headStyles: {
        fillColor: colorCafe,
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },

      alternateRowStyles: {
        fillColor: [255, 248, 241]
      },

      styles: {
        fontSize: 9,
        cellPadding: 4
      },

      didDrawPage: () => {
        this.agregarPiePagina(
          documento,
          colorNaranja
        );
      }
    });
  }

  private agregarPiePagina(
    documento: jsPDF,
    colorNaranja: [number, number, number]
  ): void {

    const numeroPagina =
      documento.getNumberOfPages();

    documento.setDrawColor(...colorNaranja);

    documento.line(
      14,
      197,
      283,
      197
    );

    documento.setTextColor(110, 85, 68);
    documento.setFontSize(8);

    documento.text(
      'Sistema de Gestión - Abarrotes El Pedernal',
      14,
      202
    );

    documento.text(
      `Página ${numeroPagina}`,
      268,
      202
    );
  }
}

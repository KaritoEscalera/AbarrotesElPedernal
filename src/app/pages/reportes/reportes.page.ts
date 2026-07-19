import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
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
export class ReportesPage {

  periodoSeleccionado: PeriodoReporte = 'diario';
  tipoReporteSeleccionado: TipoReporte = 'ventas';

  fechaGeneracion = new Date();

  ventas: VentaReporte[] = [];
  inventario: InventarioReporte[] = [];
  fiados: FiadoReporte[] = [];

  constructor() {
    this.crearDatosPrueba();
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
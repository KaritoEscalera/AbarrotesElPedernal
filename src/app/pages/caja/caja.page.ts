import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonInput,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption
} from '@ionic/angular/standalone';

interface MovimientoCaja {
  id: number;
  tipo: 'Efectivo' | 'Tarjeta' | 'Fiado' | 'Ingreso' | 'Salida';
  descripcion: string;
  cliente?: string;
  tarjeta?: string;
  monto: number;
  fecha: string;
}

@Component({
  selector: 'app-caja',
  templateUrl: './caja.page.html',
  styleUrls: ['./caja.page.scss'],
  standalone: true,

  imports:[
    CommonModule,
    FormsModule,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonButton,
    IonInput,
    IonItem,
    IonLabel,
    IonSelect,
    IonSelectOption
  ]
})
export class CajaPage {
  private readonly claveMovimientos = 'movimientosCaja';

  estadoCaja = 'ABIERTA';

  fondoInicial = 1000;
  ventas = 3250;
  ingresos = 500;
  salidas = 200;

  metodoPago: 'Efectivo' | 'Tarjeta' | 'Fiado' = 'Efectivo';
  montoVenta: number | null = null;
  clienteFiado = '';
  tarjetaReferencia = '';
  mensajePago = '';

  clientesFiado = [
    'Juan Pérez',
    'María López',
    'Carlos Hernández',
    'Ana Martínez'
  ];

  movimientos: MovimientoCaja[] = [
    {
      id: 1,
      tipo: 'Ingreso',
      descripcion: 'Fondo inicial',
      monto: 1000,
      fecha: '2026-07-18'
    },
    {
      id: 2,
      tipo: 'Ingreso',
      descripcion: 'Ventas del día',
      monto: 3250,
      fecha: '2026-07-18'
    },
    {
      id: 3,
      tipo: 'Salida',
      descripcion: 'Pago a proveedor',
      monto: 200,
      fecha: '2026-07-18'
    }
  ];

  constructor() {
    const guardados = localStorage.getItem(this.claveMovimientos);
    if (guardados) {
      try {
        const movimientos = JSON.parse(guardados) as MovimientoCaja[];
        if (Array.isArray(movimientos)) this.movimientos = movimientos;
      } catch {
        localStorage.removeItem(this.claveMovimientos);
      }
    } else {
      this.guardarMovimientos();
    }
  }

  get totalCaja(): number {
    return (
      this.fondoInicial +
      this.ventas +
      this.ingresos -
      this.salidas
    );
  }

  get totalEfectivo(): number {
    return this.movimientos
      .filter((mov) => mov.tipo === 'Efectivo')
      .reduce((suma, mov) => suma + mov.monto, 0);
  }

  get totalTarjeta(): number {
    return this.movimientos
      .filter((mov) => mov.tipo === 'Tarjeta')
      .reduce((suma, mov) => suma + mov.monto, 0);
  }

  get totalFiado(): number {
    return this.movimientos
      .filter((mov) => mov.tipo === 'Fiado')
      .reduce((suma, mov) => suma + mov.monto, 0);
  }

  get movimientoReciente(): MovimientoCaja | null {
    return this.movimientos.length ? this.movimientos[0] : null;
  }

  abrirCaja() {
    this.estadoCaja = 'ABIERTA';
    this.mensajePago = 'Caja abierta correctamente.';
  }

  cerrarCaja() {
    this.estadoCaja = 'CERRADA';
    this.mensajePago = 'Caja cerrada correctamente.';
  }

  registrarPago() {
    const monto = Number(this.montoVenta);

    if (!monto || monto <= 0) {
      this.mensajePago = 'Ingresa un monto válido.';
      return;
    }

    if (this.metodoPago === 'Fiado' && !this.clienteFiado.trim()) {
      this.mensajePago = 'Selecciona un cliente para el fiado.';
      return;
    }

    if (this.metodoPago === 'Tarjeta' && !this.tarjetaReferencia.trim()) {
      this.mensajePago = 'Ingresa la referencia de tarjeta.';
      return;
    }

    const descripcion =
      this.metodoPago === 'Fiado'
        ? `Venta a fiado: ${this.clienteFiado}`
        : this.metodoPago === 'Tarjeta'
        ? `Pago con tarjeta: ${this.tarjetaReferencia}`
        : 'Pago en efectivo';

    const movimiento: MovimientoCaja = {
      id: this.movimientos.length + 1,
      tipo: this.metodoPago,
      descripcion,
      cliente: this.metodoPago === 'Fiado' ? this.clienteFiado.trim() : undefined,
      tarjeta: this.metodoPago === 'Tarjeta' ? this.tarjetaReferencia.trim() : undefined,
      monto,
      fecha: new Date().toISOString().split('T')[0]
    };

    this.movimientos = [movimiento, ...this.movimientos];
    this.guardarMovimientos();
    this.ventas += monto;
    this.montoVenta = null;
    this.clienteFiado = '';
    this.tarjetaReferencia = '';
    this.mensajePago = 'Pago registrado correctamente.';
  }

  private guardarMovimientos(): void {
    localStorage.setItem(this.claveMovimientos, JSON.stringify(this.movimientos));
  }

}

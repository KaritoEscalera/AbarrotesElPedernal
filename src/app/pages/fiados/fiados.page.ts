import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Auth } from '../../services/auth';
import { BusinessApi } from '../../services/business-api';

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

interface Fiado {
  id: number;
  cliente: string;
  telefono: string;
  deudaOriginal: number;
  saldoPendiente: number;
  ultimoAbono: number;
  limite: number;
  fechaRegistro: string;
  fechaLimite: string;
}

@Component({
  selector: 'app-fiados',
  templateUrl: './fiados.page.html',
  styleUrls: ['./fiados.page.scss'],
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
export class FiadosPage implements OnInit {
  private readonly auth = inject(Auth);
  private readonly api = inject(BusinessApi);

  busqueda = '';
  filtroEstado = 'todos';
  nuevoFiadoVisible = false;

  fiadoSeleccionado: Fiado | null = null;
  cantidadAbono: number | null = null;
  mensaje = '';

  rolActual = this.auth.obtenerRol() ?? 'cajera';
  nuevoFiadoForm = {
    cliente: '',
    telefono: '',
    deudaOriginal: null as number | null,
    limite: null as number | null,
    fechaLimite: '',
  };

  fiados: Fiado[] = [];

  async ngOnInit(): Promise<void> { await this.cargarFiados(); }

  get fiadosFiltrados(): Fiado[] {
    const texto = this.busqueda.toLowerCase().trim();

    return this.fiados.filter((fiado) => {
      const coincideBusqueda =
        fiado.cliente.toLowerCase().includes(texto) ||
        fiado.telefono.includes(texto);

      const estado = this.obtenerEstado(fiado);

      const coincideEstado =
        this.filtroEstado === 'todos' ||
        this.filtroEstado === estado;

      return coincideBusqueda && coincideEstado;
    });
  }

  get totalPendiente(): number {
    return this.fiados.reduce(
      (total, fiado) => total + fiado.saldoPendiente,
      0
    );
  }

  get clientesConAdeudo(): number {
    return this.fiados.filter(
      fiado => fiado.saldoPendiente > 0
    ).length;
  }

  get cuentasLiquidadas(): number {
    return this.fiados.filter(
      fiado => fiado.saldoPendiente === 0
    ).length;
  }

  get puedeConfigurarLimite(): boolean {
    return this.rolActual === 'gerente' || this.rolActual === 'administrador';
  }

  abrirFormularioNuevoFiado(): void {
    this.nuevoFiadoVisible = true;
    this.mensaje = '';
  }

  cancelarNuevoFiado(): void {
    this.nuevoFiadoVisible = false;
    this.nuevoFiadoForm = {
      cliente: '',
      telefono: '',
      deudaOriginal: null,
      limite: null,
      fechaLimite: '',
    };
    this.mensaje = '';
  }

  async guardarNuevoFiado(): Promise<void> {
    const cliente = this.nuevoFiadoForm.cliente?.trim();
    const telefono = this.nuevoFiadoForm.telefono?.trim();
    const deudaOriginal = Number(this.nuevoFiadoForm.deudaOriginal);
    const limite = Number(this.nuevoFiadoForm.limite);
    const fechaLimite = this.nuevoFiadoForm.fechaLimite?.trim();

    if (!cliente || !telefono || !deudaOriginal || !fechaLimite) {
      this.mensaje = 'Completa cliente, teléfono, deuda y fecha límite.';
      return;
    }

    if (deudaOriginal <= 0) {
      this.mensaje = 'La deuda original debe ser mayor a cero.';
      return;
    }

    if (this.puedeConfigurarLimite) {
      if (!limite || limite <= 0) {
        this.mensaje = 'El límite debe ser mayor a cero.';
        return;
      }
    }

    try { await this.api.post('credits', { cliente, telefono, deudaOriginal, limite: this.puedeConfigurarLimite ? limite : 0, fechaLimite }); await this.cargarFiados(); this.cancelarNuevoFiado(); this.mensaje = 'Fiado registrado correctamente en MySQL.'; } catch { this.mensaje = 'No fue posible registrar el fiado.'; }
  }

  obtenerEstado(fiado: Fiado): 'pendiente' | 'vencido' | 'liquidado' {
    if (fiado.saldoPendiente === 0) {
      return 'liquidado';
    }

    const fechaActual = new Date();
    const fechaLimite = new Date(`${fiado.fechaLimite}T23:59:59`);

    if (fechaLimite < fechaActual) {
      return 'vencido';
    }

    return 'pendiente';
  }

  abrirAbono(fiado: Fiado): void {
    this.fiadoSeleccionado = fiado;
    this.cantidadAbono = null;
    this.mensaje = '';
  }

  async guardarAbono(): Promise<void> {
    if (!this.fiadoSeleccionado) {
      return;
    }

    if (!this.cantidadAbono || this.cantidadAbono <= 0) {
      this.mensaje = 'Ingresa una cantidad válida.';
      return;
    }

    if (this.cantidadAbono > this.fiadoSeleccionado.saldoPendiente) {
      this.mensaje = 'El abono no puede ser mayor al saldo pendiente.';
      return;
    }

    try { await this.api.post(`credits/${this.fiadoSeleccionado.id}/payments`, { monto: this.cantidadAbono, metodo: 'EFECTIVO' }); await this.cargarFiados(); this.cancelarAbono(); this.mensaje = 'Abono registrado correctamente en MySQL.'; } catch { this.mensaje = 'No fue posible registrar el abono.'; }
  }

  cancelarAbono(): void {
    this.fiadoSeleccionado = null;
    this.cantidadAbono = null;
    this.mensaje = '';
  }

  nuevoFiado(): void {
    alert(
      'Después conectaremos este botón con el formulario para registrar un nuevo fiado.'
    );
  }

  private async cargarFiados(): Promise<void> { try { const datos = await this.api.get<Fiado[]>('credits'); this.fiados = datos.map((f) => ({ ...f, deudaOriginal: Number(f.deudaOriginal), saldoPendiente: Number(f.saldoPendiente), ultimoAbono: Number(f.ultimoAbono), limite: Number(f.limite) })); } catch { this.mensaje = 'No fue posible consultar fiados en MySQL.'; } }
}

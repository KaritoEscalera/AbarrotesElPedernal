import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonSearchbar,
} from '@ionic/angular/standalone';
import { BusinessApi } from '../../services/business-api';

interface Cliente {
  id: number;
  nombre: string;
  telefono: string;
  direccion: string;
  estado: 'Activo' | 'Inactivo';
  adeudo: number;
}

@Component({
  selector: 'app-clientes',
  templateUrl: './clientes.page.html',
  styleUrls: ['./clientes.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonContent,
    IonSearchbar,
  ],
})
export class ClientesPage implements OnInit {
  private readonly api = inject(BusinessApi);
  private readonly router = inject(Router);
  busqueda = '';
  mensajeFormulario = '';

  clientes: Cliente[] = [];

  async ngOnInit(): Promise<void> { await this.cargarClientes(); }

  get clientesFiltrados() {
    const termino = this.busqueda.trim().toLowerCase();

    return this.clientes.filter(cliente =>
      `${cliente.nombre} ${cliente.telefono} ${cliente.direccion}`.toLowerCase().includes(termino)
    );
  }

  get clientesActivos() {
    return this.clientes.filter(cliente => cliente.estado === 'Activo').length;
  }

  get clientesConAdeudo() {
    return this.clientes.filter(cliente => cliente.adeudo > 0).length;
  }

  abrirCliente(cliente: Cliente): void {
    void this.router.navigate(['/fiados'], { queryParams: { cliente: cliente.id } });
  }

  private async cargarClientes(): Promise<void> {
    try {
      const datos = await this.api.get<Array<{ id: number; nombre: string; telefono: string; direccion: string | null; activo: boolean; adeudo: number }>>('clients');
      this.clientes = datos.map((c) => ({ ...c, direccion: c.direccion ?? '', estado: c.activo ? 'Activo' : 'Inactivo', adeudo: Number(c.adeudo) }));
    } catch { this.mensajeFormulario = 'No fue posible consultar clientes en MySQL.'; }
  }
}

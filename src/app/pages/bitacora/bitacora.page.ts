import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  IonButton,
  IonContent,
  IonItem,
  IonLabel,
  IonSearchbar,
  IonSelect,
  IonSelectOption
} from '@ionic/angular/standalone';
import { BusinessApi } from '../../services/business-api';

type TipoAccion =
  | 'Inicio de sesión'
  | 'Cierre de sesión'
  | 'Registro'
  | 'Edición'
  | 'Eliminación'
  | 'Consulta'
  | 'Movimiento de caja';

interface RegistroBitacora {
  id: number;
  usuario: string;
  rol: string;
  accion: TipoAccion | string;
  modulo: string;
  descripcion: string;
  fecha: Date;
  resultado: 'Exitoso' | 'Fallido';
}

@Component({
  selector: 'app-bitacora',
  templateUrl: './bitacora.page.html',
  styleUrls: ['./bitacora.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonButton,
    IonItem,
    IonLabel,
    IonSearchbar,
    IonSelect,
    IonSelectOption
  ]
})
export class BitacoraPage implements OnInit {

  private readonly api = inject(BusinessApi);

  busqueda = '';
  filtroModulo = 'Todos';
  filtroResultado = 'Todos';

  registros: RegistroBitacora[] = [
    {
      id: 1,
      usuario: 'Administrador',
      rol: 'Administrador',
      accion: 'Inicio de sesión',
      modulo: 'Autenticación',
      descripcion: 'Inicio de sesión correcto.',
      fecha: new Date('2026-07-18T08:05:00'),
      resultado: 'Exitoso'
    },
    {
      id: 2,
      usuario: 'Cajera',
      rol: 'Cajera',
      accion: 'Movimiento de caja',
      modulo: 'Caja',
      descripcion: 'Apertura de caja con fondo inicial de $1,000.',
      fecha: new Date('2026-07-18T08:15:00'),
      resultado: 'Exitoso'
    },
    {
      id: 3,
      usuario: 'Gerente',
      rol: 'Gerente',
      accion: 'Edición',
      modulo: 'Inventario',
      descripcion: 'Actualizó el stock de Leche Lala 1 L.',
      fecha: new Date('2026-07-18T09:20:00'),
      resultado: 'Exitoso'
    },
    {
      id: 4,
      usuario: 'Cajera',
      rol: 'Cajera',
      accion: 'Registro',
      modulo: 'Fiados',
      descripcion: 'Registró un fiado para Juan Pérez.',
      fecha: new Date('2026-07-18T10:40:00'),
      resultado: 'Exitoso'
    },
    {
      id: 5,
      usuario: 'Usuario desconocido',
      rol: 'Sin rol',
      accion: 'Inicio de sesión',
      modulo: 'Autenticación',
      descripcion: 'Intento de inicio de sesión con credenciales incorrectas.',
      fecha: new Date('2026-07-18T11:05:00'),
      resultado: 'Fallido'
    },
    {
      id: 6,
      usuario: 'Administrador',
      rol: 'Administrador',
      accion: 'Eliminación',
      modulo: 'Proveedores',
      descripcion: 'Eliminó un proveedor inactivo.',
      fecha: new Date('2026-07-18T12:30:00'),
      resultado: 'Exitoso'
    }
  ];

  async ngOnInit(): Promise<void> {
    try {
      const datos = await this.api.get<Array<Omit<RegistroBitacora, 'fecha' | 'resultado'> & { fecha: string }>>('audit');
      this.registros = datos.map((registro) => ({ ...registro, fecha: new Date(registro.fecha), resultado: 'Exitoso' }));
    } catch { this.registros = []; }
  }

  get registrosFiltrados(): RegistroBitacora[] {
    const texto = this.busqueda.toLowerCase().trim();

    return this.registros
      .filter((registro) => {
        const coincideBusqueda =
          registro.usuario.toLowerCase().includes(texto) ||
          registro.accion.toLowerCase().includes(texto) ||
          registro.modulo.toLowerCase().includes(texto) ||
          registro.descripcion.toLowerCase().includes(texto);

        const coincideModulo =
          this.filtroModulo === 'Todos' ||
          registro.modulo === this.filtroModulo;

        const coincideResultado =
          this.filtroResultado === 'Todos' ||
          registro.resultado === this.filtroResultado;

        return (
          coincideBusqueda &&
          coincideModulo &&
          coincideResultado
        );
      })
      .sort(
        (a, b) =>
          b.fecha.getTime() - a.fecha.getTime()
      );
  }

  get totalRegistros(): number {
    return this.registros.length;
  }

  get accionesExitosas(): number {
    return this.registros.filter(
      registro => registro.resultado === 'Exitoso'
    ).length;
  }

  get accionesFallidas(): number {
    return this.registros.filter(
      registro => registro.resultado === 'Fallido'
    ).length;
  }

  get usuariosActivos(): number {
    return new Set(
      this.registros
        .filter(registro => registro.rol !== 'Sin rol')
        .map(registro => registro.usuario)
    ).size;
  }

  limpiarFiltros(): void {
    this.busqueda = '';
    this.filtroModulo = 'Todos';
    this.filtroResultado = 'Todos';
  }

  exportarBitacora(): void {
    const encabezados = [
      'Usuario',
      'Rol',
      'Acción',
      'Módulo',
      'Descripción',
      'Fecha',
      'Resultado'
    ];

    const filas = this.registrosFiltrados.map(
      registro => [
        registro.usuario,
        registro.rol,
        registro.accion,
        registro.modulo,
        registro.descripcion,
        registro.fecha.toLocaleString('es-MX'),
        registro.resultado
      ]
    );

    const contenido = [
      encabezados,
      ...filas
    ]
      .map(fila =>
        fila
          .map(valor =>
            `"${String(valor).replace(/"/g, '""')}"`
          )
          .join(',')
      )
      .join('\n');

    const archivo = new Blob(
      ['\uFEFF' + contenido],
      {
        type: 'text/csv;charset=utf-8;'
      }
    );

    const enlace = document.createElement('a');

    enlace.href = URL.createObjectURL(archivo);
    enlace.download = 'bitacora-abarrotes-el-pedernal.csv';
    enlace.click();

    URL.revokeObjectURL(enlace.href);
  }
}

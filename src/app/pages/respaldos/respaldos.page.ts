import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonCheckbox, IonContent, IonInput, IonItem, IonLabel } from '@ionic/angular/standalone';
import { Auth } from '../../services/auth';

interface Respaldo {
  id: number;
  nombre: string;
  fecha: string;
  usuario: string;
  tipo: 'Manual' | 'Emergencia';
  tamanio: string;
  estado: 'Completado' | 'Fallido';
  tablas: number;
}

interface DatosRespaldo {
  sistema: 'Abarrotes El Pedernal';
  version: 2;
  fechaCreacion: string;
  usuario: string;
  datos: Record<string, unknown>;
  checksum: string;
}

interface VistaPrevia { fecha: string; usuario: string; version: number; tamanio: string; claves: Array<{ clave: string; registros: number }>; advertencias: string[]; }

@Component({
  selector: 'app-respaldos',
  templateUrl: './respaldos.page.html',
  styleUrls: ['./respaldos.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonButton, IonCheckbox, IonContent, IonInput, IonItem, IonLabel],
})
export class RespaldosPage {
  private readonly auth = inject(Auth);
  private readonly claveHistorial = 'respaldosHistorial';
  private readonly claveContenidos = 'respaldosContenido';
  private readonly maximoArchivo = 5 * 1024 * 1024;
  private readonly clavesPermitidas = ['usuarios', 'proveedores', 'movimientosCaja', 'inventario', 'productos', 'clientes', 'fiados', 'bitacora', 'configuracion', 'satConfiguracion', 'satMovimientos', 'satDocumentos'];

  creandoRespaldo = false;
  restaurandoRespaldo = false;
  mensaje = '';
  tipoMensaje: 'exito' | 'error' | '' = '';
  archivoSeleccionado: File | null = null;
  datosSeleccionados: DatosRespaldo | null = null;
  vistaPrevia: VistaPrevia | null = null;
  seleccion: Record<string, boolean> = {};
  textoConfirmacion = '';
  passwordConfirmacion = '';
  respaldos: Respaldo[] = this.cargarHistorial();

  get respaldosExitosos(): number { return this.respaldos.filter((item) => item.estado === 'Completado').length; }
  get respaldosFallidos(): number { return this.respaldos.filter((item) => item.estado === 'Fallido').length; }
  get ultimoRespaldo(): Respaldo | null { return this.respaldos.find((item) => item.estado === 'Completado') ?? null; }

  crearRespaldo(): void {
    this.creandoRespaldo = true;
    this.limpiarMensaje();
    try {
      const datos = this.construirRespaldo();
      const nombre = `respaldo-pedernal-${this.fechaArchivo(new Date())}.json`;
      this.descargarArchivo(nombre, JSON.stringify(datos, null, 2));
      this.registrarRespaldo(nombre, datos, 'Manual');
      this.mostrarMensaje('Respaldo real creado, validado y descargado correctamente.', 'exito');
    } catch {
      this.mostrarMensaje('No fue posible crear el respaldo. Revisa el espacio disponible del navegador.', 'error');
    } finally {
      this.creandoRespaldo = false;
    }
  }

  seleccionarArchivo(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0] ?? null;
    this.limpiarSeleccion();
    if (!archivo) return;
    if (!archivo.name.toLowerCase().endsWith('.json') || archivo.size > this.maximoArchivo) {
      this.mostrarMensaje('Selecciona un JSON válido de hasta 5 MB.', 'error');
      input.value = '';
      return;
    }
    const lector = new FileReader();
    lector.onload = () => {
      try {
        const contenido = String(lector.result);
        const datos = JSON.parse(contenido) as DatosRespaldo;
        this.validarRespaldo(datos);
        this.archivoSeleccionado = archivo;
        this.datosSeleccionados = datos;
        const claves = Object.keys(datos.datos).map((clave) => ({ clave, registros: this.contar(datos.datos[clave]) }));
        this.seleccion = claves.reduce<Record<string, boolean>>((seleccion, item) => {
          seleccion[item.clave] = true;
          return seleccion;
        }, {});
        this.vistaPrevia = { fecha: datos.fechaCreacion, usuario: datos.usuario, version: datos.version, tamanio: this.formatearBytes(archivo.size), claves, advertencias: this.crearAdvertencias(datos) };
        this.mostrarMensaje('Respaldo validado. Revisa la vista previa antes de restaurar.', 'exito');
      } catch (error) {
        this.mostrarMensaje(error instanceof Error ? error.message : 'El archivo no es válido.', 'error');
        input.value = '';
      }
    };
    lector.onerror = () => this.mostrarMensaje('No fue posible leer el archivo.', 'error');
    lector.readAsText(archivo);
  }

  restaurarRespaldo(): void {
    if (!this.datosSeleccionados || !this.archivoSeleccionado) return;
    if (this.textoConfirmacion !== 'RESTAURAR') { this.mostrarMensaje('Escribe RESTAURAR para confirmar.', 'error'); return; }
    if (!this.auth.validarPasswordActual(this.passwordConfirmacion)) { this.mostrarMensaje('La contraseña del administrador no es correcta.', 'error'); return; }
    const claves = Object.keys(this.datosSeleccionados.datos).filter((clave) => this.seleccion[clave]);
    if (!claves.length) { this.mostrarMensaje('Selecciona al menos un conjunto de datos.', 'error'); return; }

    this.restaurandoRespaldo = true;
    try {
      const emergencia = this.construirRespaldo();
      this.registrarRespaldo(`emergencia-antes-restaurar-${this.fechaArchivo(new Date())}.json`, emergencia, 'Emergencia');
      claves.forEach((clave) => localStorage.setItem(clave, JSON.stringify(this.datosSeleccionados?.datos[clave])));
      this.registrarEventoBitacora(`Restauración de respaldo: ${claves.join(', ')}`);
      this.mostrarMensaje(`Restauración completada. Se recuperaron ${claves.length} conjuntos y se creó una copia de emergencia.`, 'exito');
      this.limpiarSeleccion();
    } catch {
      this.mostrarMensaje('La restauración falló. Los datos previos permanecen disponibles en la copia de emergencia.', 'error');
    } finally {
      this.restaurandoRespaldo = false;
    }
  }

  descargarRespaldo(respaldo: Respaldo): void {
    const contenidos = this.cargarContenidos();
    const datos = contenidos[String(respaldo.id)];
    if (!datos) { this.mostrarMensaje('El contenido de este registro antiguo no está disponible.', 'error'); return; }
    this.descargarArchivo(respaldo.nombre, JSON.stringify(datos, null, 2));
  }

  eliminarRespaldo(respaldo: Respaldo): void {
    if (!confirm(`¿Eliminar ${respaldo.nombre} del historial local?`)) return;
    this.respaldos = this.respaldos.filter((item) => item.id !== respaldo.id);
    const contenidos = this.cargarContenidos();
    delete contenidos[String(respaldo.id)];
    localStorage.setItem(this.claveContenidos, JSON.stringify(contenidos));
    this.guardarHistorial();
    this.mostrarMensaje('Respaldo eliminado del almacenamiento local.', 'exito');
  }

  private construirRespaldo(): DatosRespaldo {
    const datos: Record<string, unknown> = {};
    this.clavesPermitidas.forEach((clave) => {
      const valor = localStorage.getItem(clave);
      if (valor !== null) {
        try { datos[clave] = JSON.parse(valor); } catch { datos[clave] = valor; }
      }
    });
    const base = { sistema: 'Abarrotes El Pedernal' as const, version: 2 as const, fechaCreacion: new Date().toISOString(), usuario: localStorage.getItem('usuario') ?? 'Administrador', datos };
    return { ...base, checksum: this.checksum(JSON.stringify(base)) };
  }

  private validarRespaldo(datos: DatosRespaldo): void {
    if (datos?.sistema !== 'Abarrotes El Pedernal' || datos.version !== 2 || !datos.datos || typeof datos.datos !== 'object') throw new Error('El archivo no pertenece a este sistema o su versión no es compatible.');
    const claves = Object.keys(datos.datos);
    if (!claves.length || claves.some((clave) => !this.clavesPermitidas.includes(clave))) throw new Error('El respaldo contiene una estructura no permitida.');
    const { checksum, ...base } = datos;
    if (checksum !== this.checksum(JSON.stringify(base))) throw new Error('La integridad del archivo no es válida; pudo ser modificado o estar incompleto.');
  }

  private registrarRespaldo(nombre: string, datos: DatosRespaldo, tipo: 'Manual' | 'Emergencia'): void {
    const contenido = JSON.stringify(datos);
    const id = this.respaldos.length ? Math.max(...this.respaldos.map((item) => item.id)) + 1 : 1;
    const registro: Respaldo = { id, nombre, fecha: datos.fechaCreacion, usuario: datos.usuario, tipo, tamanio: this.formatearBytes(new Blob([contenido]).size), estado: 'Completado', tablas: Object.keys(datos.datos).length };
    this.respaldos = [registro, ...this.respaldos].slice(0, 20);
    const contenidos = this.cargarContenidos();
    contenidos[String(id)] = datos;
    const idsVigentes = new Set(this.respaldos.map((item) => String(item.id)));
    Object.keys(contenidos).filter((clave) => !idsVigentes.has(clave)).forEach((clave) => delete contenidos[clave]);
    localStorage.setItem(this.claveContenidos, JSON.stringify(contenidos));
    this.guardarHistorial();
  }

  private cargarHistorial(): Respaldo[] { try { const datos = JSON.parse(localStorage.getItem(this.claveHistorial) ?? '[]') as Respaldo[]; return Array.isArray(datos) ? datos : []; } catch { return []; } }
  private guardarHistorial(): void { localStorage.setItem(this.claveHistorial, JSON.stringify(this.respaldos)); }
  private cargarContenidos(): Record<string, DatosRespaldo> { try { return JSON.parse(localStorage.getItem(this.claveContenidos) ?? '{}') as Record<string, DatosRespaldo>; } catch { return {}; } }
  private crearAdvertencias(datos: DatosRespaldo): string[] { const avisos = ['La restauración reemplazará únicamente los conjuntos seleccionados.']; if ('usuarios' in datos.datos) avisos.push('Este archivo contiene cuentas y contraseñas del prototipo; guárdalo en un lugar seguro.'); if (localStorage.getItem('estadoCaja') === 'ABIERTA') avisos.push('Cierra la caja antes de restaurar movimientos.'); return avisos; }
  private contar(valor: unknown): number { return Array.isArray(valor) ? valor.length : valor && typeof valor === 'object' ? Object.keys(valor).length : 1; }
  private checksum(texto: string): string { let hash = 2166136261; for (let i = 0; i < texto.length; i += 1) { hash ^= texto.charCodeAt(i); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16).padStart(8, '0'); }
  private registrarEventoBitacora(accion: string): void { let eventos: unknown[] = []; try { eventos = JSON.parse(localStorage.getItem('bitacora') ?? '[]') as unknown[]; } catch { eventos = []; } eventos.unshift({ fecha: new Date().toISOString(), usuario: localStorage.getItem('usuario'), accion }); localStorage.setItem('bitacora', JSON.stringify(eventos)); }
  private descargarArchivo(nombre: string, contenido: string): void { const url = URL.createObjectURL(new Blob([contenido], { type: 'application/json;charset=utf-8' })); const enlace = document.createElement('a'); enlace.href = url; enlace.download = nombre; enlace.click(); URL.revokeObjectURL(url); }
  private fechaArchivo(fecha: Date): string { return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}-${String(fecha.getHours()).padStart(2, '0')}${String(fecha.getMinutes()).padStart(2, '0')}`; }
  private formatearBytes(bytes: number): string { return bytes < 1048576 ? `${(bytes / 1024).toFixed(2)} KB` : `${(bytes / 1048576).toFixed(2)} MB`; }
  private limpiarSeleccion(): void { this.archivoSeleccionado = null; this.datosSeleccionados = null; this.vistaPrevia = null; this.seleccion = {}; this.textoConfirmacion = ''; this.passwordConfirmacion = ''; }
  private mostrarMensaje(texto: string, tipo: 'exito' | 'error'): void { this.mensaje = texto; this.tipoMensaje = tipo; }
  private limpiarMensaje(): void { this.mensaje = ''; this.tipoMensaje = ''; }
}

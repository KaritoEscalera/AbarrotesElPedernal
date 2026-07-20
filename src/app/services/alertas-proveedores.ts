import { Injectable, inject } from '@angular/core';
import { BusinessApi } from './business-api';

interface ProveedorEntrega { id: number; empresa: string; diaEntrega: string | null; estado: string; }
export interface AlertaProveedor { id: string; proveedor: string; fecha: Date; dias: number; mensaje: string; }

@Injectable({ providedIn: 'root' })
export class AlertasProveedores {
  private readonly api = inject(BusinessApi);
  private readonly claveAvisadas = 'alertasProveedorAvisadas';
  alertas: AlertaProveedor[] = [];
  cargando = false;

  async actualizar(reproducir = false): Promise<void> {
    if (this.cargando || !localStorage.getItem('token')) return;
    this.cargando = true;
    try {
      const proveedores = await this.api.get<ProveedorEntrega[]>('providers');
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      this.alertas = proveedores
        .filter((p) => p.estado === 'ACTIVO' && p.diaEntrega?.trim())
        .reduce<AlertaProveedor[]>((todas, proveedor) => [...todas, ...this.proximasEntregas(proveedor, hoy)], [])
        .filter((a) => a.dias <= 2)
        .sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
      const nuevas = this.alertas.filter((a) => !this.avisadas().has(a.id));
      if (nuevas.length && reproducir) {
        this.campanitas();
        this.notificacionNativa(nuevas);
        const avisadas = this.avisadas(); nuevas.forEach((a) => avisadas.add(a.id));
        localStorage.setItem(this.claveAvisadas, JSON.stringify([...avisadas].slice(-100)));
      }
    } catch { this.alertas = []; }
    finally { this.cargando = false; }
  }

  async solicitarPermiso(): Promise<'granted' | 'denied' | 'unsupported'> {
    if (!('Notification' in window)) return 'unsupported';
    const permiso = await Notification.requestPermission();
    if (permiso === 'granted') { await this.actualizar(false); this.campanitas(); }
    return permiso === 'granted' ? 'granted' : 'denied';
  }

  private proximasEntregas(proveedor: ProveedorEntrega, hoy: Date): AlertaProveedor[] {
    const dias = this.diasSemana(proveedor.diaEntrega ?? '');
    return dias.map((dia) => {
      const diferencia = (dia - hoy.getDay() + 7) % 7;
      const fecha = new Date(hoy); fecha.setDate(hoy.getDate() + diferencia);
      const id = `${proveedor.id}-${this.fechaIso(fecha)}`;
      const mensaje = diferencia === 0 ? `${proveedor.empresa} llega hoy` : `${proveedor.empresa} llega ${diferencia === 1 ? 'mañana' : 'en 2 días'}`;
      return { id, proveedor: proveedor.empresa, fecha, dias: diferencia, mensaje };
    });
  }

  private diasSemana(texto: string): number[] {
    const normal = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const nombres: Array<[string, number]> = [['domingo',0],['lunes',1],['martes',2],['miercoles',3],['jueves',4],['viernes',5],['sabado',6]];
    return nombres.filter(([nombre]) => normal.includes(nombre)).map(([, dia]) => dia);
  }

  private avisadas(): Set<string> {
    try { const value = JSON.parse(localStorage.getItem(this.claveAvisadas) ?? '[]'); return new Set(Array.isArray(value) ? value : []); }
    catch { return new Set(); }
  }

  private notificacionNativa(alertas: AlertaProveedor[]): void {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const detalle = alertas.slice(0, 3).map((a) => a.mensaje).join(' · ');
    new Notification('Entregas de proveedores', { body: detalle, icon: 'assets/icon/favicon.png', tag: 'proveedores-entregas' });
  }

  private campanitas(): void {
    try {
      const Audio = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) return;
      const context = new Audio();
      const inicio = context.currentTime;
      [659.25, 783.99, 987.77].forEach((frecuencia, index) => {
        const oscillator = context.createOscillator(); const gain = context.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = frecuencia;
        gain.gain.setValueAtTime(0.0001, inicio + index * .13);
        gain.gain.exponentialRampToValueAtTime(.14, inicio + index * .13 + .02);
        gain.gain.exponentialRampToValueAtTime(.0001, inicio + index * .13 + .55);
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.start(inicio + index * .13); oscillator.stop(inicio + index * .13 + .58);
      });
      window.setTimeout(() => void context.close(), 1200);
    } catch { /* El navegador puede bloquear audio antes de la primera interacción. */ }
  }

  private fechaIso(fecha: Date): string { return `${fecha.getFullYear()}-${String(fecha.getMonth()+1).padStart(2,'0')}-${String(fecha.getDate()).padStart(2,'0')}`; }
}

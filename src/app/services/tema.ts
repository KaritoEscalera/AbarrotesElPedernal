import { Injectable } from '@angular/core';

export type ModoTema = 'claro' | 'oscuro' | 'automatico';

@Injectable({ providedIn: 'root' })
export class TemaService {
  private readonly clave = 'temaPreferido';
  private readonly sistemaOscuro = window.matchMedia('(prefers-color-scheme: dark)');
  modo: ModoTema = this.leerModo();
  oscuro = false;

  constructor() {
    this.aplicar();
    this.sistemaOscuro.addEventListener('change', () => { if (this.modo === 'automatico') this.aplicar(); });
  }

  seleccionar(modo: ModoTema): void {
    this.modo = modo;
    localStorage.setItem(this.clave, modo);
    this.aplicar();
  }

  private aplicar(): void {
    this.oscuro = this.modo === 'oscuro' || (this.modo === 'automatico' && this.sistemaOscuro.matches);
    document.documentElement.classList.toggle('theme-dark', this.oscuro);
    document.documentElement.classList.toggle('theme-light', !this.oscuro);
    document.documentElement.style.colorScheme = this.oscuro ? 'dark' : 'light';
  }

  private leerModo(): ModoTema {
    const guardado = localStorage.getItem(this.clave);
    return guardado === 'claro' || guardado === 'oscuro' || guardado === 'automatico' ? guardado : 'automatico';
  }
}

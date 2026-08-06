import { Injectable, OnDestroy, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';
import { OfflineStorage } from './offline-storage';

@Injectable({ providedIn: 'root' })
export class ConnectivityService implements OnDestroy {
  private readonly storage = inject(OfflineStorage);
  private readonly state = new BehaviorSubject<boolean>(navigator.onLine);
  readonly online$ = this.state.asObservable();
  private timer?: number;
  private checking = false;

  private readonly onOnline = (): void => { void this.checkNow(); };
  private readonly onOffline = (): void => this.state.next(false);

  constructor() {
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    this.timer = window.setInterval(() => { void this.checkNow(); }, 30_000);
    void this.checkNow();
  }

  get online(): boolean { return this.state.value; }

  /** La red del dispositivo puede estar disponible aunque la API no responda. */
  get deviceOnline(): boolean { return navigator.onLine; }

  get pendingSales(): number {
    try {
      const pending = JSON.parse(localStorage.getItem('ventasPendientesSync') ?? '[]') as unknown[];
      return Array.isArray(pending) ? pending.length : 0;
    } catch {
      return 0;
    }
  }

  async checkNow(): Promise<boolean> {
    if (this.checking) return this.online;
    if (!navigator.onLine) {
      this.state.next(false);
      return false;
    }
    this.checking = true;
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 4_000);
      try {
        let available = false;
        try {
          const response = await fetch(`${environment.apiUrl}/health`, { cache: 'no-store', signal: controller.signal });
          available = response.ok;
        } catch (error) {
          // Un CORS mal configurado no significa que el servidor esté caído. Una
          // petición opaca permite distinguirlo de una caída real de red/API.
          if (controller.signal.aborted) throw error;
          const response = await fetch(`${environment.apiUrl}/health`, {
            cache: 'no-store',
            mode: 'no-cors',
            signal: controller.signal,
          });
          available = response.type === 'opaque' || response.ok;
        }
        this.state.next(available);
        if (available) this.storage.saveCache('health', { checkedAt: new Date().toISOString() });
      } finally {
        window.clearTimeout(timeout);
      }
    } catch {
      this.state.next(false);
    } finally {
      this.checking = false;
    }
    return this.online;
  }

  ngOnDestroy(): void {
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    if (this.timer) window.clearInterval(this.timer);
  }
}

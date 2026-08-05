import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { OfflineStorage } from './offline-storage';

@Injectable({ providedIn: 'root' })
export class BusinessApi {
  private readonly http = inject(HttpClient, { optional: true });
  private readonly offline = inject(OfflineStorage);
  private readonly url = environment.apiUrl;

  async get<T>(path: string): Promise<T> {
    try {
      const value = await firstValueFrom(this.client().get<T>(`${this.url}/${path}`));
      this.offline.saveCache(path, value);
      return value;
    } catch (error) {
      const status = error instanceof HttpErrorResponse ? error.status : 0;
      const cached = this.offline.readCache<T>(path);
      if ((status === 0 || !navigator.onLine) && cached !== null) return cached;
      throw error;
    }
  }
  post<T>(path: string, body: unknown): Promise<T> { return firstValueFrom(this.client().post<T>(`${this.url}/${path}`, body)); }
  put(path: string, body: unknown): Promise<void> { return firstValueFrom(this.client().put<void>(`${this.url}/${path}`, body)); }
  patch<T>(path: string, body: unknown): Promise<T> { return firstValueFrom(this.client().patch<T>(`${this.url}/${path}`, body)); }
  delete(path: string): Promise<void> { return firstValueFrom(this.client().delete<void>(`${this.url}/${path}`)); }

  private client(): HttpClient { if (!this.http) throw new Error('HttpClient no disponible.'); return this.http; }
}

import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class BusinessApi {
  private readonly http = inject(HttpClient, { optional: true });
  private readonly url = environment.apiUrl;

  get<T>(path: string): Promise<T> { return firstValueFrom(this.client().get<T>(`${this.url}/${path}`)); }
  post<T>(path: string, body: unknown): Promise<T> { return firstValueFrom(this.client().post<T>(`${this.url}/${path}`, body)); }
  put(path: string, body: unknown): Promise<void> { return firstValueFrom(this.client().put<void>(`${this.url}/${path}`, body)); }
  patch<T>(path: string, body: unknown): Promise<T> { return firstValueFrom(this.client().patch<T>(`${this.url}/${path}`, body)); }
  delete(path: string): Promise<void> { return firstValueFrom(this.client().delete<void>(`${this.url}/${path}`)); }

  private client(): HttpClient { if (!this.http) throw new Error('HttpClient no disponible.'); return this.http; }
}

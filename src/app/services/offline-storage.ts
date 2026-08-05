import { Injectable } from '@angular/core';

interface CacheEnvelope<T> {
  savedAt: string;
  value: T;
}

interface OfflineCredential {
  correo: string;
  nombre: string;
  rol: string;
  salt: string;
  verifier: string;
  savedAt: string;
}

@Injectable({ providedIn: 'root' })
export class OfflineStorage {
  private readonly cachePrefix = 'pedernal:cache:';
  private readonly credentialKey = 'pedernal:offline-credential';

  saveCache<T>(path: string, value: T): void {
    const envelope: CacheEnvelope<T> = { savedAt: new Date().toISOString(), value };
    localStorage.setItem(this.cachePrefix + path, JSON.stringify(envelope));
  }

  readCache<T>(path: string): T | null {
    try {
      const raw = localStorage.getItem(this.cachePrefix + path);
      if (!raw) return null;
      const envelope = JSON.parse(raw) as CacheEnvelope<T>;
      return envelope?.value ?? null;
    } catch {
      return null;
    }
  }

  cacheDate(path: string): Date | null {
    try {
      const raw = localStorage.getItem(this.cachePrefix + path);
      if (!raw) return null;
      const envelope = JSON.parse(raw) as CacheEnvelope<unknown>;
      return envelope.savedAt ? new Date(envelope.savedAt) : null;
    } catch {
      return null;
    }
  }

  async saveOfflineCredential(correo: string, password: string, nombre: string, rol: string): Promise<void> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const verifier = await this.deriveVerifier(correo, password, salt);
    const credential: OfflineCredential = {
      correo: correo.trim().toLowerCase(),
      nombre,
      rol,
      salt: this.toBase64(salt),
      verifier: this.toBase64(verifier),
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(this.credentialKey, JSON.stringify(credential));
  }

  async verifyOfflineCredential(correo: string, password: string): Promise<{ nombre: string; rol: string } | null> {
    try {
      const raw = localStorage.getItem(this.credentialKey);
      if (!raw) return null;
      const credential = JSON.parse(raw) as OfflineCredential;
      if (credential.correo !== correo.trim().toLowerCase()) return null;
      const actual = await this.deriveVerifier(correo, password, this.fromBase64(credential.salt));
      const expected = this.fromBase64(credential.verifier);
      if (actual.length !== expected.length) return null;
      let difference = 0;
      for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
      return difference === 0 ? { nombre: credential.nombre, rol: credential.rol } : null;
    } catch {
      return null;
    }
  }

  private async deriveVerifier(correo: string, password: string, salt: Uint8Array): Promise<Uint8Array> {
    const material = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(`${correo.trim().toLowerCase()}\u0000${password}`),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: salt.buffer as ArrayBuffer, iterations: 150_000 },
      material,
      256,
    );
    return new Uint8Array(bits);
  }

  private toBase64(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  private fromBase64(value: string): Uint8Array {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  }
}

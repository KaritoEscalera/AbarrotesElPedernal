import { TestBed } from '@angular/core/testing';
import { OfflineStorage } from './offline-storage';

describe('OfflineStorage', () => {
  let service: OfflineStorage;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(OfflineStorage);
  });

  afterEach(() => localStorage.clear());

  it('stores and retrieves cached API data', () => {
    const products = [{ id: 1, nombre: 'Arroz', stock: 5 }];
    service.saveCache('products', products);
    expect(service.readCache<typeof products>('products')).toEqual(products);
    expect(service.cacheDate('products')).not.toBeNull();
  });

  it('validates only the password previously authorized online', async () => {
    await service.saveOfflineCredential('CAJA@PEDERNAL.COM', 'secreto123', 'Caja', 'Cajera');

    expect(await service.verifyOfflineCredential('caja@pedernal.com', 'secreto123'))
      .toEqual({ nombre: 'Caja', rol: 'Cajera' });
    expect(await service.verifyOfflineCredential('caja@pedernal.com', 'incorrecta')).toBeNull();
  });
});

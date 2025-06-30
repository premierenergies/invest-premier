
// IndexedDB storage utility for large datasets
export class LargeDataStorage {
  private dbName = 'InvestorAnalyticsDB';
  private version = 1;
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object stores
        if (!db.objectStoreNames.contains('monthlyData')) {
          db.createObjectStore('monthlyData', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('uploadedFiles')) {
          db.createObjectStore('uploadedFiles', { keyPath: 'id' });
        }
      };
    });
  }

  async setItem(storeName: string, key: string, data: any): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put({ id: key, data });
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getItem(storeName: string, key: string): Promise<any> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.data : null);
      };
    });
  }

  async clear(storeName: string): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

// Singleton instance
export const largeDataStorage = new LargeDataStorage();

// Fallback to localStorage for small datasets
export const hybridStorage = {
  async setItem(key: string, data: any): Promise<void> {
    const serialized = JSON.stringify(data);
    
    // Try localStorage first for small data
    if (serialized.length < 2 * 1024 * 1024) { // 2MB threshold
      try {
        localStorage.setItem(key, serialized);
        return;
      } catch (error) {
        console.warn('localStorage full, switching to IndexedDB');
      }
    }
    
    // Use IndexedDB for large data
    await largeDataStorage.setItem('monthlyData', key, data);
  },

  async getItem(key: string): Promise<any> {
    // Try localStorage first
    const localData = localStorage.getItem(key);
    if (localData) {
      try {
        return JSON.parse(localData);
      } catch (error) {
        console.warn('Error parsing localStorage data, trying IndexedDB');
      }
    }
    
    // Try IndexedDB
    return await largeDataStorage.getItem('monthlyData', key);
  }
};

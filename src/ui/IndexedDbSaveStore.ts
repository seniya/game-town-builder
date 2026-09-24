// IndexedDB 저장 슬롯 (ARCHITECTURE 23.3, TASK-051). 슬롯 하나를 트랜잭션으로 통째로 바꾼다(구조화 복제, 문자열 인코딩 없음).
// 쓰기가 실패하면 트랜잭션이 되돌아가 이전 슬롯이 남는다. 게임 상태를 소유하지 않는 저장소 어댑터다.
import type { SaveData } from '../game/save/saveData';
import type { SaveStore } from '../game/systems/SaveSystem';

const DB = 'small-village';
const STORE = 'slots';
const SLOT = 'main';

/** DB 를 연다. */
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 를 열 수 없다'));
  });
}

/** 브라우저 저장 슬롯. */
export class IndexedDbSaveStore implements SaveStore {
  /** 슬롯을 바꾼다. */
  async write(data: SaveData): Promise<void> {
    const db = await open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(data, SLOT);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('저장에 실패했다'));
        tx.onabort = () => reject(tx.error ?? new Error('저장이 취소되었다'));
      });
    } finally {
      db.close();
    }
  }

  /** 슬롯을 읽는다. 없으면 null. */
  async read(): Promise<unknown> {
    const db = await open();
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(SLOT);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error ?? new Error('불러오기에 실패했다'));
      });
    } finally {
      db.close();
    }
  }

  /** 슬롯을 지운다(새로 시작). */
  async clear(): Promise<void> {
    const db = await open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(SLOT);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('지우기에 실패했다'));
      });
    } finally {
      db.close();
    }
  }
}

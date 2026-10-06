// Large card libraries (including uploaded images) exceed localStorage's quota.
// Store the entire snapshot atomically so current card, deck and library agree.
export function openLibraryStorage() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('lotr-card-library', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots');
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Feche outras abas do gerador e tente novamente.'));
    request.onsuccess = () => resolve(request.result);
  });
}

export function readLibrary(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readonly');
    const request = tx.objectStore('snapshots').get('library');
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}

export function writeLibrary(db, snapshot) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readwrite');
    tx.objectStore('snapshots').put(snapshot, 'library');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Não foi possível concluir o salvamento.'));
    tx.onerror = () => reject(tx.error);
  });
}

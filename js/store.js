/* ==========================================================================
   MindScape — on-device storage (IndexedDB). Notes never leave the browser.
   Stores: notes {id, title, body, created, updated}, vectors {key, vec}.
   ========================================================================== */

const DB = "mindscape";
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("notes", { keyPath: "id" });
      db.createObjectStore("vectors", { keyPath: "key" });
      db.createObjectStore("meta", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    let result;
    try {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      result = fn(s);
      t.oncomplete = () => resolve(result?.result ?? result);
      t.onerror = () => reject(t.error || new Error(`IndexedDB transaction failed: ${store}`));
      t.onabort = () => reject(t.error || new Error(`IndexedDB transaction aborted: ${store}`));
    } catch (error) {
      reject(error);
    }
  });
}

export const getAllNotes = () => tx("notes", "readonly", (s) => s.getAll());
export const putNote = (note) => tx("notes", "readwrite", (s) => s.put(note));
export const deleteNote = (id) => tx("notes", "readwrite", (s) => s.delete(id));
export const putNotes = (notes) => tx("notes", "readwrite", (s) => notes.forEach((n) => s.put(n)));
export const clearNotes = () => tx("notes", "readwrite", (s) => s.clear());

export const getVector = (key) => tx("vectors", "readonly", (s) => s.get(key)).then((r) => r?.vec || null);
export const putVectors = (entries) => tx("vectors", "readwrite", (s) => entries.forEach(([key, vec]) => s.put({ key, vec })));

export const getMeta = (key) => tx("meta", "readonly", (s) => s.get(key)).then((r) => r?.value);
export const setMeta = (key, value) => tx("meta", "readwrite", (s) => s.put({ key, value }));

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);

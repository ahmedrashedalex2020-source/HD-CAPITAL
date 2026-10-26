import { adminFirestore, isCloudFirestoreActive } from './firestoreClient';

export interface IRepository<T extends { id: string }> {
  readonly collectionName: string;
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | null>;
  save(entity: T): Promise<T>;
  update(id: string, partial: Partial<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
  replaceAll(entities: T[]): Promise<T[]>;
}

/**
 * In-memory collection map used ONLY when Cloud Firestore service account / ADC
 * credentials are not yet active in a local preview container.
 * Uses the exact same collection & subcollection path semantics (e.g. "leads", "leads/lead_101/activities", "leadPhones").
 */
const fallbackCollections = new Map<string, Map<string, Record<string, any>>>();

export function getFallbackCollection(pathKey: string): Map<string, Record<string, any>> {
  let col = fallbackCollections.get(pathKey);
  if (!col) {
    col = new Map<string, Record<string, any>>();
    fallbackCollections.set(pathKey, col);
  }
  return col;
}

export class FirestoreRepository<T extends { id: string }> implements IRepository<T> {
  constructor(
    public readonly collectionName: string,
    private readonly defaultSortField?: keyof T,
    private readonly defaultSortDirection: 'asc' | 'desc' = 'desc'
  ) {}

  async getAll(): Promise<T[]> {
    if (isCloudFirestoreActive()) {
      const colRef = adminFirestore.collection(this.collectionName);
      const snap = this.defaultSortField
        ? await colRef.orderBy(String(this.defaultSortField), this.defaultSortDirection).get()
        : await colRef.get();
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as T));
    }

    const col = getFallbackCollection(this.collectionName);
    const items = Array.from(col.values()).map((item) => ({ ...item } as T));
    if (this.defaultSortField) {
      const field = this.defaultSortField;
      const dir = this.defaultSortDirection === 'asc' ? 1 : -1;
      items.sort((a, b) => {
        const va = String(a[field] ?? '');
        const vb = String(b[field] ?? '');
        return va.localeCompare(vb) * dir;
      });
    }
    return items;
  }

  async getById(id: string): Promise<T | null> {
    if (!id) return null;
    if (isCloudFirestoreActive()) {
      const snap = await adminFirestore.collection(this.collectionName).doc(id).get();
      if (!snap.exists) return null;
      return { id: snap.id, ...(snap.data() as any) } as T;
    }

    const col = getFallbackCollection(this.collectionName);
    const found = col.get(id);
    return found ? ({ ...found } as T) : null;
  }

  async save(entity: T): Promise<T> {
    const clean = JSON.parse(JSON.stringify(entity));
    if (isCloudFirestoreActive()) {
      await adminFirestore.collection(this.collectionName).doc(entity.id).set(clean, { merge: true });
      return clean;
    }

    const col = getFallbackCollection(this.collectionName);
    col.set(entity.id, clean);
    return clean;
  }

  async update(id: string, partial: Partial<T>): Promise<T | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    const updated = { ...existing, ...partial, id };
    const clean = JSON.parse(JSON.stringify(updated));

    if (isCloudFirestoreActive()) {
      await adminFirestore.collection(this.collectionName).doc(id).set(clean, { merge: true });
      return clean;
    }

    const col = getFallbackCollection(this.collectionName);
    col.set(id, clean);
    return clean;
  }

  async delete(id: string): Promise<boolean> {
    if (isCloudFirestoreActive()) {
      await adminFirestore.collection(this.collectionName).doc(id).delete();
      return true;
    }

    const col = getFallbackCollection(this.collectionName);
    return col.delete(id);
  }

  async replaceAll(entities: T[]): Promise<T[]> {
    const cleaned = entities.map((e) => JSON.parse(JSON.stringify(e)) as T);
    if (isCloudFirestoreActive()) {
      const batch = adminFirestore.batch();
      const colRef = adminFirestore.collection(this.collectionName);
      const existingSnap = await colRef.get();
      const incomingIds = new Set(cleaned.map((e) => e.id));
      existingSnap.docs.forEach((docSnap) => {
        if (!incomingIds.has(docSnap.id)) {
          batch.delete(docSnap.ref);
        }
      });
      cleaned.forEach((entity) => {
        batch.set(colRef.doc(entity.id), entity, { merge: true });
      });
      await batch.commit();
      return cleaned;
    }

    const col = getFallbackCollection(this.collectionName);
    col.clear();
    cleaned.forEach((entity) => col.set(entity.id, entity));
    return cleaned;
  }
}

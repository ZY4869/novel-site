import { fetchAdminCategories } from './api.js';

let categoriesCache = [];
let categoriesPromise = null;
const listeners = new Set();

export function getAllCategories() {
  return categoriesCache;
}

function setCategories(next) {
  categoriesCache = Array.isArray(next) ? next : [];
  for (const fn of Array.from(listeners)) {
    try {
      fn(categoriesCache);
    } catch {}
  }
}

export function subscribeCategories(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function loadCategories() {
  if (!categoriesPromise) {
    categoriesPromise = fetchAdminCategories()
      .then((cats) => {
        setCategories(cats || []);
        categoriesPromise = null;
        return cats || [];
      })
      .catch((e) => {
        categoriesPromise = null;
        throw e;
      });
  }
  return categoriesPromise;
}


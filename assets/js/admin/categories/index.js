import { initCategoriesManagePage, loadCategoriesOrShowError } from './managePage.js';
import { initCategoryBooksOverlay, openCategoryBooksOverlay } from './booksOverlay.js';
import { initCategoryEditOverlay, openCategoryEditOverlay } from './editOverlay.js';
import { createCategoryPicker } from './picker.js';
import { getAllCategories, loadCategories, subscribeCategories } from './state.js';

export {
  initCategoriesManagePage,
  loadCategoriesOrShowError,
  initCategoryBooksOverlay,
  openCategoryBooksOverlay,
  initCategoryEditOverlay,
  openCategoryEditOverlay,
  createCategoryPicker,
  getAllCategories,
  loadCategories,
  subscribeCategories,
};

export function initCategories() {
  initCategoriesManagePage();
  initCategoryEditOverlay();
  initCategoryBooksOverlay();
}

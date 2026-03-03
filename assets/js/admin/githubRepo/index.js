import { initGitHubRepoConfigUi, loadGitHubRepoConfigUi } from './configUi.js';
import { initGitHubRepoContentUi } from './contentUi.js';

export function initGitHubRepo({ onNovelDone, onComicDone } = {}) {
  initGitHubRepoConfigUi();
  initGitHubRepoContentUi({ onNovelDone, onComicDone });
}

export async function loadGitHubRepoConfig() {
  await loadGitHubRepoConfigUi();
}


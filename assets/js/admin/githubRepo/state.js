let busy = false;
let lastConfig = null;

export function isBusy() {
  return busy;
}

export function setBusy(v) {
  busy = !!v;

  document
    .querySelectorAll(
      '#gh-repo-scan-novels-btn,#gh-repo-scan-comics-btn,#save-gh-repo-config-btn,#gh-repo-clear-token-btn,' +
        '#gh-repo-auto-category,#gh-repo-backfill-categories-btn,' +
        '#gh-repo-novels-select-all,#gh-repo-novels-batch-bind-btn,#gh-repo-novels-batch-sync-btn,' +
        '#gh-repo-add-repo-btn,#gh-repo-import-legacy-btn,#gh-repo-edit-save-btn,' +
        '#gh-repo-novels-repo-select,#gh-repo-comics-repo-select,#gh-repo-novels-up-btn,#gh-repo-novels-root-btn'
    )
    .forEach((btn) => {
      btn.disabled = busy;
    });

  document.querySelectorAll('#gh-repo-novels-list button, #gh-repo-comics-list button').forEach((btn) => {
    btn.disabled = busy;
  });

  document.querySelectorAll('#gh-repo-novels-list input.gh-novel-select').forEach((cb) => {
    cb.disabled = busy;
  });
}

export function setLastConfig(cfg) {
  lastConfig = cfg || null;
}

export function getLastConfig() {
  return lastConfig;
}

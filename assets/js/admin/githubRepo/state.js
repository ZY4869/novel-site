let busy = false;
let lastConfig = null;

export function isBusy() {
  return busy;
}

export function setBusy(v) {
  busy = !!v;

  document
    .querySelectorAll('#gh-repo-scan-novels-btn,#gh-repo-scan-comics-btn,#save-gh-repo-config-btn,#gh-repo-clear-token-btn')
    .forEach((btn) => {
      btn.disabled = busy;
    });

  document.querySelectorAll('#gh-repo-novels-list button, #gh-repo-comics-list button').forEach((btn) => {
    btn.disabled = busy;
  });
}

export function setLastConfig(cfg) {
  lastConfig = cfg || null;
}

export function getLastConfig() {
  return lastConfig;
}


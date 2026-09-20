import { triggerHaptic, showToast } from './modules/utils.js';
import { loadRoster, getRoster, getMeta, recomputeToday } from './modules/roster.js';
import {
  initRendering, renderScrollView, renderMonthView, reRenderAll, setRealTodayIndex, setCurrentIndex,
  getRealTodayIndex, getCurrentIndex, openNoteModal, closeNoteModal as closeNoteMod,
  jumpToDate, goToday, changeDay, switchTab, openScrollDay, saveNote as saveNoteMod, notesDB,
  switchMonth,
} from './modules/rendering.js';
import { initTheme, updateThemeIcon, toggleTheme as toggleThemeMod, openSettingsModal, openSwapModal, closeSettingsModal, closeSwapModal, closeCloudModal, openRosterModal, closeRosterModal, copyRosterTemplate, validateAndSaveRoster, resetRoster, clearAppState, openCloudModal, openSearchModal, closeSearchModal, openPrintModal, closePrintModal, openRosterSyncModal, closeRosterSyncModal, openBackupModal, closeBackupModal, buildBackup, restoreBackup, closeAllModals as closeAll } from './modules/modals.js';
import { initDutyAlerts, openAlertModal, closeAlertModal, saveAlertSettings, sendTestNotification } from './modules/alerts.js';
import { printRoster, setNotesDB } from './modules/print.js';
import { autoSelectRoster } from './modules/rosters.js';

/* Wire the global functions the HTML uses */
window.__openScrollDay = (i) => openScrollDay(i);
window.__openRosterModal = () => openRosterModal();
window.__openSwapModal = () => openSwapModal();
window.__openSettingsModal = () => openSettingsModal();
window.toggleTheme = toggleThemeMod;
window.openAlertModal = openAlertModal;
window.closeAlertModal = () => closeAlertModal();
window.saveAlertSettings = () => saveAlertSettings(() => {});
window.sendTestNotification = () => sendTestNotification(getRealTodayIndex());
window.addReminderRow = () => import('./modules/alerts.js').then(m => m.addReminderRow());
window.saveNote = () => saveNoteMod();
window.closeNoteModal = () => closeNoteMod();
window.printRoster = (style) => printRoster(getRealTodayIndex(), style);
window.openPrintModal = openPrintModal;
window.closePrintModal = closePrintModal;
window.switchTab = switchTab;
window.goToday = goToday;
window.changeDay = changeDay;
window.jumpToDateHack = null;
window.closeSettingsModal = closeSettingsModal;
window.closeSwapModal = closeSwapModal;
window.closeCloudModal = closeCloudModal;
window.openRosterModal = openRosterModal;
window.closeRosterModal = closeRosterModal;
window.copyRosterTemplate = copyRosterTemplate;
window.validateAndSaveRoster = validateAndSaveRoster;
window.resetRoster = resetRoster;
window.__clearAppState = () => { clearAppState(); return true; };
window.openCloudModal = openCloudModal;
window.openSettingsModal = openSettingsModal;
window.openSearchModal = openSearchModal;
window.closeSearchModal = closeSearchModal;
window.openRosterSyncModal = openRosterSyncModal;
window.closeRosterSyncModal = closeRosterSyncModal;
window.openBackupModal = openBackupModal;
window.closeBackupModal = closeBackupModal;
window.__buildBackup = buildBackup;
window.__restoreBackup = restoreBackup;

window.__jumpToIndex = (i) => jumpToDate(i);

window.__switchMonth = (dir) => switchMonth(dir);

window.__prevDayData = null;

function recomputeAndRender() {
  const idx = recomputeToday();
  setRealTodayIndex(idx);
  setCurrentIndex(Math.min(getCurrentIndex(), getRoster().length - 1));
  reRenderAll();
  updateTodayPill();
}

window.__recomputeAndRender = recomputeAndRender;

/* Re-render when swaps change */
document.addEventListener('roster-changed', () => {
  reRenderAll();
});

/* After a store roster is auto-loaded: re-sync today pill + reschedule duty alerts. */
function scheduleAfterAutoSelect() {
  updateTodayPill();
  import('./modules/alerts.js').then((m) => m.scheduleDutyAlerts()).catch(() => {});
}

function updateTodayPill() {
  const pill = document.getElementById('today-pill');
  if (!pill) return;
  const dailyActive = document.getElementById('view-daily').classList.contains('active');
  pill.classList.toggle('visible', dailyActive && getCurrentIndex() !== getRealTodayIndex());
}

/* Init events */
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadRoster();

  /* Static hosts (e.g. GitHub Pages) serve the raw source and never get the
     VitePWA-injected <link rel="manifest">, so add it at runtime when missing. */
  if (!document.querySelector('link[rel="manifest"]')) {
    const manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    manifestLink.href = './manifest.webmanifest';
    document.head.appendChild(manifestLink);
  }

  /* greeting */
  const hour = new Date().getHours();
  let greeting = 'Good Evening,';
  if (hour < 12) greeting = 'Good Morning,';
  else if (hour < 17) greeting = 'Good Afternoon,';
  const g = document.getElementById('greetingText');
  if (g) g.innerText = greeting;

  initRendering();
  updateTodayPill();
  setNotesDB(notesDB);

  /* view swipe */
  initViewSwipe();
  initCardLongPress();
  initLongPressNoteOpener();

  initDutyAlerts();
  initInstallPrompt();
  registerSW();

  /* Auto-pull the current month's roster from the GitHub roster store (best-effort,
     non-blocking). Swaps/alerts re-schedule if the month changed. */
  autoSelectRoster().then((r) => {
    if (r && r.loaded) {
      showToast(`Loaded ${r.meta.month} roster from GitHub ☁️`);
      scheduleAfterAutoSelect();
    }
  }).catch(() => {});

  /* parse URL query for PWA shortcuts */
  const params = new URLSearchParams(location.search);
  if (params.get('view') === 'month') switchTab('month');
  if (params.get('action') === 'note') openNoteModal(getRoster()[getRealTodayIndex()]?.date || '');

  /* keyboard */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeAll(); return; }
    const anyModal = document.querySelector('.modal-overlay.show');
    if (anyModal) return;
    if (e.key === 'ArrowLeft') changeDay(-1);
    else if (e.key === 'ArrowRight') changeDay(1);
  });
});

function initViewSwipe() {
  const container = document.querySelector('.view-container');
  if (!container) return;
  let startX = 0, startY = 0, axisLocked = null, tracking = false;

  container.addEventListener('touchstart', (e) => {
    const t = e.touches && e.touches[0];
    if (!t) return;
    startX = t.clientX; startY = t.clientY;
    tracking = true; axisLocked = null;
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (!tracking) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (!axisLocked) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8)
        axisLocked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
  }, { passive: true });

  container.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    if (axisLocked !== 'x') return;
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      const monthly = document.getElementById('view-month').classList.contains('active');
      if (dx < 0 && !monthly) switchTab('month', 'left');
      else if (dx > 0 && monthly) switchTab('daily', 'right');
    }
  }, { passive: true });

  container.addEventListener('touchcancel', () => { tracking = false; }, { passive: true });
}

function initCardLongPress() {
  const area = document.getElementById('daily-render-area');
  if (!area) return;
  let timer = null, sx = 0, sy = 0, longPressed = false;

  const openNoteForTarget = (e) => {
    const targetCard = e.target.closest('.upcoming-card');
    let dateKey;
    if (targetCard && targetCard.dataset.date) {
      dateKey = targetCard.dataset.date;
    } else {
      dateKey = getRoster()[getCurrentIndex()]?.date;
    }
    if (dateKey) openNoteModal(dateKey);
  };

  const start = (e) => {
    const t = e.touches ? e.touches[0] : e;
    sx = t.clientX; sy = t.clientY;
    if (timer) clearTimeout(timer);
    longPressed = false;
    timer = setTimeout(() => {
      timer = null; longPressed = true; triggerHaptic(50); openNoteForTarget(e);
    }, 400);
  };
  const move = (e) => {
    if (!timer) return;
    const t = e.touches ? e.touches[0] : e;
    if (Math.abs(t.clientX - sx) > 12 || Math.abs(t.clientY - sy) > 12) { clearTimeout(timer); timer = null; }
  };
  const end = (e) => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (longPressed) {
      longPressed = false;
      e.preventDefault();
    }
  };
  area.addEventListener('touchstart', start, { passive: true });
  area.addEventListener('touchmove', move, { passive: true });
  area.addEventListener('touchend', end);
  area.addEventListener('touchcancel', end, { passive: true });
  area.addEventListener('mousedown', start);
  area.addEventListener('mousemove', move);
  area.addEventListener('mouseup', end);
}

/* Long-press on the main card (non-upcoming) opens a note too */
function initLongPressNoteOpener() {
  const area = document.getElementById('daily-render-area');
  if (!area) return;
  area.addEventListener('dblclick', (e) => {
    const card = e.target.closest('.card.today');
    if (card && card.dataset.date) {
      triggerHaptic(30);
      openNoteModal(card.dataset.date);
    }
  });
}

/* ---- INSTALL PROMPT ---- */
let deferredPrompt = null;
function initInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!localStorage.getItem('mrinalInstallPrompted')) {
      setTimeout(() => {
        const modal = document.getElementById('install-modal');
        if (modal && deferredPrompt) modal.classList.add('show');
      }, 900);
    }
  });
  window.addEventListener('appinstalled', () => {
    localStorage.setItem('mrinalInstallPrompted', '1');
    const modal = document.getElementById('install-modal');
    if (modal) modal.classList.remove('show');
    showToast('App installed 🎉');
  });
}

window.dismissInstallPrompt = () => {
  localStorage.setItem('mrinalInstallPrompted', '1');
  const modal = document.getElementById('install-modal');
  if (modal) modal.classList.remove('show');
};
window.installPwa = () => {
  if (!deferredPrompt) { window.dismissInstallPrompt(); return; }
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(choice => {
    deferredPrompt = null;
    localStorage.setItem('mrinalInstallPrompted', '1');
    const modal = document.getElementById('install-modal');
    if (modal) modal.classList.remove('show');
  });
};

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

export { notesDB };
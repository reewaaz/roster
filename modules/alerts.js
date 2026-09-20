import { fmt12, showToast, triggerHaptic } from './utils.js';
import { getRoster, getMeta, getStart, getEnd, isExpired } from './roster.js';

const ALERT_KEY = 'mrinalDutyAlerts';
const ALERT_SETTINGS_KEY = 'mrinalDutyAlertSettings';
const DEFAULT_REMINDERS = [{ daysBefore: 0, time: 8 }, { daysBefore: 1, time: 20 }];
const DEFAULT_ALERT_SETTINGS = { hour: 8, reminders: DEFAULT_REMINDERS, types: ['picu-day', 'picu-24', 'opd', 'er-day'] };
const ALERT_TYPES = [
  { type: 'picu-day', label: 'PICU Day' },
  { type: 'picu-24', label: 'PICU 24h' },
  { type: 'opd', label: 'OPD' },
  { type: 'er-day', label: 'Day ER' },
];
let alertTimer = null;

export function alertSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(ALERT_SETTINGS_KEY) || 'null');
    if (!s || !Array.isArray(s.types) || !s.types.length) return Object.assign({}, DEFAULT_ALERT_SETTINGS);
    let reminders = s.reminders;
    if (!Array.isArray(reminders) || !reminders.length) {
      reminders = [{ daysBefore: 0, time: (Number.isFinite(s.hour) && (s.hour | 0) === s.hour) ? s.hour : 8 },
                   { daysBefore: 1, time: 20 }];
    }
    return {
      hour: reminders.find(r => r.daysBefore === 0) ? reminders.find(r => r.daysBefore === 0).time : (Number.isFinite(s.hour) ? s.hour : 8),
      reminders: reminders.filter(r => (r.daysBefore | 0) === r.daysBefore && Number.isFinite(r.time)),
      types: s.types,
    };
  } catch (e) {}
  return Object.assign({}, DEFAULT_ALERT_SETTINGS);
}

function dutyAlertEnabled() {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted' && localStorage.getItem(ALERT_KEY) === '1';
}

function dutyAlertTypes() {
  return alertSettings().types;
}

function isDutyAlertDay(day) {
  return day && dutyAlertTypes().includes(day.type);
}

export function refreshAlertButton() {
  const btn = document.getElementById('notif-toggle');
  if (!btn) return;
  const enabled = localStorage.getItem(ALERT_KEY) === '1' && typeof Notification !== 'undefined' && Notification.permission === 'granted';
  btn.innerText = enabled ? '🔔' : '🔕';
}

function indexToDate(index, start) {
  return new Date(start.getTime() + index * 86400000);
}

function nextAlertTarget(fromIndex, fromTime) {
  const roster = getRoster();
  const start = getStart();
  const reminders = alertSettings().reminders;
  let best = null;
  for (let i = fromIndex; i < roster.length; i++) {
    if (!isDutyAlertDay(roster[i])) continue;
    for (const r of reminders) {
      const dayIdx = i - r.daysBefore;
      if (dayIdx < 0) continue;
      const when = indexToDate(dayIdx, start);
      when.setHours(r.time, 0, 0, 0);
      if (when.getTime() > fromTime.getTime() && (!best || when.getTime() < best.when.getTime())) {
        best = { index: i, dayIdx, daysBefore: r.daysBefore, when };
      }
    }
  }
  return best;
}

export function findHandover(toIndex) {
  const roster = getRoster();
  for (let i = toIndex - 1; i >= 0; i--) {
    if (roster[i].type === 'picu-24') return roster[i].picu;
  }
  return null;
}

function buildDutyAlert(title, index) {
  const d = getRoster()[index];
  if (!d) return title;
  const parts = [];
  if (d.type === 'picu-24') {
    parts.push(`PICU 24h: ${d.picu}`);
    parts.push(`Ward/ER: ${d.ward}`);
    const handover = findHandover(index);
    if (handover) parts.push(`Take over from ${handover}`);
  } else if (d.type === 'picu-day') {
    parts.push(`PICU: ${d.picu}`);
    parts.push(`Ward/ER: ${d.ward}`);
  } else if (d.type === 'opd') {
    parts.push(`OPD: ${d.opd}`);
  } else if (d.type === 'er-day') {
    parts.push(`ER: ${d.er}`);
    parts.push(`Ward/ER: ${d.ward}`);
  } else {
    parts.push(d.title);
  }
  if (d.nicu && d.nicu !== '—') parts.push(`NICU: ${d.nicu}`);
  if (d.nagarHospital && d.nagarHospital.trim()) parts.push(`Nagar: ${d.nagarHospital}`);
  return `${title}\n${parts.slice(0, 6).join(' · ')}`;
}

function buildReminderAlert(index, daysBefore) {
  const d = getRoster()[index];
  if (!d) return '';
  const meta = getMeta();
  const month = meta.month.split(' ')[0];
  const dayNum = d.date.split('-')[1];
  const when = daysBefore === 0 ? `Today — ${month} ${dayNum} (${d.day})` : `${reminderDaysLabel(daysBefore)} — ${month} ${dayNum} (${d.day})`;
  const head = `${d.title} duty`;
  const body = buildDutyAlert(head, index);
  return { title: `${when} · ${d.title}`, body };
}

export function reminderDaysLabel(daysBefore) {
  if (daysBefore === 0) return 'Same day';
  if (daysBefore === 1) return '1 day before';
  if (daysBefore === 2) return '2 days before';
  return `${daysBefore} days before`;
}

export function buildTimeOptions(selectedHour) {
  return Array.from({ length: 18 }, (_, i) => i + 6).map(h => {
    const label = fmt12(h);
    return `<option value="${h}" ${h === selectedHour ? 'selected' : ''}>${label}</option>`;
  }).join('');
}

export function renderReminderRows(container) {
  const rows = document.getElementById('reminder-rows');
  if (!rows) return;
  const s = alertSettings();
  const list = (s.reminders && s.reminders.length ? s.reminders : DEFAULT_REMINDERS);
  rows.innerHTML = list.map((r, idx) => `
    <div class="reminder-row" data-ri="${idx}">
      <select class="reminder-days">
        ${[0, 1, 2, 3, 4, 5, 6].map(d => `<option value="${d}" ${d === r.daysBefore ? 'selected' : ''}>${reminderDaysLabel(d)}</option>`).join('')}
      </select>
      <select class="reminder-time">${buildTimeOptions(r.time)}</select>
      <button class="reminder-remove" data-action="remove" aria-label="Remove reminder">✕</button>
    </div>`).join('');
  rows.querySelectorAll('[data-action="remove"]').forEach((btn) => {
    btn.addEventListener('click', () => removeReminderRow(btn));
  });
  container.innerHTML += ''; // no-op to keep container referenced
}

export function addReminderRow() {
  const rows = document.getElementById('reminder-rows');
  if (!rows) return;
  const div = document.createElement('div');
  div.className = 'reminder-row';
  div.innerHTML = `
    <select class="reminder-days">${[0, 1, 2, 3, 4, 5, 6].map(d => `<option value="${d}">${reminderDaysLabel(d)}</option>`).join('')}</select>
    <select class="reminder-time">${buildTimeOptions(20)}</select>
    <button class="reminder-remove" data-action="remove" aria-label="Remove reminder">✕</button>`;
  rows.appendChild(div);
  div.querySelector('[data-action="remove"]').addEventListener('click', () => removeReminderRow(div.querySelector('[data-action="remove"]')));
}

export function removeReminderRow(btn) {
  const list = document.getElementById('reminder-rows');
  if (!list) return;
  if (list.children.length <= 1) { showToast('Keep at least one reminder'); return; }
  btn.closest('.reminder-row').remove();
  triggerHaptic(20);
}

export function collectReminders() {
  const list = document.getElementById('reminder-rows');
  if (!list) return DEFAULT_REMINDERS.slice();
  const out = [];
  list.querySelectorAll('.reminder-row').forEach(row => {
    const daysBefore = parseInt(row.querySelector('.reminder-days').value, 10);
    const time = parseInt(row.querySelector('.reminder-time').value, 10);
    out.push({ daysBefore, time });
  });
  if (!out.length) out.push({ daysBefore: 0, time: 8 });
  return out.sort((a, b) => a.daysBefore - b.daysBefore || a.time - b.time);
}

export function openAlertModal(container) {
  triggerHaptic(20);
  const s = alertSettings();
  const list = document.getElementById('alert-types-list');
  if (!list.children.length) {
    list.innerHTML = ALERT_TYPES.map(t =>
      `<label class="alert-type-label" data-t="${t.type}"><input class="alert-type" type="checkbox" value="${t.type}">${t.label}</label>`
    ).join('');
  }
  renderReminderRows(container);
  document.getElementById('alert-enabled').checked = localStorage.getItem(ALERT_KEY) === '1';
  list.querySelectorAll('.alert-type').forEach(ch => {
    ch.checked = s.types.includes(ch.value);
    const label = ch.closest('.alert-type-label');
    if (label) label.classList.toggle('checked', ch.checked);
  });
  const canNotif = typeof Notification !== 'undefined';
  document.getElementById('alert-enabled').disabled = !canNotif;
  document.getElementById('test-alert-btn').disabled = !canNotif;
  document.getElementById('alert-modal').classList.add('show');
}

export function closeAlertModal() {
  document.getElementById('alert-modal').classList.remove('show');
}

export function saveAlertSettings(cb) {
  const enabled = document.getElementById('alert-enabled').checked;
  const reminders = collectReminders();
  const types = Array.from(document.querySelectorAll('.alert-type:checked')).map(c => c.value);
  if (!types.length) { showToast('Pick at least one duty type'); return; }
  const same = reminders.find(r => r.daysBefore === 0);
  const hour = same ? same.time : reminders[0].time;
  localStorage.setItem(ALERT_SETTINGS_KEY, JSON.stringify({ hour, reminders, types }));

  if (!enabled) {
    localStorage.setItem(ALERT_KEY, '0');
    clearTimeout(alertTimer); alertTimer = null;
    refreshAlertButton();
    closeAlertModal();
    showToast('Duty alerts off');
    return;
  }

  if (typeof Notification === 'undefined') { showToast('Notifications not supported here'); closeAlertModal(); return; }
  if (Notification.permission === 'denied') {
    showToast('Notifications blocked in browser settings');
    refreshAlertButton();
    closeAlertModal();
    return;
  }
  const commit = () => {
    localStorage.setItem(ALERT_KEY, '1');
    refreshAlertButton();
    scheduleDutyAlerts();
    const when = reminders.map(r => `${reminderDaysLabel(r.daysBefore)} ${fmt12(r.time)}`).join(' · ');
    showToast(`Alerts on — ${when}`);
    closeAlertModal();
    if (cb) cb();
  };
  if (Notification.permission === 'granted') commit();
  else Notification.requestPermission().then(p => { if (p === 'granted') commit(); else { refreshAlertButton(); closeAlertModal(); } });
}

export function sendTestNotification(realTodayIndex) {
  if (typeof Notification === 'undefined') { showToast('Notifications not supported here (iOS Safari needs Safari settings or Chrome)'); return; }
  const go = () => {
    const roster = getRoster();
    const from = new Date(new Date().getTime() - 60000);
    const target = nextAlertTarget(realTodayIndex, from);
    const idx = target ? target.index : Math.min(realTodayIndex, roster.length - 1);
    dispatchNotification(idx, { isTest: true });
    const d = roster[idx];
    if (d) showToast(`🔔 Test: ${getMeta().month.split(' ')[0]} ${d.date.split('-')[1]} (${d.day}) ${d.title}`);
  };
  if (Notification.permission === 'granted') { go(); return; }
  if (Notification.permission === 'denied') { showToast('Notifications blocked — enable in browser site settings'); return; }
  Notification.requestPermission().then(p => { if (p === 'granted') go(); else showToast('Permission not granted'); });
}

async function dispatchNotification(index, opts) {
  const roster = getRoster();
  const isTest = opts && opts.isTest;
  const daysBefore = opts && opts.daysBefore != null ? opts.daysBefore : 0;
  if (index < 0 || index >= roster.length) return;
  const msg = buildReminderAlert(index, daysBefore);
  const tag = `duty-${daysBefore === 0 ? 'd' : 'r'}-${roster[index].date}`;
  const nOpts = {
    body: `${isTest ? '🔔 Test · ' : ''}${msg.body}`,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag,
    requireInteraction: false,
    data: { url: './index.html' },
  };
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(msg.title, nOpts);
      return;
    }
  } catch (e) {}
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(msg.title, nOpts);
    }
  } catch (e) {}
}

export function scheduleDutyAlerts() {
  clearTimeout(alertTimer); alertTimer = null;
  if (!dutyAlertEnabled()) return;
  const roster = getRoster();
  if (!roster.length) return;
  const realTodayIndex = Math.max(Math.min((new Date() - getStart()) / 86400000 | 0, roster.length - 1), 0);
  const from = new Date();
  const target = nextAlertTarget(realTodayIndex, from);
  if (!target) return;
  const wait = target.when.getTime() - from.getTime();
  alertTimer = setTimeout(() => {
    dispatchNotification(target.index, { daysBefore: target.daysBefore });
    scheduleDutyAlerts();
  }, Math.max(wait, 1000));
}

export function initDutyAlerts() {
  refreshAlertButton();
  scheduleDutyAlerts();
}
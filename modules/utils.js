export function triggerHaptic(ms = 30) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

export function showToast(msg) {
  const t = document.getElementById('app-toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.remove('show'), 2800);
}

export function fmt12(hour) {
  return `${(hour % 12) || 12}${hour >= 12 ? ' PM' : ' AM'}`;
}

export function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
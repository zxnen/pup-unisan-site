import { el, clear } from './dom.js';

export function loading(container, text = 'Loading…') {
  clear(container).append(el('p', { class: 'state state-loading', role: 'status' },
    el('span', { class: 'spinner', 'aria-hidden': 'true' }), ' ', text));
}
export function empty(container, title, hint) {
  clear(container).append(el('div', { class: 'state state-empty' },
    el('p', { class: 'state-title', text: title }), hint ? el('p', { text: hint }) : null));
}
export function failure(container, message, retry) {
  clear(container).append(el('div', { class: 'state state-error', role: 'alert' },
    el('p', { text: message }),
    retry ? el('button', { type: 'button', class: 'btn btn-quiet', onclick: retry, text: 'Try again' }) : null));
}
export function notice(kind, title, body) {
  return el('div', { class: `notice notice-${kind}`, role: kind === 'error' ? 'alert' : 'status' },
    el('strong', { text: title }), body ? el('span', { text: ' ' + body }) : null);
}

// Live-region toast for success / failure of actions.
export function announce(message, kind = 'success') {
  let host = document.getElementById('toasts');
  if (!host) {
    host = el('div', { id: 'toasts', class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(host);
  }
  const t = el('p', { class: `toast toast-${kind}`, text: message });
  host.append(t);
  setTimeout(() => t.remove(), kind === 'error' ? 8000 : 4000);
}

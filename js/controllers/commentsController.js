import { TURNSTILE_SITE_KEY } from '../config.js';
import { supabase } from '../supabaseClient.js';
import { el, formatDate } from '../views/dom.js';

const VISITOR_KEY = 'pup-unisan-visitor-id-v1';

export async function init() {
  const main = document.querySelector('.latest-announcements');
  if (!main) return;
  const section = el('section', { class: 'comments-panel', 'aria-labelledby': 'comments-title' });
  const list = el('div', { class: 'comments-list', 'aria-live': 'polite' }, el('p', { class: 'state', text: 'Loading comments…' }));
  section.append(el('h2', { id: 'comments-title', text: 'Comments' }),
    el('p', { class: 'muted', text: 'Share a message with the campus community.' }), list);
  const form = el('form', { class: 'comments-form' });
  const name = el('input', { class: 'form-control', type: 'text', name: 'display_name', maxlength: '80', required: true, autocomplete: 'name', placeholder: 'Your name', 'aria-label': 'Your name' });
  const comment = el('textarea', { class: 'form-control', name: 'body', maxlength: '1500', minlength: '3', rows: '3', required: true, placeholder: 'Write a comment…', 'aria-label': 'Write a comment' });
  const widget = el('div', { class: 'turnstile-widget', 'aria-label': 'Spam protection' });
  let turnstileWidgetId = null;
  const status = el('p', { class: 'comments-status', role: 'status', 'aria-live': 'polite' });
  const submit = el('button', { class: 'btn btn-maroon', type: 'submit', text: 'Post comment', disabled: true });
  form.append(name, comment, widget, submit, status);
  if (!TURNSTILE_SITE_KEY || TURNSTILE_SITE_KEY.startsWith('YOUR_')) {
    widget.append(el('p', { class: 'notice notice-warn', text: 'Comment submission is being configured. Please check back soon.' }));
  } else {
    widget.id = 'turnstile-comment-widget';
    form.addEventListener('submit', (event) => submitComment(event));
    loadTurnstile(() => {
      turnstileWidgetId = window.turnstile.render(widget, {
        sitekey: TURNSTILE_SITE_KEY,
        action: 'comment',
        callback: () => { submit.disabled = false; },
        'expired-callback': () => { submit.disabled = true; },
        'error-callback': () => { submit.disabled = true; status.textContent = 'Spam protection could not load. Refresh and try again.'; },
      });
    }).catch(() => { status.textContent = 'Spam protection could not load. Refresh and try again.'; });
  }
  section.append(form);
  main.append(section);

  async function loadComments() {
    if (!supabase) { list.replaceChildren(el('p', { class: 'state', text: 'Comments are temporarily unavailable.' })); return; }
    const { data, error } = await supabase.from('public_comments').select('display_name,body,created_at')
      .eq('status', 'approved').order('created_at', { ascending: false }).limit(6);
    if (error) { list.replaceChildren(el('p', { class: 'state', text: 'Comments are temporarily unavailable.' })); return; }
    if (!data.length) { list.replaceChildren(el('p', { class: 'state', text: 'Be the first to share your thoughts.' })); return; }
    list.replaceChildren(...data.map((item) => el('article', { class: 'public-comment' },
      el('div', { class: 'public-comment-head' }, el('strong', { text: item.display_name }), el('time', { datetime: item.created_at, text: formatDate(item.created_at) })),
      el('p', { text: item.body }))));
  }

  async function submitComment(event) {
    event.preventDefault();
    status.textContent = '';
    submit.disabled = true;
    try {
      const visitorId = getVisitorId();
      const token = window.turnstile.getResponse(turnstileWidgetId);
      const response = await fetch('/.netlify/functions/comments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitor_id: visitorId, display_name: name.value, body: comment.value, turnstile_token: token }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Your comment could not be submitted.');
      status.textContent = result.message;
      form.reset();
      await loadComments();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      if (window.turnstile && turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
    }
  }
  loadComments();
}

function getVisitorId() {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(VISITOR_KEY, id); }
    return id;
  } catch { return crypto.randomUUID(); }
}

function loadTurnstile(onReady) {
  if (window.turnstile) { onReady(); return Promise.resolve(); }
  if (window.__turnstileLoading) return window.__turnstileLoading.then(onReady);
  window.__turnstileLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true; script.defer = true;
    script.onload = resolve; script.onerror = reject;
    document.head.append(script);
  });
  return window.__turnstileLoading.then(onReady);
}

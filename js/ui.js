import { t } from './i18n.js';
import { effectiveMode } from './settings.js';

/** Minimal hyperscript: h('div.card#x', {onclick}, child, ...) */
export function h(sel, attrs, ...children) {
  if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) {
    children.unshift(attrs);
    attrs = {};
  }
  const [tag, ...rest] = sel.split(/(?=[.#])/);
  const el = document.createElement(tag || 'div');
  for (const part of rest) {
    if (part[0] === '.') el.classList.add(part.slice(1));
    else if (part[0] === '#') el.id = part.slice(1);
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [p, pv] of Object.entries(v)) {
        if (p.startsWith('--')) el.style.setProperty(p, pv);
        else el.style[p] = pv;
      }
    }
    else if (k === 'class') el.className += ` ${v}`;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** replaceChildren that skips null/false (the native one prints "null"). */
export const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));

export const pct = (p) => `${Math.round((p || 0) * 100)}%`;

/**
 * The "Jev's read" side panel: shows the probability distribution behind each move.
 * Usage:
 *   const panel = new ThinkPanel();  root.append(panel.el);
 *   panel.waiting();  panel.thinking();
 *   panel.show(result, { question: 'action', labels: {cooperate: 'Cooperate'}, picked: 'cooperate',
 *                        extras: [{ label: 'Opponent will cooperate', value: 0.7 }] });
 */
export class ThinkPanel {
  constructor() {
    this.el = h('aside.think');
    this.waiting();
  }

  header(result) {
    const isLocal = result ? result.source === 'local' : effectiveMode() === 'practice';
    const mode = result?.mode || effectiveMode();
    return h('div.think-head',
      h('div.think-title', h('span.pulse', { class: isLocal ? 'local' : '' }), t(isLocal ? 'think.title.local' : 'think.title'),
        !isLocal ? h('span.mode-chip', t(`mode.${mode}`)) : null),
      result ? h('div.think-meta', result.model, ' · ', t('think.ms', { ms: result.ms })) : null,
    );
  }

  /** Re-draw the last state (e.g. after a language switch). */
  rerender() {
    const [fn, args] = this.last || ['waiting', []];
    this[fn](...args);
  }

  waiting() {
    this.last = ['waiting', []];
    fill(this.el, this.header(), h('p.think-empty', t('think.waiting')));
  }

  thinking() {
    this.last = ['thinking', []];
    fill(this.el, this.header(), h('div.think-loading', h('span.dot'), h('span.dot'), h('span.dot'), h('span', t('think.thinking'))));
  }

  /** Build the body (bars, confidence, extras) for one decision. */
  body(result, opts, { compact = false } = {}) {
    // labels/extras/title may be functions so they re-translate on language change
    const val = (x) => (typeof x === 'function' ? x() : x);
    const { question = 'action', picked } = opts;
    const labels = val(opts.labels) || {};
    const extras = val(opts.extras) || [];
    const title = val(opts.title);
    const ans = result.answers?.[question];
    const probs = ans?.probabilities || {};
    const keys = Object.keys(labels).length ? Object.keys(labels).filter((k) => k in probs || !Object.keys(probs).length) : Object.keys(probs);
    const rows = keys.map((k) => {
      const p = probs[k] || 0;
      return h('div.bar-row', { class: k === picked ? 'picked' : '' },
        h('div.bar-label', labels[k] ?? k, k === picked ? h('span.tag', t('think.picked')) : null),
        h('div.bar-track', h('div.bar-fill', { style: { width: pct(p) } })),
        h('div.bar-val', pct(p)),
      );
    });
    const extraRows = extras.filter((x) => x.value != null).map((x) =>
      h('div.extra', h('span', x.label), h('div.mini-track', h('div.mini-fill', { style: { width: pct(x.value) } })), h('b', pct(x.value))),
    );
    return [
      title ? h('div.think-q', title) : null,
      h('div.bars', rows),
      !compact && ans?.confidence != null ? h('div.conf', t('think.confidence'), h('b', pct(ans.confidence))) : null,
      extraRows.length ? h('div.extras', extraRows) : null,
    ];
  }

  animate() {
    requestAnimationFrame(() => this.el.querySelectorAll('.bar-fill, .mini-fill').forEach((b) => b.classList.add('in')));
  }

  show(result, opts = {}) {
    this.last = ['show', [result, opts]];
    fill(this.el,
      this.header(result),
      this.body(result, opts),
      result.error ? h('div.fallback', t(`think.fallback.${result.error}`)) : null,
    );
    this.animate();
  }

  // ----- sealed decisions (hidden-information games) -----
  // Against Jev, showing its odds mid-hand would leak its private cards/dice. Games call
  // reveal(); in Jev modes the decision is sealed until the hand/round ends (unseal()).
  // Practice mode shows everything immediately, as a teaching aid.

  reveal(result, opts = {}) {
    if (result.mode === 'practice') return this.show(result, opts);
    (this.sealed ||= []).push([result, opts]);
    this.sealedView();
  }

  sealedView() {
    this.last = ['sealedView', []];
    const n = this.sealed?.length || 0;
    const lastRes = this.sealed?.[n - 1]?.[0];
    fill(this.el,
      this.header(lastRes),
      h('div.sealed',
        h('span.seal-ico', { html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.3" fill="currentColor"/></svg>' }),
        h('div', h('b', t('think.sealed.t')), h('p', t('think.sealed.b', { n })))),
      lastRes?.error ? h('div.fallback', t(`think.fallback.${lastRes.error}`)) : null,
    );
  }

  /** End of hand/round: show every sealed decision of this hand. */
  unseal() {
    const items = this.sealed || [];
    this.sealed = [];
    if (!items.length) return;
    this.showMany(items);
  }

  /** Forget sealed decisions without showing them (e.g. new game). */
  clearSealed() { this.sealed = []; }

  showMany(items) {
    this.last = ['showMany', [items]];
    if (items.length === 1) { this.show(...items[0]); return; }
    fill(this.el,
      this.header(items[items.length - 1][0]),
      h('div.think-q.review-head', t('think.review', { n: items.length })),
      h('div.review', items.map(([res, opts], i) => h('div.review-step', h('span.step-no', i + 1), h('div', this.body(res, opts, { compact: true }))))),
    );
    this.animate();
  }

}

export function toast(msg) {
  const el = h('div.toast', msg);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 300); }, 2600);
}

/** Segmented control. options: [{value, label}] */
export function segmented(options, value, onChange) {
  const wrap = h('div.seg');
  for (const o of options) {
    wrap.append(h('button', {
      type: 'button',
      class: o.value === value ? 'on' : '',
      disabled: o.disabled,
      title: o.title,
      onclick: () => onChange(o.value),
    }, o.label));
  }
  return wrap;
}

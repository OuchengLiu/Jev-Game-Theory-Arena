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

  show(result, opts = {}) {
    this.last = ['show', [result, opts]];
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
    fill(this.el, 
      this.header(result),
      title ? h('div.think-q', title) : null,
      h('div.bars', rows),
      ans?.confidence != null ? h('div.conf', t('think.confidence'), h('b', pct(ans.confidence))) : null,
      extraRows.length ? h('div.extras', extraRows) : null,
      result.error ? h('div.fallback', t(`think.fallback.${result.error}`)) : null,
    );
    // animate bars in
    requestAnimationFrame(() => this.el.querySelectorAll('.bar-fill, .mini-fill').forEach((b) => b.classList.add('in')));
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

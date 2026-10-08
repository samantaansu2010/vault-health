// Test-only runtime fake of the parts of Obsidian + the DOM that Vault Health uses. No vault-mutating API exists here,
// so any attempt by the plugin to modify a file would throw "is not a function" and fail the test.
export const state = { modals: [], notices: [] };

export class FakeEl {
  constructor(tag, ns) {
    this.tag = tag; this.ns = ns; this.children = []; this.attrs = {}; this.classes = new Set(); this.listeners = {};
    this.text = ''; this.value = ''; this.checked = false; this.disabled = false; this.selected = false; this.open = false; this.parent = null; this.type = '';
  }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set textContent(t) { this.text = String(t); this.children = []; }
  get className() { return [...this.classes].join(' '); }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  createEl(tag, o = {}) {
    if (typeof o === 'string') o = { cls: o };
    const el = new FakeEl(tag);
    if (o.cls) [].concat(o.cls).forEach((c) => String(c).split(/\s+/).filter(Boolean).forEach((x) => el.classes.add(x)));
    if (o.text !== undefined) el.text = String(o.text);
    if (o.type) el.type = o.type;
    if (o.value !== undefined) el.value = o.value;
    if (o.title) el.attrs.title = o.title;
    if (o.placeholder) el.attrs.placeholder = o.placeholder;
    if (o.attr) for (const [k, v] of Object.entries(o.attr)) if (v !== null) el.attrs[k] = String(v);
    this.appendChild(el);
    return el;
  }
  createDiv(o) { return this.createEl('div', o); }
  createSpan(o) { return this.createEl('span', o); }
  empty() { this.children = []; this.text = ''; }
  addClass(...c) { c.forEach((x) => this.classes.add(x)); }
  removeClass(...c) { c.forEach((x) => this.classes.delete(x)); }
  toggleClass(c, v) { [].concat(c).forEach((x) => (v ? this.classes.add(x) : this.classes.delete(x))); }
  setText(t) { this.text = String(t); this.children = []; }
  setAttr(k, v) { this.attrs[k] = String(v); if (k === 'open') this.open = true; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener(t, fn) { (this.listeners[t] ??= []).push(fn); }
  dispatch(t, ev = {}) { (this.listeners[t] ?? []).forEach((fn) => fn({ ctrlKey: false, metaKey: false, key: '', preventDefault() {}, ...ev })); }
  click() { if (this.disabled) return; this.dispatch('click'); }
  focus() {} select() {} setSelectionRange() {}
  get options() { return this.children.filter((c) => c.tag === 'option'); }
}

export const FakeDocument = {
  createElementNS: (ns, tag) => new FakeEl(tag, ns),
  createElement: (tag) => new FakeEl(tag),
};
globalThis.document = FakeDocument;
globalThis.window = { setTimeout: (fn) => { fn(); return 0; } };

export function walk(el, pred, out = []) {
  if (pred(el)) out.push(el);
  el.children.forEach((c) => walk(c, pred, out));
  return out;
}

export class TFile {}
export class Component { registerEvent() {} }
export class Plugin extends Component { constructor(app) { super(); this.app = app; } }
export class View extends Component {
  constructor(leaf) { super(); this.leaf = leaf; this.app = leaf.app; this.contentEl = new FakeEl('div'); this.containerEl = this.contentEl; }
}
export class ItemView extends View {}
export class Modal {
  constructor(app) { this.app = app; this.contentEl = new FakeEl('div'); this.titleEl = new FakeEl('h2'); this.closed = false; }
  open() { state.modals.push(this); this.onOpen(); }
  close() { this.closed = true; this.onClose?.(); }
}
export class Notice { constructor(m) { state.notices.push(m); } }
export class PluginSettingTab { constructor(app) { this.app = app; this.containerEl = new FakeEl('div'); } }
const comp = () => { const c = { inputEl: new FakeEl('input'), setValue() { return c; }, onChange() { return c; }, setPlaceholder() { return c; }, addOption() { return c; }, setButtonText() { return c; }, setCta() { return c; }, onClick() { return c; } }; return c; };
export class Setting {
  constructor(el) { this.settingEl = el; }
  setName() { return this; } setDesc() { return this; } setHeading() { return this; }
  addToggle(cb) { cb(comp()); return this; } addText(cb) { cb(comp()); return this; } addTextArea(cb) { cb(comp()); return this; }
  addDropdown(cb) { cb(comp()); return this; } addButton(cb) { cb(comp()); return this; }
}
export const Platform = { isMobile: false, isDesktop: true };
export function setIcon() {}
export function getAllTags(cache) {
  const out = (cache.tags ?? []).map((t) => t.tag);
  for (const t of [].concat(cache.frontmatter?.tags ?? [])) out.push('#' + String(t).replace(/^#/, ''));
  return out;
}
export function getLinkpath(l) { return l.split('#')[0]; }
export function parseFrontMatterAliases(fm) { return fm?.aliases ? [].concat(fm.aliases) : null; }
export function debounce(fn) { const f = (...a) => fn(...a); f.cancel = () => {}; return f; }
export function normalizePath(p) { return p; }

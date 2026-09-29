type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> & { class?: string; style?: string; onClick?: (e: MouseEvent) => void };

/** Minimal hyperscript helper. */
export function h(tag: string, props: Props | null = null, ...children: (Child | Child[])[]): HTMLElement {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k in el) (el as any)[k] = v;
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function fmt(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k';
  return Math.round(n).toLocaleString('en-US');
}

export function pct(share: number): string {
  const p = share * 100;
  return (p < 10 ? p.toFixed(2) : p.toFixed(1)) + '%';
}

export function starsHTML(n: number, max = 3): HTMLElement {
  const s = h('span', { class: 'stars' });
  for (let i = 0; i < max; i++) s.append(h('span', { class: i < n ? '' : 'off' }, '★'));
  return s;
}

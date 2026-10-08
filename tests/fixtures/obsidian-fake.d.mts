export class FakeEl {
  tag: string; attrs: Record<string, string>; children: FakeEl[]; classes: Set<string>; text: string; checked: boolean; disabled: boolean; value: string; selected: boolean;
  textContent: string;
  click(): void;
  dispatch(type: string, ev?: Record<string, unknown>): void;
}
export const state: { modals: { contentEl: FakeEl; titleEl: FakeEl; closed: boolean }[]; notices: string[] };
export function walk(el: FakeEl, pred: (e: FakeEl) => boolean, out?: FakeEl[]): FakeEl[];
export class TFile {}

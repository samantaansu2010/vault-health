// SANDBOX-ONLY approximation of the Obsidian API surface used by this plugin. See dev/README.md.
declare module 'obsidian' {
  export interface DomElementInfo {
    cls?: string | string[];
    text?: string | DocumentFragment;
    attr?: Record<string, string | number | boolean | null>;
    title?: string;
    parent?: Node;
    value?: string;
    type?: string;
    prepend?: boolean;
    placeholder?: string;
    href?: string;
  }
  export type EventRef = { __brand: 'EventRef' };
  export class Events {
    on(name: string, cb: (...a: any[]) => any): EventRef;
    off(name: string, cb: (...a: any[]) => any): void;
    offref(ref: EventRef): void;
    trigger(name: string, ...data: any[]): void;
  }
  export class Component {
    load(): void;
    unload(): void;
    registerEvent(ref: EventRef): void;
    registerInterval(id: number): number;
    register(cb: () => any): void;
  }
  export interface Pos { start: { line: number; col: number; offset: number }; end: { line: number; col: number; offset: number } }
  export interface Reference { link: string; original: string; displayText?: string }
  export interface ReferenceCache extends Reference { position: Pos }
  export type LinkCache = ReferenceCache;
  export type EmbedCache = ReferenceCache;
  export interface TagCache { tag: string; position: Pos }
  export interface FrontMatterCache { [key: string]: any }
  export interface CachedMetadata {
    links?: LinkCache[];
    embeds?: EmbedCache[];
    tags?: TagCache[];
    frontmatter?: FrontMatterCache;
    frontmatterPosition?: Pos;
  }
  export interface FileStats { ctime: number; mtime: number; size: number }
  export class TAbstractFile { path: string; name: string; parent: TFolder | null }
  export class TFile extends TAbstractFile { basename: string; extension: string; stat: FileStats }
  export class TFolder extends TAbstractFile { children: TAbstractFile[] }
  export class Vault extends Events {
    getFiles(): TFile[];
    getMarkdownFiles(): TFile[];
    getAbstractFileByPath(path: string): TAbstractFile | null;
    cachedRead(file: TFile): Promise<string>;
    getResourcePath(file: TFile): string;
  }
  export class MetadataCache extends Events {
    resolvedLinks: Record<string, Record<string, number>>;
    unresolvedLinks: Record<string, Record<string, number>>;
    getFileCache(file: TFile): CachedMetadata | null;
    getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null;
  }
  export type PaneType = 'tab' | 'split' | 'window';
  export class WorkspaceLeaf extends Component {
    view: View;
    openFile(file: TFile, openState?: unknown): Promise<void>;
    setViewState(state: { type: string; active?: boolean; state?: unknown }): Promise<void>;
  }
  export class Workspace extends Events {
    getLeaf(newLeaf?: PaneType | boolean): WorkspaceLeaf;
    getLeavesOfType(type: string): WorkspaceLeaf[];
    getRightLeaf(split: boolean): WorkspaceLeaf | null;
    revealLeaf(leaf: WorkspaceLeaf): Promise<void>;
    detachLeavesOfType(type: string): void;
    getActiveFile(): TFile | null;
    requestSaveLayout(): void;
    onLayoutReady(cb: () => any): void;
  }
  export class App { vault: Vault; metadataCache: MetadataCache; workspace: Workspace }
  export interface ViewStateResult { history: boolean }
  export abstract class View extends Component {
    app: App;
    containerEl: HTMLElement;
    leaf: WorkspaceLeaf;
    constructor(leaf: WorkspaceLeaf);
    abstract getViewType(): string;
    abstract getDisplayText(): string;
    getIcon(): string;
    getState(): Record<string, unknown>;
    setState(state: unknown, result: ViewStateResult): Promise<void>;
    onOpen(): Promise<void>;
    onClose(): Promise<void>;
  }
  export abstract class ItemView extends View { contentEl: HTMLElement }
  export interface Command { id: string; name: string; callback?: () => any; checkCallback?: (checking: boolean) => boolean | void }
  export interface PluginManifest { id: string; name: string; version: string }
  export class Plugin extends Component {
    app: App;
    manifest: PluginManifest;
    constructor(app: App, manifest: PluginManifest);
    loadData(): Promise<any>;
    saveData(data: any): Promise<void>;
    addCommand(cmd: Command): Command;
    addSettingTab(tab: PluginSettingTab): void;
    addRibbonIcon(icon: string, title: string, cb: (evt: MouseEvent) => any): HTMLElement;
    registerView(type: string, creator: (leaf: WorkspaceLeaf) => View): void;
    onload(): Promise<void> | void;
    onunload(): void;
  }
  export abstract class PluginSettingTab {
    app: App;
    containerEl: HTMLElement;
    constructor(app: App, plugin: Plugin);
    abstract display(): void;
    hide(): void;
  }
  export class Modal {
    app: App;
    contentEl: HTMLElement;
    titleEl: HTMLElement;
    constructor(app: App);
    open(): void;
    close(): void;
    onOpen(): void;
    onClose(): void;
  }
  export class Notice { constructor(message: string, timeout?: number) }
  export class ToggleComponent { setValue(v: boolean): this; onChange(cb: (v: boolean) => any): this }
  export class TextComponent { inputEl: HTMLInputElement; setValue(v: string): this; setPlaceholder(v: string): this; onChange(cb: (v: string) => any): this }
  export class TextAreaComponent { inputEl: HTMLTextAreaElement; setValue(v: string): this; setPlaceholder(v: string): this; onChange(cb: (v: string) => any): this }
  export class DropdownComponent { addOption(v: string, d: string): this; setValue(v: string): this; onChange(cb: (v: string) => any): this }
  export class ButtonComponent { setButtonText(t: string): this; setCta(): this; onClick(cb: () => any): this }
  export class Setting {
    constructor(containerEl: HTMLElement);
    settingEl: HTMLElement;
    setName(name: string): this;
    setDesc(desc: string | DocumentFragment): this;
    setHeading(): this;
    addToggle(cb: (c: ToggleComponent) => any): this;
    addText(cb: (c: TextComponent) => any): this;
    addTextArea(cb: (c: TextAreaComponent) => any): this;
    addDropdown(cb: (c: DropdownComponent) => any): this;
    addButton(cb: (c: ButtonComponent) => any): this;
  }
  export const Platform: { isMobile: boolean; isDesktop: boolean };
  export function setIcon(el: HTMLElement, iconId: string): void;
  export function getAllTags(cache: CachedMetadata): string[] | null;
  export function parseFrontMatterAliases(fm: FrontMatterCache | undefined): string[] | null;
  export function getLinkpath(linktext: string): string;
  export function normalizePath(path: string): string;
  export function debounce<T extends unknown[]>(cb: (...a: T) => any, timeout?: number, resetTimer?: boolean): { (...a: T): void; cancel(): void };
}
interface HTMLElement {
  createEl<K extends keyof HTMLElementTagNameMap>(tag: K, o?: import('obsidian').DomElementInfo | string, cb?: (el: HTMLElementTagNameMap[K]) => void): HTMLElementTagNameMap[K];
  createDiv(o?: import('obsidian').DomElementInfo | string, cb?: (el: HTMLDivElement) => void): HTMLDivElement;
  createSpan(o?: import('obsidian').DomElementInfo | string, cb?: (el: HTMLSpanElement) => void): HTMLSpanElement;
  empty(): void;
  addClass(...c: string[]): void;
  removeClass(...c: string[]): void;
  toggleClass(c: string | string[], v: boolean): void;
  setText(t: string | DocumentFragment): void;
  setAttr(name: string, value: string | number | boolean | null): void;
}

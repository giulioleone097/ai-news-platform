/**
 * Just enough of a browser document for `confirm-dialog.ts`: the unit tests run in Node, where
 * there is no DOM. It follows the dialog rules that matter here: `showModal()` opens it, `close()`
 * sets `returnValue` and fires `close`, and Escape fires `cancel` and then closes.
 */
export class FakeNode {
  children: FakeNode[] = [];
  attributes = new Map<string, string>();
  listeners = new Map<string, ((event: unknown) => void)[]>();
  parent: FakeNode | null = null;
  className = "";
  textContent = "";
  id = "";
  type = "";
  open = false;
  returnValue = "";

  constructor(
    readonly tag: string,
    private readonly doc: FakeDocument,
  ) {}

  append(...nodes: FakeNode[]) {
    for (const node of nodes) this.appendChild(node);
  }
  appendChild(node: FakeNode) {
    node.parent = this;
    this.children.push(node);
    return node;
  }
  remove() {
    this.parent?.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  addEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  dispatch(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener({ type });
  }
  click() {
    this.dispatch("click");
  }
  focus() {
    this.doc.activeElement = this;
  }
  showModal() {
    this.open = true;
    this.doc.modals.push(this);
  }
  close(returnValue = "") {
    if (!this.open) return;
    this.open = false;
    this.returnValue = returnValue;
    this.doc.modals.splice(this.doc.modals.indexOf(this), 1);
    this.dispatch("close");
  }
  /** The Escape key on an open modal dialog. */
  escape() {
    this.dispatch("cancel");
    this.close();
  }
  all(): FakeNode[] {
    return [this, ...this.children.flatMap((child) => child.all())];
  }
  text() {
    return this.all().map((node) => node.textContent).join("\n");
  }
}

export class FakeDocument {
  head = new FakeNode("head", this);
  body = new FakeNode("body", this);
  activeElement: FakeNode | null = null;
  modals: FakeNode[] = [];
  createElement(tag: string) {
    return new FakeNode(tag, this);
  }
  /** Every dialog currently in the page, open or not. */
  dialogs() {
    return this.body.all().filter((node) => node.tag === "dialog");
  }
}

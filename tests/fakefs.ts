// A tiny in-memory stand-in for File System Access directory handles.
type Node = FakeDir | FakeFile;

export class FakeFile {
  readonly kind = 'file';
  constructor(
    public name: string,
    public content = '',
    public lastModified = 1,
  ) {}
  async getFile() {
    const { content, lastModified } = this;
    return { text: async () => content, lastModified };
  }
}

export class FakeDir {
  readonly kind = 'directory';
  children = new Map<string, Node>();
  constructor(public name: string) {}
  async *values() {
    yield* this.children.values();
  }
  /** Create or update a file at a slash path, making folders on the way. */
  write(path: string, content = '', lastModified = Date.now()): this {
    const parts = path.split('/');
    let d: FakeDir = this;
    for (const p of parts.slice(0, -1)) {
      let next = d.children.get(p);
      if (!next) d.children.set(p, (next = new FakeDir(p)));
      d = next as FakeDir;
    }
    d.children.set(parts.at(-1)!, new FakeFile(parts.at(-1)!, content, lastModified));
    return this;
  }
  asHandle() {
    return this as unknown as FileSystemDirectoryHandle;
  }
}

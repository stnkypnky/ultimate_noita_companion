import { openSync, readSync, closeSync } from 'node:fs';

type Entry = { offset: number; size: number };

/**
 * Reader for Noita's .wak archives.
 * Layout: header [i32 0, i32 fileCount, i32 tocSize, i32 0], then per file
 * [u32 offset, u32 size, u32 pathLen, utf8 path]; offsets are absolute.
 */
export class Wak {
  private fd: number;
  readonly entries = new Map<string, Entry>();

  constructor(path: string) {
    this.fd = openSync(path, 'r');
    const header = this.read(0, 16);
    const count = header.readInt32LE(4);
    const tocSize = header.readInt32LE(8);
    const toc = this.read(16, tocSize);
    let p = 0;
    for (let i = 0; i < count; i++) {
      const offset = toc.readUInt32LE(p);
      const size = toc.readUInt32LE(p + 4);
      const len = toc.readUInt32LE(p + 8);
      const name = toc.toString('utf8', p + 12, p + 12 + len);
      this.entries.set(name, { offset, size });
      p += 12 + len;
    }
  }

  private read(offset: number, size: number): Buffer {
    const buf = Buffer.alloc(size);
    readSync(this.fd, buf, 0, size, offset);
    return buf;
  }

  has(path: string): boolean {
    return this.entries.has(normalize(path));
  }

  bytes(path: string): Buffer {
    const e = this.entries.get(normalize(path));
    if (!e) throw new Error(`not in wak: ${path}`);
    return this.read(e.offset, e.size);
  }

  text(path: string): string {
    return this.bytes(path).toString('utf8').replace(/^﻿/, '');
  }

  list(prefix: string): string[] {
    const pre = normalize(prefix);
    return [...this.entries.keys()].filter((k) => k.startsWith(pre));
  }

  close() {
    closeSync(this.fd);
  }
}

export const normalize = (p: string) => p.replace(/\\/g, '/').replace(/^\.?\//, '');

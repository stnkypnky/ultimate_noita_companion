// How paired devices reach each other. The engine only sees this interface, so tests and same-device
// tabs can swap the WebRTC transport for an in-memory or BroadcastChannel one.

export type Transport = {
  /** Send to one peer, or to everyone when `to` is left out. */
  send: (msg: unknown, to?: string) => void;
  onMessage: (fn: (msg: unknown, from: string) => void) => void;
  onPeer: (fn: (peer: string, joined: boolean) => void) => void;
  leave: () => void;
};

/** Messages bigger than this are dropped unread (a full sync is a few KB; builds lists stay well under). */
export const MAX_MESSAGE_BYTES = 512 * 1024;

const APP_ID = 'ultimate-noita-companion';

/**
 * WebRTC through Trystero. Public Nostr relays only carry the handshake, which Trystero encrypts with the
 * room password (the pairing key); data then flows peer to peer, directly over the LAN when devices share one.
 */
export async function p2pTransport(roomId: string, password: string): Promise<Transport> {
  const { joinRoom } = await import('trystero');
  const room = joinRoom({ appId: APP_ID, password, maxReceiveBytes: MAX_MESSAGE_BYTES }, roomId);
  const action = room.makeAction<string>('sync');
  let onMsg: (msg: unknown, from: string) => void = () => {};
  action.onMessage = (data, { peerId }) => {
    if (typeof data !== 'string' || data.length > MAX_MESSAGE_BYTES) return;
    try {
      onMsg(JSON.parse(data), peerId);
    } catch {
      /* not JSON: ignore */
    }
  };
  return {
    send: (msg, to) => void action.send(JSON.stringify(msg), to ? { target: to } : undefined).catch(() => {}),
    onMessage: (fn) => (onMsg = fn),
    onPeer: (fn) => {
      room.onPeerJoin = (p) => fn(p, true);
      room.onPeerLeave = (p) => fn(p, false);
    },
    leave: () => void room.leave(),
  };
}

/** Same-device transport over BroadcastChannel (used by the e2e tests; opt in with localStorage sync-transport=local). */
export function broadcastTransport(roomId: string): Transport {
  const me = Math.random().toString(36).slice(2);
  const ch = new BroadcastChannel(`sync:${roomId}`);
  let onMsg: (msg: unknown, from: string) => void = () => {};
  let onPeer: (peer: string, joined: boolean) => void = () => {};
  const known = new Set<string>();
  type Frame = { k: 'hi' | 'hi-back' | 'bye' | 'msg'; from: string; to?: string; data?: string };
  const post = (f: Frame) => ch.postMessage(f);
  ch.onmessage = (e: MessageEvent<Frame>) => {
    const f = e.data;
    if (!f || f.from === me || (f.to && f.to !== me)) return;
    if (f.k === 'hi' || f.k === 'hi-back') {
      if (f.k === 'hi') post({ k: 'hi-back', from: me, to: f.from });
      if (!known.has(f.from)) {
        known.add(f.from);
        onPeer(f.from, true);
      }
    } else if (f.k === 'bye') {
      if (known.delete(f.from)) onPeer(f.from, false);
    } else if (f.k === 'msg' && known.has(f.from) && typeof f.data === 'string' && f.data.length <= MAX_MESSAGE_BYTES) {
      try {
        onMsg(JSON.parse(f.data), f.from);
      } catch {
        /* ignore */
      }
    }
  };
  // Announce after the engine has had a chance to register its handlers.
  setTimeout(() => post({ k: 'hi', from: me }), 0);
  return {
    send: (msg, to) => post({ k: 'msg', from: me, to, data: JSON.stringify(msg) }),
    onMessage: (fn) => (onMsg = fn),
    onPeer: (fn) => (onPeer = fn),
    leave: () => {
      post({ k: 'bye', from: me });
      ch.close();
    },
  };
}

/** Two or more transports wired together in memory, for unit tests. */
export function memoryHub() {
  const nodes = new Map<string, { msg: (m: unknown, from: string) => void; peer: (p: string, j: boolean) => void }>();
  let n = 0;
  return {
    connect(): Transport {
      const id = `peer${++n}`;
      const node = { msg: (_m: unknown, _f: string) => {}, peer: (_p: string, _j: boolean) => {} };
      queueMicrotask(() => {
        for (const [other, o] of nodes) {
          o.peer(id, true);
          node.peer(other, true);
        }
        nodes.set(id, node);
      });
      return {
        // Round-trip through JSON like a real wire, asynchronously.
        send: (msg, to) => {
          const wire = JSON.stringify(msg);
          for (const [other, o] of nodes) if (other !== id && (!to || to === other)) queueMicrotask(() => o.msg(JSON.parse(wire), id));
        },
        onMessage: (fn) => (node.msg = fn),
        onPeer: (fn) => (node.peer = fn),
        leave: () => {
          nodes.delete(id);
          for (const o of nodes.values()) o.peer(id, false);
        },
      };
    },
  };
}

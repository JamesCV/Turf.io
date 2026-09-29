import type { NetSnapshot } from '../game/netstate';

export interface Seat {
  key: string;
  name: string;
  team: 1 | 2;
  charId: string;
  self: boolean;
}

export interface StartMsg {
  type: 'start';
  spec: { shape: string; size: number; rocks: number; seed: number };
  youKey: string;
}

type PeerLike = {
  id: string;
  on(ev: string, fn: (...args: never[]) => void): void;
  connect(id: string, opts?: { reliable?: boolean }): Conn;
  destroy(): void;
};

type Conn = {
  peer: string;
  open: boolean;
  on(ev: string, fn: (data?: unknown) => void): void;
  send(data: unknown): void;
  close(): void;
};

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeCode(): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHABET[(Math.random() * ALPHABET.length) | 0];
  return s;
}

/**
 * A 3v3 room. The host simulates the match and streams snapshots.
 * If the relay is unreachable, the host can still fill the room with bots.
 */
export class PartyRoom {
  code = '';
  seats: Seat[] = [];
  isHost = false;
  live = false;
  /** Ignore new joins once the match has started. */
  locked = false;
  status = '';
  onRoster: () => void = () => {};
  onStart: (msg: StartMsg) => void = () => {};
  onState: (snap: NetSnapshot) => void = () => {};
  onInput: (from: string, angle: number | null, ability: boolean) => void = () => {};

  private peer: PeerLike | null = null;
  private conns = new Map<string, Conn>();
  private closed = false;

  remotes(): Seat[] {
    return this.seats.filter((s) => !s.self);
  }

  async host(name: string, charId: string): Promise<void> {
    this.isHost = true;
    this.code = makeCode();
    this.seats = [{ key: 'host', name, team: 1, charId, self: true }];
    await this.openPeer('turf' + this.code, true);
  }

  async join(code: string, name: string, charId: string): Promise<void> {
    this.isHost = false;
    this.code = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (this.code.length < 4) throw new Error('Enter the 4-character room code.');
    await this.openPeer(undefined, false);
    const conn = this.peer!.connect('turf' + this.code, { reliable: true });
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('No room with that code.')), 6000);
      conn.on('open', () => {
        window.clearTimeout(timer);
        this.conns.set('host', conn);
        conn.send({ type: 'join', name, charId });
        resolve();
      });
      conn.on('error', () => {
        window.clearTimeout(timer);
        reject(new Error('Could not reach that room.'));
      });
    });
    conn.on('data', (raw) => this.onGuestData(raw));
    conn.on('close', () => {
      if (!this.closed) this.status = 'The host left.';
    });
  }

  send(msg: unknown): void {
    for (const conn of this.conns.values()) {
      if (conn.open) conn.send(msg);
    }
  }

  sendStart(spec: StartMsg['spec']): void {
    for (const [key, conn] of this.conns) {
      if (conn.open) conn.send({ type: 'start', spec, youKey: key } satisfies StartMsg);
    }
  }

  close(): void {
    this.closed = true;
    for (const conn of this.conns.values()) conn.close();
    this.conns.clear();
    this.peer?.destroy();
    this.peer = null;
  }

  private async openPeer(id: string | undefined, hosting: boolean): Promise<void> {
    let PeerCtor: new (id?: string) => PeerLike;
    try {
      const mod = await import('peerjs');
      PeerCtor = mod.default as unknown as new (id?: string) => PeerLike;
    } catch {
      this.live = false;
      this.status = hosting ? 'Local room — friends on another phone cannot join this one.' : '';
      if (!hosting) throw new Error('Party connect is unavailable.');
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const peer = id ? new PeerCtor(id) : new PeerCtor();
      let settled = false;
      const done = (ok: boolean, err?: Error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (ok) resolve();
        else reject(err ?? new Error('Could not open a connection.'));
      };
      const timer = window.setTimeout(() => {
        this.live = false;
        this.status = hosting ? 'Relay is busy. You can still start with bots.' : '';
        if (hosting) done(true);
        else done(false, new Error('Could not open a connection.'));
      }, 5000);
      peer.on('open', () => {
        this.peer = peer;
        this.live = true;
        this.status = hosting ? 'Friends can join with this code.' : 'Connected.';
        done(true);
      });
      peer.on('error', () => {
        if (settled) return;
        this.live = false;
        if (hosting) {
          this.status = 'That code was taken. Starting a local room.';
          this.code = makeCode();
          done(true);
        } else done(false, new Error('Could not open a connection.'));
      });
      if (hosting) {
        peer.on('connection', ((conn: Conn) => this.accept(conn)) as (...args: never[]) => void);
      }
      this.peer = peer;
    });
  }

  private accept(conn: Conn): void {
    conn.on('data', (raw) => {
      const msg = raw as { type?: string; name?: string; charId?: string; angle?: number | null; ability?: boolean };
      if (msg.type === 'join') {
        if (this.locked || this.seats.length >= 6) {
          conn.send({ type: 'full' });
          conn.close();
          return;
        }
        const team: 1 | 2 = this.seats.filter((s) => s.team === 1).length < 3 ? 1 : 2;
        this.seats.push({
          key: conn.peer,
          name: (msg.name || 'Friend').slice(0, 16),
          team,
          charId: msg.charId || 'pip',
          self: false,
        });
        this.conns.set(conn.peer, conn);
        this.pushRoster();
        this.onRoster();
      } else if (msg.type === 'input') {
        this.onInput(conn.peer, typeof msg.angle === 'number' ? msg.angle : null, !!msg.ability);
      }
    });
    conn.on('close', () => {
      this.conns.delete(conn.peer);
      this.seats = this.seats.filter((s) => s.key !== conn.peer);
      this.pushRoster();
      this.onRoster();
    });
  }

  private pushRoster(): void {
    const seats = this.seats.map((s) => ({ ...s, self: false }));
    for (const conn of this.conns.values()) if (conn.open) conn.send({ type: 'roster', seats });
  }

  private onGuestData(raw: unknown): void {
    const msg = raw as { type?: string; seats?: Seat[]; youKey?: string; spec?: StartMsg['spec']; t?: number; players?: NetSnapshot['players']; rle?: number[]; over?: boolean };
    if (msg.type === 'roster' && msg.seats) {
      const mine = this.peer?.id;
      this.seats = msg.seats.map((s) => ({ ...s, self: s.key === mine }));
      this.onRoster();
    } else if (msg.type === 'start' && msg.spec && msg.youKey) {
      this.onStart({ type: 'start', spec: msg.spec, youKey: msg.youKey });
    } else if (msg.type === 'full') {
      this.status = 'That room is full.';
    } else if (msg.type === 'state' && msg.players) {
      this.onState({ t: msg.t ?? 0, players: msg.players, rle: msg.rle, over: msg.over });
    }
  }
}

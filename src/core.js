export const CHARACTERS = [
  ['01-orange','Orange','#efb56d','#683b19'],['02-cobalt','Blue','#a6c5f5','#203e78'],
  ['03-turquoise','Turquoise','#9bdec9','#235547'],['04-lime','Lime','#c9df8c','#43571c'],
  ['05-coral','Coral','#edb0a5','#713a31'],['06-violet','Purple','#cbb3f1','#4e337c'],
  ['07-yellow','Yellow','#ece293','#584d14'],['08-pink','Pink','#f0b6dd','#6c305b']
];
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const character = id => CHARACTERS.find(c => c[0] === id) || CHARACTERS[0];
export const codepointLength = value => Array.from(value).length;
export const newId = () => globalThis.crypto.randomUUID();

// Keep an absolute server clock, including browsers that pause performance.now in sleep.
// Never rewind the estimated server time after a delayed response or a local clock change.
export class ServerClock {
  constructor(wall = () => Date.now(), mono = () => performance.now()) { this.wall = wall; this.mono = mono; this.anchor = null; }
  sync(serverTime) {
    if (!Number.isFinite(serverTime)) return;
    const estimate = this.anchor ? this.now() : serverTime;
    this.anchor = {server: Math.max(serverTime, estimate), wall: this.wall(), mono: this.mono()};
  }
  now() { const a = this.anchor; return a ? a.server + Math.max(0, this.wall() - a.wall, this.mono() - a.mono) : this.wall(); }
  remaining(deadline) { return Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - this.now()) / 1000)) : null; }
}

export class PrivateStore {
  constructor(storage, key = 'riffraff-controller-v1') { this.storage = storage; this.key = key; this.saved = true; this.data = this.read(); }
  read() { try { const value = JSON.parse(this.storage.getItem(this.key)); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; } }
  write() { try { this.storage.setItem(this.key, JSON.stringify(this.data)); this.saved = true; } catch { this.saved = false; } return this.saved; }
  get(key, fallback = null) { return this.data[key] ?? fallback; }
  set(key, value) { this.data[key] = value; return this.write(); }
  clear() { this.data = {}; try { this.storage.removeItem(this.key); } catch {} }
}

export function draftKey(snapshot, assignmentId) { return `${snapshot.room_id}/${snapshot.game_id}/${snapshot.phase_id}/${assignmentId}`; }
export function totalTokens(allocation) { return Object.values(allocation).reduce((sum, count) => sum + count, 0); }
export function validAllocation(allocation, eligibleIds, budget = 3) {
  return Object.entries(allocation).every(([id,n]) => eligibleIds.includes(id) && Number.isInteger(n) && n >= 0) && totalTokens(allocation) <= budget;
}

// One in-flight intent per semantic action. An uncertain retry retains the exact bytes/ID.
// A rejected command can be replaced; an accepted command can only be reconciled by authority.
export class Outbox {
  constructor(store) { this.store = store; this.items = store.get('outbox', {}); }
  begin(key, envelope) {
    if (this.items[key]) return this.items[key];
    this.items[key] = {...envelope, command_id: newId()}; this.persist(); return this.items[key];
  }
  get(key) { return this.items[key]; }
  remove(key) { delete this.items[key]; this.persist(); }
  persist() { this.store.set('outbox', this.items); }
}

export function acceptSnapshot(previous, next) {
  if (!next || typeof next !== 'object' || !Number.isInteger(next.revision) || !next.phase_id) return false;
  if (!previous || previous.room_id !== next.room_id) return true;
  return next.revision >= previous.revision;
}

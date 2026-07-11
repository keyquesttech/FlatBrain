// Collision-proof id generator. Date.now() alone collides when two items are
// added within the same millisecond (e.g. double-clicking "Add Item"), which
// breaks per-row updates/removes. crypto.randomUUID isn't available on plain
// HTTP origins like billsplitter.local, so combine time + counter + random.
let counter = 0;

export function newId() {
  counter = (counter + 1) % 1e6;
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newExtra() {
  return { id: newId(), thing: '', packs: 1, price: '' };
}

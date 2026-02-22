/** @enum {number} */
export const NodeType = {
  Server: 0,
  Camera: 1,
  Turret: 2,
  Door: 3,
  Comms: 4,
  Power: 5,
  Firewall: 6,
  Overlord: 7,
};

export const NodeTypeNames = ['Server', 'Camera', 'Turret', 'Door', 'Comms', 'Power', 'Firewall', 'Overlord'];
export const NodeTypePfx = ['SRV', 'CAM', 'TRT', 'DOOR', 'COM', 'PWR', 'FW', 'OVLRD'];
export const NodeTypeCost = [3, 2, 4, 2, 3, 4, 5, 5];

/** @enum {number} */
export const NodeState = {
  Undiscovered: 0,
  Discovered: 1,
  Cracked: 2,
  Spiked: 3,
  Locked: 4,
};

export const NodeStateNames = ['Undiscovered', 'Discovered', 'Cracked', 'Spiked', 'Locked'];

const SUFFIXES = ['ALPHA', 'BETA', 'GAMMA', 'DELTA'];

/** @param {number} typeInt */
export function generateName(typeInt) {
  const pfx = NodeTypePfx[typeInt];
  if (Math.random() < 0.5) {
    const num = Math.floor(Math.random() * 99) + 1;
    return `${pfx}_${String(num).padStart(2, '0')}`;
  }
  return `${pfx}_${SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)]}`;
}

/**
 * @typedef {{
 *   id: number,
 *   name: string,
 *   type: number,
 *   state: number,
 *   isTarget: boolean,
 *   edges: number[],
 * }} Node
 */

/**
 * @typedef {{ nodes: Node[] }} Network
 */

/** @returns {Network} */
export function generateNetwork() {
  const count = 8 + Math.floor(Math.random() * 8); // 8-15

  // Decide types: exactly 1 Overlord, rest random
  const types = new Array(count);
  types[0] = NodeType.Overlord;
  const otherTypes = [NodeType.Server, NodeType.Camera, NodeType.Turret, NodeType.Door, NodeType.Comms, NodeType.Power, NodeType.Firewall];
  for (let i = 1; i < count; i++) {
    types[i] = otherTypes[Math.floor(Math.random() * otherTypes.length)];
  }
  // Shuffle
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }

  // Create nodes with unique names
  /** @type {Set<string>} */
  const usedNames = new Set();
  /** @type {Node[]} */
  const nodes = [];
  for (let i = 0; i < count; i++) {
    let name;
    do {
      name = generateName(types[i]);
    } while (usedNames.has(name));
    usedNames.add(name);
    nodes.push({
      id: i,
      name,
      type: types[i],
      state: NodeState.Undiscovered,
      isTarget: false,
      edges: [],
    });
  }

  // Random spanning tree
  const perm = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 1; i < count; i++) {
    const a = perm[i];
    const b = perm[Math.floor(Math.random() * i)];
    addEdge(nodes, a, b);
  }

  // Extra edges
  const extraEdges = Math.floor(count / 2);
  for (let e = 0; e < extraEdges; e++) {
    const a = Math.floor(Math.random() * count);
    const b = Math.floor(Math.random() * count);
    if (a !== b && !hasEdge(nodes[a], b)) {
      addEdge(nodes, a, b);
    }
  }

  // Mark 3 random non-overlord nodes as targets
  const candidates = nodes.filter(n => n.type !== NodeType.Overlord).map(n => n.id);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (let i = 0; i < 3 && i < candidates.length; i++) {
    nodes[candidates[i]].isTarget = true;
  }

  return { nodes };
}

/**
 * @param {Network} net
 * @param {string} name
 * @returns {Node | undefined}
 */
export function nodeByName(net, name) {
  return net.nodes.find(n => n.name === name);
}

/**
 * @param {Network} net
 * @param {number} id
 * @returns {Node | undefined}
 */
export function getNode(net, id) {
  if (id >= 0 && id < net.nodes.length) return net.nodes[id];
  return undefined;
}

/**
 * @param {Node[]} nodes
 * @param {number} a
 * @param {number} b
 */
function addEdge(nodes, a, b) {
  nodes[a].edges.push(b);
  nodes[b].edges.push(a);
}

/**
 * @param {Node} node
 * @param {number} target
 */
function hasEdge(node, target) {
  return node.edges.includes(target);
}

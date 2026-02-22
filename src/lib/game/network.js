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
 *   extracted: boolean,
 *   ice: string|null,
 *   edges: number[],
 *   _isTargetInternal?: boolean,
 * }} Node
 */

/**
 * @typedef {{ nodes: Node[], directed?: boolean }} Network
 */

/**
 * @param {import('./modifiers.js').ModifierConfig} [mod]
 * @returns {Network}
 */
export function generateNetwork(mod = {}) {
  const minN = mod.minNodes || 8;
  const maxN = mod.maxNodes || 15;
  const count = minN + Math.floor(Math.random() * (maxN - minN + 1));

  // Decide types: exactly 1 Overlord, rest random
  const types = new Array(count);
  types[0] = NodeType.Overlord;
  const otherTypes = mod.noServers
    ? [NodeType.Camera, NodeType.Turret, NodeType.Door, NodeType.Comms, NodeType.Power, NodeType.Firewall]
    : [NodeType.Server, NodeType.Camera, NodeType.Turret, NodeType.Door, NodeType.Comms, NodeType.Power, NodeType.Firewall];
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
      extracted: false,
      ice: null,
      edges: [],
    });
  }

  const directed = !!mod.directedEdges;

  // Random spanning tree
  const perm = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 1; i < count; i++) {
    const a = perm[i];
    const b = perm[Math.floor(Math.random() * i)];
    if (directed) {
      addDirectedEdge(nodes, a, b);
    } else {
      addEdge(nodes, a, b);
    }
  }

  // Extra edges
  const edgeMultiplier = mod.extraEdgeMultiplier || 1;
  const extraEdges = Math.floor(count / 2) * edgeMultiplier;
  for (let e = 0; e < extraEdges; e++) {
    const a = Math.floor(Math.random() * count);
    const b = Math.floor(Math.random() * count);
    if (a !== b && !hasEdge(nodes[a], b)) {
      if (directed) {
        addDirectedEdge(nodes, a, b);
      } else {
        addEdge(nodes, a, b);
      }
    }
  }

  // For directed graphs, ensure all nodes are reachable from at least one other node
  // by adding reverse edges for spanning tree (connectivity guarantee)
  if (directed) {
    for (let i = 1; i < count; i++) {
      const a = perm[i];
      const b = perm[Math.floor(Math.random() * i)];
      if (!hasEdge(nodes[b], a)) {
        addDirectedEdge(nodes, b, a);
      }
    }
  }

  // Mark targets
  const targetCount = mod.targetCount || 3;
  const candidates = nodes.filter(n => n.type !== NodeType.Overlord).map(n => n.id);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const nonOverlordTargets = Math.min(mod.overlordIsTarget ? targetCount - 1 : targetCount, candidates.length);
  for (let i = 0; i < nonOverlordTargets; i++) {
    nodes[candidates[i]].isTarget = true;
    if (mod.hiddenTargets) {
      nodes[candidates[i]]._isTargetInternal = true;
      nodes[candidates[i]].isTarget = false;
    }
  }

  // KERNEL: Overlord is also a target
  if (mod.overlordIsTarget) {
    const overlordNode = nodes.find(n => n.type === NodeType.Overlord);
    if (overlordNode) {
      overlordNode.isTarget = true;
      if (mod.hiddenTargets) {
        overlordNode._isTargetInternal = true;
        overlordNode.isTarget = false;
      }
    }
  }

  // Guarantee minimum Server nodes based on network size (skip if noServers)
  if (!mod.noServers) {
    const minServers = count <= 10 ? 1 : count <= 13 ? 2 : 3;
    let serverCount = nodes.filter(n => n.type === NodeType.Server).length;
    if (serverCount < minServers) {
      const convertible = nodes
        .filter(n => n.type !== NodeType.Overlord && !n.isTarget && !n._isTargetInternal && n.type !== NodeType.Server)
        .map(n => n.id);
      for (let i = convertible.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [convertible[i], convertible[j]] = [convertible[j], convertible[i]];
      }
      for (let i = 0; i < convertible.length && serverCount < minServers; i++) {
        const n = nodes[convertible[i]];
        n.type = NodeType.Server;
        n.name = generateName(NodeType.Server);
        while (usedNames.has(n.name)) n.name = generateName(NodeType.Server);
        usedNames.add(n.name);
        serverCount++;
      }
    }
  }

  // Assign ICE traps to 2-4 random non-Overlord, non-target nodes
  const iceTypes = ['drain', 'lock', 'alert'];
  const iceCount = 2 + Math.floor(Math.random() * 3); // 2-4
  const iceCandidates = nodes
    .filter(n => n.type !== NodeType.Overlord && !n.isTarget && !n._isTargetInternal)
    .map(n => n.id);
  for (let i = iceCandidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [iceCandidates[i], iceCandidates[j]] = [iceCandidates[j], iceCandidates[i]];
  }
  for (let i = 0; i < iceCount && i < iceCandidates.length; i++) {
    nodes[iceCandidates[i]].ice = iceTypes[Math.floor(Math.random() * iceTypes.length)];
  }

  // BREACH: all nodes start Discovered
  if (mod.allDiscovered) {
    for (const n of nodes) {
      n.state = NodeState.Discovered;
    }
  }

  // CIPHER: reveal ICE traps (mark them visible but still trigger on crack)
  // The map display already shows [ICE] for nodes with ice — so this is handled naturally
  // since all nodes with ice will be discoverable and show [ICE] on the map.
  // CIPHER's iceRevealed effect: during scan, also reveal ice status for adjacent nodes.
  // This is already shown in map via [ICE] marker — the modifier just means players can see it before cracking.

  return { nodes, directed };
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
 * @param {Node[]} nodes
 * @param {number} a
 * @param {number} b
 */
function addDirectedEdge(nodes, a, b) {
  nodes[a].edges.push(b);
}

/**
 * @param {Node} node
 * @param {number} target
 */
function hasEdge(node, target) {
  return node.edges.includes(target);
}

/**
 * Rewire one random edge: remove a random edge and add a new random one.
 * Ensures the graph stays connected by not removing bridge edges if possible.
 * @param {Network} net
 */
export function rewireEdge(net) {
  const nodes = net.nodes;
  const count = nodes.length;

  // Collect all edges
  /** @type {[number, number][]} */
  const allEdges = [];
  for (const n of nodes) {
    for (const eid of n.edges) {
      if (n.id < eid || net.directed) {
        allEdges.push([n.id, eid]);
      }
    }
  }
  if (allEdges.length <= count) return; // Don't remove if too few edges

  // Remove a random non-spanning-tree edge (one where both endpoints have degree > 1)
  const removable = allEdges.filter(([a, b]) => nodes[a].edges.length > 1 && nodes[b].edges.length > 1);
  if (removable.length === 0) return;

  const [ra, rb] = removable[Math.floor(Math.random() * removable.length)];
  nodes[ra].edges = nodes[ra].edges.filter(e => e !== rb);
  if (!net.directed) {
    nodes[rb].edges = nodes[rb].edges.filter(e => e !== ra);
  }

  // Add a new random edge
  for (let attempt = 0; attempt < 20; attempt++) {
    const a = Math.floor(Math.random() * count);
    const b = Math.floor(Math.random() * count);
    if (a !== b && !hasEdge(nodes[a], b)) {
      if (net.directed) {
        addDirectedEdge(nodes, a, b);
      } else {
        addEdge(nodes, a, b);
      }
      break;
    }
  }
}

/**
 * BFS shortest path from startId to endId. Returns array of node IDs (path), or empty if unreachable.
 * @param {Network} net
 * @param {number} startId
 * @param {number} endId
 * @returns {number[]}
 */
export function bfs(net, startId, endId) {
  if (startId === endId) return [startId];
  const visited = new Set([startId]);
  /** @type {Map<number, number>} */
  const parent = new Map();
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const neighbor of net.nodes[current].edges) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      parent.set(neighbor, current);
      if (neighbor === endId) {
        // Reconstruct path
        const path = [endId];
        let node = endId;
        while (node !== startId) {
          node = parent.get(node);
          path.unshift(node);
        }
        return path;
      }
      queue.push(neighbor);
    }
  }
  return [];
}

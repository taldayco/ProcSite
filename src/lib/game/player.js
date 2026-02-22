import { NodeType, NodeState, getNode, bfs } from './network.js';

/**
 * @typedef {{
 *   data: number,
 *   detection: number,
 *   currentNode: number,
 *   cloakTurns: number,
 *   hopCount: number,
 *   spikeCount: number,
 * }} Player
 */

/**
 * @typedef {{
 *   active: boolean,
 *   neutralized: boolean,
 * }} OverlordState
 */

/**
 * @param {import('./network.js').Network} net
 * @returns {Player}
 */
export function newPlayer(net) {
  const overlordNode = net.nodes.find(n => n.type === NodeType.Overlord);
  const overlordId = overlordNode ? overlordNode.id : -1;

  // Filter candidates to be ≥2 hops from the Overlord
  let candidates = net.nodes
    .filter(n => n.type !== NodeType.Overlord && !n.isTarget && n.edges.length >= 2)
    .map(n => n.id);

  if (overlordId !== -1) {
    const farCandidates = candidates.filter(id => {
      const path = bfs(net, id, overlordId);
      return path.length === 0 || path.length > 2; // path includes start+end, so >2 means ≥2 hops
    });
    if (farCandidates.length > 0) candidates = farCandidates;
  }

  const startID = candidates[Math.floor(Math.random() * candidates.length)];
  net.nodes[startID].state = NodeState.Discovered;

  return {
    data: 10 + Math.floor(Math.random() * 11), // 10-20
    detection: 0,
    currentNode: startID,
    cloakTurns: 0,
    hopCount: 0,
    spikeCount: 0,
  };
}

/** @param {Player} player */
export function isAlive(player) {
  return player.data > 0 && player.detection < 1.0;
}

/** @param {Player} player */
export function loseReason(player) {
  if (player.data <= 0) return 'DATA DEPLETED';
  if (player.detection >= 1.0) return 'DETECTED BY OVERLORD';
  return '';
}

// ── Traces ──

/**
 * @typedef {{ id: number, currentNode: number }} Trace
 */

let traceIdCounter = 0;

/**
 * Spawn a trace at the Overlord node.
 * @param {{ network: import('./network.js').Network, traces: Trace[] }} gs
 */
export function spawnTrace(gs) {
  const overlordNode = gs.network.nodes.find(n => n.type === NodeType.Overlord);
  if (!overlordNode) return;
  gs.traces.push({ id: traceIdCounter++, currentNode: overlordNode.id });
}

/**
 * Move all traces one step toward the player via BFS.
 * @param {{ network: import('./network.js').Network, player: Player, traces: Trace[] }} gs
 * @returns {string[]} warning messages
 */
export function moveTraces(gs) {
  const messages = [];
  for (const trace of gs.traces) {
    const path = bfs(gs.network, trace.currentNode, gs.player.currentNode);
    if (path.length > 1) {
      trace.currentNode = path[1];
    }
    if (trace.currentNode === gs.player.currentNode) {
      gs.player.detection += 0.25;
      if (gs.player.detection > 1.0) gs.player.detection = 1.0;
      messages.push('>> TRACE PROGRAM reached your node! (+25% DETECTION)');
    }
  }
  return messages;
}

// ── Rival Hacker ──

/**
 * @typedef {{ currentNode: number, moveCounter: number, targetServer: number|null, extractedCount: number }} Rival
 */

/**
 * @param {import('./network.js').Network} net
 * @param {number} playerStart
 * @returns {Rival}
 */
export function newRival(net, playerStart) {
  const overlordId = net.nodes.find(n => n.type === NodeType.Overlord)?.id ?? -1;
  const candidates = net.nodes
    .filter(n => n.id !== playerStart && n.id !== overlordId)
    .map(n => n.id);
  const startNode = candidates[Math.floor(Math.random() * candidates.length)];
  return {
    currentNode: startNode,
    moveCounter: 3,
    targetServer: null,
    extractedCount: 0,
  };
}

/**
 * Move the rival toward nearest un-extracted Server. If it arrives, extract it.
 * @param {{ network: import('./network.js').Network, rival: Rival }} gs
 * @returns {string[]} warning messages
 */
export function moveRival(gs) {
  const rival = gs.rival;
  const messages = [];

  rival.moveCounter--;
  if (rival.moveCounter > 0) return messages;

  // Reset counter
  rival.moveCounter = 3;

  // Find nearest un-extracted server
  let bestPath = /** @type {number[]} */ ([]);
  for (const node of gs.network.nodes) {
    if (node.type === NodeType.Server && !node.extracted) {
      const path = bfs(gs.network, rival.currentNode, node.id);
      if (path.length > 0 && (bestPath.length === 0 || path.length < bestPath.length)) {
        bestPath = path;
      }
    }
  }

  if (bestPath.length > 1) {
    rival.currentNode = bestPath[1];
  }

  // Check if rival is on an un-extracted server
  const currentNode = gs.network.nodes[rival.currentNode];
  if (currentNode.type === NodeType.Server && !currentNode.extracted) {
    currentNode.extracted = true;
    rival.extractedCount++;
    messages.push(`>> RIVAL HACKER extracted data from ${currentNode.name}!`);
  }

  return messages;
}

/** @returns {OverlordState} */
export function newOverlord() {
  return { active: false, neutralized: false };
}

/**
 * @param {OverlordState} overlord
 * @param {Player} player
 * @param {import('./network.js').Network} net
 * @returns {string}
 */
export function overlordCheck(overlord, player, net) {
  if (overlord.neutralized) return '';

  if (!overlord.active) {
    overlord.active = true;
    return '';
  }

  // Detection chance: 15% + 8% * floor(hopCount / 3)
  let chance = 0.15 + 0.08 * Math.floor(player.hopCount / 3);
  if (player.cloakTurns > 0) chance /= 2;

  if (Math.random() >= chance) return '';

  // Punishment
  const punishment = Math.floor(Math.random() * 3);
  switch (punishment) {
    case 0: // Alert
      player.detection += 0.20;
      if (player.detection > 1.0) player.detection = 1.0;
      return '>> OVERLORD ALERT: Detection surge detected! (+20% DETECTION)';
    case 1: // Drain
      player.data -= 3;
      if (player.data < 0) player.data = 0;
      return '>> OVERLORD DRAIN: Data siphoned from your reserves! (-3 DATA)';
    case 2: { // Lockout
      const node = getNode(net, player.currentNode);
      if (node && node.state !== NodeState.Locked && node.state !== NodeState.Spiked) {
        node.state = NodeState.Locked;
        return `>> OVERLORD LOCKOUT: ${node.name} has been locked!`;
      }
      // Fallback to alert
      player.detection += 0.20;
      if (player.detection > 1.0) player.detection = 1.0;
      return '>> OVERLORD ALERT: Detection surge detected! (+20% DETECTION)';
    }
  }
  return '';
}

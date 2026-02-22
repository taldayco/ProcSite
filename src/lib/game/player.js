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
 * @param {import('./modifiers.js').ModifierConfig} [mod]
 * @returns {Player}
 */
export function newPlayer(net, mod = {}) {
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
  // BREACH sets all to Discovered already, but ensure start node is discovered regardless
  net.nodes[startID].state = NodeState.Discovered;

  return {
    data: 10 + Math.floor(Math.random() * 11), // 10-20
    detection: mod.startDetection || 0,
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
 * @param {{ network: import('./network.js').Network, player: Player, traces: Trace[], mod?: import('./modifiers.js').ModifierConfig }} gs
 * @returns {string[]} warning messages
 */
export function moveTraces(gs) {
  const messages = [];
  const contactDetection = (gs.mod && gs.mod.traceContactDetection) || 0.25;
  for (const trace of gs.traces) {
    const path = bfs(gs.network, trace.currentNode, gs.player.currentNode);
    if (path.length > 1) {
      trace.currentNode = path[1];
    }
    if (trace.currentNode === gs.player.currentNode) {
      gs.player.detection += contactDetection;
      if (gs.player.detection > 1.0) gs.player.detection = 1.0;
      const pct = Math.round(contactDetection * 100);
      messages.push(`>> TRACE PROGRAM reached your node! (+${pct}% DETECTION)`);
    }
  }
  return messages;
}

// ── Rival Hacker ──

/**
 * @typedef {{ currentNode: number, moveCounter: number, targetServer: number|null, extractedCount: number, extractingTurns: number, extractedTargets: number }} Rival
 */

/**
 * @param {import('./network.js').Network} net
 * @param {number} playerStart
 * @param {import('./modifiers.js').ModifierConfig} [mod]
 * @returns {Rival}
 */
export function newRival(net, playerStart, mod = {}) {
  const overlordId = net.nodes.find(n => n.type === NodeType.Overlord)?.id ?? -1;
  const candidates = net.nodes
    .filter(n => n.id !== playerStart && n.id !== overlordId)
    .map(n => n.id);
  const startNode = candidates[Math.floor(Math.random() * candidates.length)];
  const moveInterval = mod.rivalMoveInterval || 3;
  return {
    currentNode: startNode,
    moveCounter: moveInterval,
    targetServer: null,
    extractedCount: 0,
    extractingTurns: 0,
    extractedTargets: 0,
  };
}

/**
 * Move the rival toward nearest un-extracted target. If it arrives, extract over 2 turns.
 * @param {{ network: import('./network.js').Network, rival: Rival|null, mod?: import('./modifiers.js').ModifierConfig }} gs
 * @returns {string[]} warning messages
 */
export function moveRival(gs) {
  if (!gs.rival) return [];

  const rival = gs.rival;
  const messages = [];
  const moveInterval = (gs.mod && gs.mod.rivalMoveInterval) || 3;

  // If currently extracting, count down instead of moving
  if (rival.extractingTurns > 0) {
    rival.extractingTurns--;
    if (rival.extractingTurns > 0) {
      const node = gs.network.nodes[rival.targetServer];
      messages.push(`>> RIVAL HACKER is extracting ${node.name}... (${rival.extractingTurns} turn(s) left)`);
      return messages;
    }
    // Extraction complete
    const node = gs.network.nodes[rival.targetServer];
    node.extracted = true;
    rival.extractedCount++;
    rival.extractedTargets++;
    rival.targetServer = null;
    messages.push(`>> RIVAL HACKER extracted target ${node.name}!`);
    return messages;
  }

  rival.moveCounter--;
  if (rival.moveCounter > 0) return messages;

  // Reset counter
  rival.moveCounter = moveInterval;

  // Find nearest un-extracted target node
  let bestPath = /** @type {number[]} */ ([]);
  for (const node of gs.network.nodes) {
    if (node.isTarget && !node.extracted) {
      const path = bfs(gs.network, rival.currentNode, node.id);
      if (path.length > 0 && (bestPath.length === 0 || path.length < bestPath.length)) {
        bestPath = path;
      }
    }
  }

  if (bestPath.length > 1) {
    rival.currentNode = bestPath[1];
  }

  // Check if rival is on an un-extracted target — start extracting
  const currentNode = gs.network.nodes[rival.currentNode];
  if (currentNode.isTarget && !currentNode.extracted) {
    rival.extractingTurns = 2;
    rival.targetServer = currentNode.id;
    messages.push(`>> RIVAL HACKER is extracting ${currentNode.name}... (2 turn(s) left)`);
  }

  return messages;
}

/**
 * @param {import('./modifiers.js').ModifierConfig} [mod]
 * @returns {OverlordState}
 */
export function newOverlord(mod = {}) {
  return { active: !!mod.overlordImmediate, neutralized: false };
}

/**
 * @param {OverlordState} overlord
 * @param {Player} player
 * @param {import('./network.js').Network} net
 * @param {import('./modifiers.js').ModifierConfig} [mod]
 * @returns {string}
 */
export function overlordCheck(overlord, player, net, mod = {}) {
  if (overlord.neutralized) return '';

  if (!overlord.active) {
    overlord.active = true;
    return '';
  }

  // Detection chance: 15% + 8% * floor(hopCount / 3), scaled by modifier
  const scaleRate = 0.08 * (mod.overlordScaleMultiplier || 1);
  let chance = 0.15 + scaleRate * Math.floor(player.hopCount / 3);
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

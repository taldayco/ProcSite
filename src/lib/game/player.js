import { NodeType, NodeState, getNode, bfs, generateTraceName } from './network.js';

/**
 * @typedef {{
 *   data: number,
 *   detection: number,
 *   currentNode: number,
 *   cloakTurns: number,
 *   hopCount: number,
 *   spikeCount: number,
 *   visitedNodes: Set<number>,
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
      return path.length > 2; // path includes start+end, so >2 means ≥2 hops
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
    visitedNodes: new Set([startID]),
  };
}

/** @param {Player} player */
export function isAlive(player) {
  return player.detection < 1.0;
}

/** @param {Player} player */
export function loseReason(player) {
  if (player.detection >= 1.0) return 'DETECTED BY OVERLORD';
  return 'NETWORK LOST';
}

// ── Traces ──

/**
 * @typedef {{ id: number, name: string, currentNode: number, moveCooldown: number }} Trace
 */

let traceIdCounter = 0;

/**
 * Spawn a trace at the Overlord node.
 * @param {{ network: import('./network.js').Network, traces: Trace[] }} gs
 */
export function spawnTrace(gs) {
  const overlordNode = gs.network.nodes.find(n => n.type === NodeType.Overlord);
  if (!overlordNode) return;
  // Generate a unique tracer name — retry if already taken by an active trace
  let name;
  const usedNames = new Set(gs.traces.map(t => t.name));
  do { name = generateTraceName(); } while (usedNames.has(name));
  gs.traces.push({ id: traceIdCounter++, name, currentNode: overlordNode.id, moveCooldown: 2 });
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
    // Traces move every 2 turns
    trace.moveCooldown--;
    if (trace.moveCooldown > 0) {
      // Still check contact even when not moving
      if (trace.currentNode === gs.player.currentNode) {
        gs.player.detection += contactDetection;
        if (gs.player.detection > 1.0) gs.player.detection = 1.0;
        const pct = Math.round(contactDetection * 100);
        messages.push(`>> TRACE PROGRAM ${trace.name} reached your node! (+${pct}% DETECTION) [use destroy_${trace.name} from a cracked Turret]`);
      }
      continue;
    }
    trace.moveCooldown = 2;

    // Chase chance scales with detection: 0% at 0 detection, 100% at 50%+ detection
    const chaseChance = Math.min(gs.player.detection / 0.5, 1);

    if (Math.random() < chaseChance) {
      // Chase player via BFS
      const path = bfs(gs.network, trace.currentNode, gs.player.currentNode);
      if (path.length > 1) {
        trace.currentNode = path[1];
      }
    } else {
      // Random movement to a neighbor
      const node = gs.network.nodes[trace.currentNode];
      if (node.edges.length > 0) {
        trace.currentNode = node.edges[Math.floor(Math.random() * node.edges.length)];
      }
    }

    if (trace.currentNode === gs.player.currentNode) {
      gs.player.detection += contactDetection;
      if (gs.player.detection > 1.0) gs.player.detection = 1.0;
      const pct = Math.round(contactDetection * 100);
      messages.push(`>> TRACE PROGRAM ${trace.name} reached your node! (+${pct}% DETECTION) [use destroy_${trace.name} from a cracked Turret]`);
    }
  }

  return messages;
}

// ── Rival Hacker ──

/**
 * @typedef {{
 *   currentNode: number,
 *   moveCounter: number,
 *   targetNode: number|null,
 *   phase: 'moving'|'cracking'|'spiking'|'extracting',
 *   spikedTargets: number,
 * }} Rival
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
  return {
    currentNode: startNode,
    moveCounter: mod.rivalMoveInterval || 3,
    targetNode: null,
    phase: 'moving',
    spikedTargets: 0,
  };
}

/**
 * Move the rival hacker each turn.
 *
 * State machine per move-tick:
 *   moving   → BFS toward nearest un-spiked target; on arrival → 'cracking'
 *   cracking → crack the node (sets NodeState.Cracked)          → 'spiking'
 *   spiking  → spike the node (sets NodeState.Spiked)
 *              if Server                                         → 'extracting'
 *              else                                             → 'moving'
 *   extracting → extract data (sets node.extracted)             → 'moving'
 *
 * @param {{ network: import('./network.js').Network, rival: Rival|null, mod?: import('./modifiers.js').ModifierConfig }} gs
 * @returns {string[]} warning messages
 */
export function moveRival(gs) {
  if (!gs.rival) return [];

  const rival = gs.rival;
  const net = gs.network;
  const messages = [];
  const moveInterval = (gs.mod && gs.mod.rivalMoveInterval) || 3;

  // Phases that don't consume the move counter — they act immediately each tick.
  if (rival.phase === 'cracking') {
    const node = net.nodes[rival.targetNode];
    // Player may have spiked this node before the rival's crack tick fires.
    if (node.state === NodeState.Spiked) {
      const overlordNode = net.nodes.find(n => n.type === NodeType.Overlord);
      const overlordName = overlordNode ? overlordNode.name : 'OVERLORD';
      messages.push(`>> RIVAL HACKER attempted to crack ${node.name} but detected OVERLORD presence instead. ${overlordName} noticed. +10% detection.`);
      rival.targetNode = null;
      rival.phase = 'moving';
      rival.moveCounter = (gs.mod && gs.mod.rivalMoveInterval) || 3;
      if (gs.player) {
        gs.player.detection = Math.min(1.0, gs.player.detection + 0.10);
      }
      if (!gs.overlord.neutralized) {
        spawnTrace(gs);
        messages.push(`>> ${overlordName} deployed a TRACE PROGRAM!`);
      }
      return messages;
    }
    node.state = NodeState.Cracked;
    rival.phase = 'spiking';
    messages.push(`>> RIVAL HACKER cracked ${node.name}!`);
    return messages;
  }

  if (rival.phase === 'spiking') {
    const node = net.nodes[rival.targetNode];
    // Player may have spiked this node on the same turn — player has priority.
    if (node.state === NodeState.Spiked) {
      const overlordNode = net.nodes.find(n => n.type === NodeType.Overlord);
      const overlordName = overlordNode ? overlordNode.name : 'OVERLORD';
      messages.push(`>> RIVAL HACKER attempted to spike ${node.name} but detected OVERLORD presence instead. ${overlordName} noticed. +10% detection.`);
      rival.targetNode = null;
      rival.phase = 'moving';
      rival.moveCounter = (gs.mod && gs.mod.rivalMoveInterval) || 3;
      if (gs.player) {
        gs.player.detection = Math.min(1.0, gs.player.detection + 0.10);
      }
      if (!gs.overlord.neutralized) {
        spawnTrace(gs);
        messages.push(`>> ${overlordName} deployed a TRACE PROGRAM!`);
      }
      return messages;
    }
    node.state = NodeState.Spiked;
    rival.spikedTargets++;
    messages.push(`>> RIVAL HACKER spiked ${node.name}! (${rival.spikedTargets} target(s) taken)`);
    if (node.type === NodeType.Server) {
      rival.phase = 'extracting';
      messages.push(`>> RIVAL HACKER is extracting data from ${node.name}...`);
    } else {
      rival.targetNode = null;
      rival.phase = 'moving';
      rival.moveCounter = moveInterval;
    }
    return messages;
  }

  if (rival.phase === 'extracting') {
    const node = net.nodes[rival.targetNode];
    node.extracted = true;
    rival.targetNode = null;
    rival.phase = 'moving';
    rival.moveCounter = moveInterval;
    messages.push(`>> RIVAL HACKER extracted data from ${node.name}.`);
    return messages;
  }

  // phase === 'moving': count down, then move one step
  rival.moveCounter--;
  if (rival.moveCounter > 0) return messages;
  rival.moveCounter = moveInterval;

  // Find nearest un-spiked target.
  // The rival always knows real targets — even in QUBIT mode where isTarget is
  // hidden from the player until cracked. We check _isTargetInternal as a
  // fallback so the rival navigates correctly regardless.
  let bestPath = /** @type {number[]} */ ([]);
  for (const node of net.nodes) {
    const isRealTarget = node.isTarget || node._isTargetInternal;
    if (isRealTarget && node.state !== NodeState.Spiked) {
      const path = bfs(net, rival.currentNode, node.id);
      if (path.length > 0 && (bestPath.length === 0 || path.length < bestPath.length)) {
        bestPath = path;
      }
    }
  }

  if (bestPath.length > 1) {
    rival.currentNode = bestPath[1];
  }

  // If rival has arrived at an un-spiked target, begin cracking next tick.
  // Again check _isTargetInternal so QUBIT-hidden targets are recognised.
  const current = net.nodes[rival.currentNode];
  if ((current.isTarget || current._isTargetInternal) && current.state !== NodeState.Spiked) {
    rival.targetNode = current.id;
    rival.phase = 'cracking';
    messages.push(`>> RIVAL HACKER has reached ${current.name} — beginning breach...`);
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

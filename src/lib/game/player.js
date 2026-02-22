import { NodeType, NodeState, getNode } from './network.js';

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
  const candidates = net.nodes
    .filter(n => n.type !== NodeType.Overlord && !n.isTarget)
    .map(n => n.id);
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

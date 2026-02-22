import { NodeType, NodeState, NodeTypeNames, NodeTypeCost, generateNetwork, nodeByName, getNode } from './network.js';
import { newPlayer, isAlive, loseReason, newOverlord, overlordCheck } from './player.js';

export const EntryType = {
  System: 'system',
  Error: 'error',
  Success: 'success',
  Info: 'info',
  Input: 'input',
  Warning: 'warning',
};

/**
 * @typedef {{ text: string, type: string }} HistoryEntry
 */

/**
 * @typedef {{
 *   network: import('./network.js').Network,
 *   player: import('./player.js').Player,
 *   overlord: import('./player.js').OverlordState,
 *   won: boolean,
 *   lost: boolean,
 *   killed: boolean,
 * }} GameState
 */

/** @returns {GameState} */
export function newGameState() {
  const network = generateNetwork();
  const player = newPlayer(network);
  return {
    network,
    player,
    overlord: newOverlord(),
    won: false,
    lost: false,
    killed: false,
  };
}

/**
 * @param {GameState} gs
 * @param {string} input
 * @returns {HistoryEntry[]}
 */
export function execute(gs, input) {
  input = input.trim();
  if (!input) return [];

  const parts = input.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  /** @type {HistoryEntry[]} */
  const entries = [{ text: '> ' + input, type: EntryType.Input }];

  switch (cmd) {
    case 'help':
      entries.push(...cmdHelp());
      break;
    case 'status':
      entries.push(...cmdStatus(gs));
      break;
    case 'map':
      entries.push(...cmdMap(gs));
      break;
    case 'scan':
      entries.push(...cmdScan(gs));
      break;
    case 'hop':
      entries.push(...cmdHop(gs, args));
      break;
    case 'crack':
      entries.push(...cmdCrack(gs));
      break;
    case 'spike':
      entries.push(...cmdSpike(gs));
      break;
    case 'cloak':
      entries.push(...cmdCloak(gs));
      break;
    case 'sudo':
      if (args.join(' ').toLowerCase() === 'rm -rf user') {
        entries.push(...cmdSudoRm(gs));
        break;
      }
      // fall through
    default:
      entries.push({ text: `Unknown command: ${cmd}. Type 'help' for commands.`, type: EntryType.Error });
  }

  // Decrement cloak
  if (gs.player.cloakTurns > 0 && cmd !== 'help' && cmd !== 'status' && cmd !== 'map') {
    gs.player.cloakTurns--;
    if (gs.player.cloakTurns === 0) {
      entries.push({ text: '>> Cloak expired.', type: EntryType.Warning });
    }
  }

  // Check lose
  if (!isAlive(gs.player)) {
    gs.lost = true;
  }

  return entries;
}

/** @returns {HistoryEntry[]} */
function cmdHelp() {
  return [
    'Available commands:',
    '  help   - Show this help message',
    '  status - Show current stats',
    '  map    - Show discovered network',
    '  scan   - Reveal connected nodes (1 DATA)',
    '  hop <node> - Move to a connected node (1 DATA)',
    '  crack  - Hack current node (variable DATA cost)',
    '  spike  - Plant spike on cracked target (free)',
    '  cloak  - Reduce detection for 3 turns (3 DATA)',
    '  sudo rm -rf user - undefined',
  ].map(text => ({ text, type: EntryType.Info }));
}

/** @param {GameState} gs */
function cmdStatus(gs) {
  const node = getNode(gs.network, gs.player.currentNode);
  let cloak = '';
  if (gs.player.cloakTurns > 0) {
    cloak = ` | CLOAK: ${gs.player.cloakTurns} turns`;
  }
  return [{
    text: `DATA: ${gs.player.data} | DETECTION: ${Math.floor(gs.player.detection * 100)}% | NODE: ${node.name} | TARGETS: ${gs.player.spikeCount}/3${cloak}`,
    type: EntryType.Info,
  }];
}

/**
 * @param {import('./network.js').Node} node
 * @param {GameState} gs
 */
function nodeEntryType(node, gs) {
  if (node.id === gs.player.currentNode) return EntryType.Info;
  if (node.state === NodeState.Locked) return EntryType.Error;
  if (node.isTarget) return EntryType.Warning;
  if (node.state === NodeState.Cracked || node.state === NodeState.Spiked) return EntryType.Success;
  return EntryType.System;
}

/** @param {GameState} gs */
function cmdMap(gs) {
  /** @type {HistoryEntry[]} */
  const entries = [{ text: '=== NETWORK MAP ===', type: EntryType.Info }];

  for (const n of gs.network.nodes) {
    if (n.state === NodeState.Undiscovered) continue;

    let marker = '[ ]';
    if (n.id === gs.player.currentNode) marker = '[*]';
    else if (n.state === NodeState.Cracked) marker = '[+]';
    else if (n.state === NodeState.Spiked) marker = '[S]';
    else if (n.state === NodeState.Locked) marker = '[X]';

    const target = n.isTarget ? ' (TARGET)' : '';
    entries.push({
      text: `${marker} ${n.name} [${NodeTypeNames[n.type]}]${target}`,
      type: nodeEntryType(n, gs),
    });

    // Show connections to discovered nodes
    for (const eid of n.edges) {
      const en = getNode(gs.network, eid);
      if (en && en.state !== NodeState.Undiscovered) {
        entries.push({ text: `    |-- ${en.name}`, type: EntryType.System });
      }
    }
  }

  return entries;
}

/** @param {GameState} gs */
function cmdScan(gs) {
  if (gs.player.data < 1) {
    return [{ text: 'Insufficient DATA to scan.', type: EntryType.Error }];
  }

  gs.player.data--;
  const node = getNode(gs.network, gs.player.currentNode);
  let revealed = 0;

  /** @type {HistoryEntry[]} */
  const entries = [{ text: `Scanning from ${node.name}...`, type: EntryType.System }];

  for (const eid of node.edges) {
    const en = getNode(gs.network, eid);
    if (en && en.state === NodeState.Undiscovered) {
      en.state = NodeState.Discovered;
      revealed++;
      const target = en.isTarget ? ' (TARGET)' : '';
      entries.push({
        text: `  Discovered: ${en.name} [${NodeTypeNames[en.type]}]${target}`,
        type: EntryType.Success,
      });
    }
  }

  if (revealed === 0) {
    entries.push({ text: '  No new nodes discovered.', type: EntryType.System });
  }
  entries.push({ text: `-1 DATA (${gs.player.data} remaining)`, type: EntryType.Warning });

  return entries;
}

/**
 * @param {GameState} gs
 * @param {string[]} args
 */
function cmdHop(gs, args) {
  if (args.length === 0) {
    return [{ text: 'Usage: hop <node_name>', type: EntryType.Error }];
  }

  const targetName = args[0].toUpperCase();
  const target = nodeByName(gs.network, targetName);

  if (!target) {
    return [{ text: `Unknown node: ${targetName}`, type: EntryType.Error }];
  }
  if (target.state === NodeState.Undiscovered) {
    return [{ text: "Node not yet discovered. Use 'scan' first.", type: EntryType.Error }];
  }
  if (target.state === NodeState.Locked) {
    return [{ text: 'Node is LOCKED. Cannot hop there.', type: EntryType.Error }];
  }

  // Check adjacency
  const current = getNode(gs.network, gs.player.currentNode);
  if (!current.edges.includes(target.id)) {
    return [{ text: 'Node is not connected to current node.', type: EntryType.Error }];
  }

  if (gs.player.data < 1) {
    return [{ text: 'Insufficient DATA to hop.', type: EntryType.Error }];
  }

  gs.player.data--;
  gs.player.currentNode = target.id;
  gs.player.hopCount++;

  /** @type {HistoryEntry[]} */
  const entries = [{
    text: `Hopped to ${target.name}. -1 DATA (${gs.player.data} remaining)`,
    type: EntryType.Info,
  }];

  // Overlord check
  const msg = overlordCheck(gs.overlord, gs.player, gs.network);
  if (msg) {
    entries.push({ text: msg, type: EntryType.Error });
  }

  return entries;
}

/** @param {GameState} gs */
function cmdCrack(gs) {
  const node = getNode(gs.network, gs.player.currentNode);

  if (node.state === NodeState.Cracked || node.state === NodeState.Spiked) {
    return [{ text: 'Node already cracked.', type: EntryType.Error }];
  }
  if (node.state === NodeState.Locked) {
    return [{ text: 'Node is LOCKED. Cannot crack.', type: EntryType.Error }];
  }

  const cost = NodeTypeCost[node.type];
  if (gs.player.data < cost) {
    return [{ text: `Insufficient DATA. Crack cost: ${cost}, you have: ${gs.player.data}`, type: EntryType.Error }];
  }

  gs.player.data -= cost;
  node.state = NodeState.Cracked;

  /** @type {HistoryEntry[]} */
  const entries = [{
    text: `${node.name} cracked! -${cost} DATA (${gs.player.data} remaining)`,
    type: EntryType.Success,
  }];

  // Cracking the Overlord neutralizes it
  if (node.type === NodeType.Overlord) {
    gs.overlord.neutralized = true;
    entries.push({
      text: '>> OVERLORD NEUTRALIZED. Detection system offline.',
      type: EntryType.Success,
    });
  }

  return entries;
}

/** @param {GameState} gs */
function cmdSpike(gs) {
  const node = getNode(gs.network, gs.player.currentNode);

  if (!node.isTarget) {
    return [{ text: 'This node is not a target.', type: EntryType.Error }];
  }
  if (node.state !== NodeState.Cracked) {
    return [{ text: 'Node must be cracked before spiking.', type: EntryType.Error }];
  }

  node.state = NodeState.Spiked;
  gs.player.spikeCount++;

  /** @type {HistoryEntry[]} */
  const entries = [{
    text: `SPIKE PLANTED on ${node.name}! (${gs.player.spikeCount}/3)`,
    type: EntryType.Success,
  }];

  if (gs.player.spikeCount >= 3) {
    gs.won = true;
    entries.push({ text: 'ALL TARGETS SPIKED!', type: EntryType.Success });
  }

  return entries;
}

/** @param {GameState} gs */
function cmdCloak(gs) {
  if (gs.player.data < 3) {
    return [{ text: 'Insufficient DATA. Cloak costs 3 DATA.', type: EntryType.Error }];
  }

  gs.player.data -= 3;
  gs.player.cloakTurns = 3;

  return [{
    text: `Cloak activated for 3 turns. -3 DATA (${gs.player.data} remaining)`,
    type: EntryType.Success,
  }];
}

/** @param {GameState} gs */
function cmdSudoRm(gs) {
  gs.killed = true;
  gs.lost = true;
  return [{ text: 'USER DELETED.', type: EntryType.Error }];
}

/** @param {GameState} gs */
export function buildGameOverEntries(gs) {
  /** @type {HistoryEntry[]} */
  const entries = [{ text: '', type: EntryType.System }];

  if (gs.won) {
    entries.push(
      { text: '╔══════════════════════════════════╗', type: EntryType.Success },
      { text: '║        MISSION COMPLETE          ║', type: EntryType.Success },
      { text: '║     ALL TARGETS NEUTRALIZED      ║', type: EntryType.Success },
      { text: '╚══════════════════════════════════╝', type: EntryType.Success },
    );
  } else {
    const reason = loseReason(gs.player);
    entries.push(
      { text: '╔══════════════════════════════════╗', type: EntryType.Error },
      { text: '║         MISSION FAILED           ║', type: EntryType.Error },
      { text: `║  ${reason.padStart(16 + reason.length / 2).padEnd(32)}║`, type: EntryType.Error },
      { text: '╚══════════════════════════════════╝', type: EntryType.Error },
    );
  }

  entries.push(
    { text: '', type: EntryType.System },
    { text: `  Hops: ${gs.player.hopCount}  |  Targets spiked: ${gs.player.spikeCount}/3  |  DATA remaining: ${gs.player.data}`, type: EntryType.Info },
    { text: '', type: EntryType.System },
  );

  return entries;
}

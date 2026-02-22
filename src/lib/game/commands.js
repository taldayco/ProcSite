import { NodeType, NodeState, NodeTypeNames, NodeTypeCost, generateNetwork, nodeByName, getNode } from './network.js';
import { newPlayer, isAlive, loseReason, newOverlord, overlordCheck, spawnTrace, moveTraces, newRival, moveRival } from './player.js';

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
 *   traces: import('./player.js').Trace[],
 *   rival: import('./player.js').Rival,
 *   won: boolean,
 *   lost: boolean,
 *   killed: boolean,
 *   devCheat: boolean,
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
    traces: [],
    rival: newRival(network, player.currentNode),
    won: false,
    lost: false,
    killed: false,
    devCheat: false,
    _justHopped: false,
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
    case 'extract':
      entries.push(...cmdExtract(gs));
      break;
    case 'cloak':
      entries.push(...cmdCloak(gs));
      break;
    case 'dev_cheat':
      gs.won = true;
      gs.devCheat = true;
      entries.push({ text: '>> DEV CHEAT: AUTO-WIN', type: EntryType.Success });
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
  const isAction = ['hop', 'crack', 'scan', 'extract', 'cloak', 'spike'].includes(cmd);
  if (gs.player.cloakTurns > 0 && isAction) {
    gs.player.cloakTurns--;
    if (gs.player.cloakTurns === 0) {
      entries.push({ text: '>> Cloak expired.', type: EntryType.Warning });
    }
  }

  // Post-turn effects for action commands
  if (isAction) {
    entries.push(...postTurnEffects(gs));
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
    '  extract - Extract data from cracked Server (free)',
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
  const traces = gs.traces.length > 0 ? ` | TRACES: ${gs.traces.length}` : '';
  const rival = gs.rival ? ` | RIVAL: ${gs.rival.extractedCount} extracted` : '';
  return [{
    text: `DATA: ${gs.player.data} | DETECTION: ${Math.floor(gs.player.detection * 100)}% | NODE: ${node.name} | TARGETS: ${gs.player.spikeCount}/3${cloak}${traces}${rival}`,
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
    const hasTrace = gs.traces.some(t => t.currentNode === n.id) ? ' [!]' : '';
    const hasRival = gs.rival && gs.rival.currentNode === n.id ? ' [R]' : '';
    const hasIce = n.ice && n.state !== NodeState.Cracked && n.state !== NodeState.Spiked ? ' [ICE]' : '';
    const extracted = n.extracted ? ' (EXTRACTED)' : '';
    entries.push({
      text: `${marker} ${n.name} [${NodeTypeNames[n.type]}]${target}${extracted}${hasIce}${hasTrace}${hasRival}`,
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
      const ice = en.ice ? ' [ICE]' : '';
      entries.push({
        text: `  Discovered: ${en.name} [${NodeTypeNames[en.type]}]${target}${ice}`,
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
  gs._justHopped = true;

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

  // ICE trap trigger
  if (node.ice) {
    switch (node.ice) {
      case 'drain':
        gs.player.data -= 2;
        if (gs.player.data < 0) gs.player.data = 0;
        entries.push({ text: '>> ICE TRAP [DRAIN]: -2 DATA!', type: EntryType.Error });
        break;
      case 'lock': {
        const adjacent = node.edges.filter(eid => {
          const adj = getNode(gs.network, eid);
          return adj && adj.state !== NodeState.Locked && adj.state !== NodeState.Spiked && adj.state !== NodeState.Undiscovered;
        });
        if (adjacent.length > 0) {
          const lockTarget = getNode(gs.network, adjacent[Math.floor(Math.random() * adjacent.length)]);
          lockTarget.state = NodeState.Locked;
          entries.push({ text: `>> ICE TRAP [LOCK]: ${lockTarget.name} has been locked!`, type: EntryType.Error });
        }
        break;
      }
      case 'alert':
        gs.player.detection += 0.15;
        if (gs.player.detection > 1.0) gs.player.detection = 1.0;
        entries.push({ text: '>> ICE TRAP [ALERT]: +15% DETECTION!', type: EntryType.Error });
        break;
    }
    node.ice = null;
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
function cmdExtract(gs) {
  const node = getNode(gs.network, gs.player.currentNode);

  if (node.type !== NodeType.Server) {
    return [{ text: 'This is not a Server node.', type: EntryType.Error }];
  }
  if (node.state !== NodeState.Cracked && node.state !== NodeState.Spiked) {
    return [{ text: 'Node must be cracked before extracting.', type: EntryType.Error }];
  }
  if (node.extracted) {
    return [{ text: 'Data already extracted from this server.', type: EntryType.Error }];
  }

  const reward = 3 + Math.floor(Math.random() * 3); // 3-5
  gs.player.data += reward;
  node.extracted = true;

  return [{
    text: `Data extracted from ${node.name}! +${reward} DATA (${gs.player.data} total)`,
    type: EntryType.Success,
  }];
}

/**
 * Post-turn effects: move traces, check trace contact, spawn traces, move rival.
 * @param {GameState} gs
 * @returns {HistoryEntry[]}
 */
function postTurnEffects(gs) {
  /** @type {HistoryEntry[]} */
  const entries = [];

  // Move traces toward player
  const traceMessages = moveTraces(gs);
  for (const msg of traceMessages) {
    entries.push({ text: msg, type: EntryType.Error });
  }

  // Spawn new trace every 4 hops while Overlord is active and not neutralized
  if (!gs.overlord.neutralized && gs.player.hopCount > 0 && gs.player.hopCount % 4 === 0 && gs._justHopped) {
    spawnTrace(gs);
    entries.push({ text: '>> New TRACE PROGRAM deployed from Overlord!', type: EntryType.Warning });
  }
  gs._justHopped = false;

  // Move rival
  const rivalMessages = moveRival(gs);
  for (const msg of rivalMessages) {
    entries.push({ text: msg, type: EntryType.Warning });
  }

  return entries;
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

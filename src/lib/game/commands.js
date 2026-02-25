import {
  NodeType,
  NodeState,
  NodeTypeNames,
  NodeTypeCost,
  generateNetwork,
  nodeByName,
  getNode,
  rewireEdge,
} from "./network.js";
import {
  newPlayer,
  isAlive,
  loseReason,
  newOverlord,
  overlordCheck,
  spawnTrace,
  moveTraces,
  newRival,
  moveRival,
} from "./player.js";
import { getModifier } from "./modifiers.js";

export const EntryType = {
  System: "system",
  Error: "error",
  Success: "success",
  Info: "info",
  Input: "input",
  Warning: "warning",
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
 *   mod: import('./modifiers.js').ModifierConfig,
 *   won: boolean,
 *   lost: boolean,
 *   killed: boolean,
 *   devCheat: boolean,
 *   score: number,
 *   actionCount: number,
 *   _cameraFeedTurns: number,
 *   _jammedNodes: Set<number>,
 *   _jamTurns: number,
 *   _sniffTraceBlock: boolean,
 *   _freeCrackTurn: boolean,
 * }} GameState
 */

/**
 * @param {string} [word]
 * @returns {GameState}
 */
export function newGameState(word = "") {
  const mod = getModifier(word);
  const network = generateNetwork(mod);
  const player = newPlayer(network, mod);
  return {
    network,
    player,
    overlord: newOverlord(mod),
    traces: [],
    rival: newRival(network, player.currentNode, mod),
    mod,
    won: false,
    lost: false,
    killed: false,
    score: 0,
    devCheat: false,
    actionCount: 0,
    _justHopped: false,
    _cameraFeedTurns: 0,
    _jammedNodes: new Set(),
    _jamTurns: 0,
    _sniffTraceBlock: false,
    _freeCrackTurn: false,
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
  const entries = [{ text: "> " + input, type: EntryType.Input }];

  switch (cmd) {
    case "help":
      entries.push(...cmdHelp(gs));
      break;
    case "status":
      entries.push(...cmdStatus(gs));
      break;
    case "map":
      entries.push(...cmdMap(gs));
      break;
    case "scan":
      entries.push(...cmdScan(gs));
      break;
    case "hop":
      entries.push(...cmdHop(gs, args));
      break;
    case "crack":
      entries.push(...cmdCrack(gs));
      break;
    case "spike":
      entries.push(...cmdSpike(gs));
      break;
    case "extract":
      entries.push(...cmdExtract(gs));
      break;
    case "pass":
      entries.push(...cmdPass(gs));
      break;
    case "cloak":
      entries.push(...cmdCloak(gs));
      break;
    case "kill":
      entries.push(...cmdKill(gs));
      break;
    case "feed":
      entries.push(...cmdFeed(gs));
      break;
    case "jam":
      entries.push(...cmdJam(gs));
      break;
    case "bridge":
      entries.push(...cmdBridge(gs, args));
      break;
    case "sniff":
      entries.push(...cmdSniff(gs));
      break;
    case "relay":
      entries.push(...cmdRelay(gs, args));
      break;
    case "drain":
      entries.push(...cmdDrain(gs));
      break;
    case "overload":
      entries.push(...cmdOverload(gs));
      break;
    case "bypass":
      entries.push(...cmdBypass(gs, args));
      break;
    case "shatter":
      entries.push(...cmdShatter(gs));
      break;
    case "dev_cheat":
      gs.won = true;
      gs.devCheat = true;
      entries.push({ text: ">> DEV CHEAT: AUTO-WIN", type: EntryType.Success });
      break;
    case "sudo":
      if (args.join(" ").toLowerCase() === "rm -rf user") {
        entries.push(...cmdSudoRm(gs));
        break;
      }
    // fall through
    default:
      entries.push({
        text: `Unknown command: ${cmd}. Type 'help' for commands.`,
        type: EntryType.Error,
      });
  }

  // Decrement cloak
  const isAction = [
    "hop",
    "crack",
    "scan",
    "extract",
    "cloak",
    "spike",
    "kill",
    "pass",
    "feed",
    "jam",
    "bridge",
    "sniff",
    "relay",
    "drain",
    "overload",
    "bypass",
    "shatter",
  ].includes(cmd);
  if (gs.player.cloakTurns > 0 && isAction) {
    gs.player.cloakTurns--;
    if (gs.player.cloakTurns === 0) {
      entries.push({ text: ">> Cloak expired.", type: EntryType.Warning });
    }
  }

  // Post-turn effects for action commands
  if (isAction) {
    gs.actionCount++;

    // PULSE: passive detection each action
    if (gs.mod.passiveDetection) {
      gs.player.detection += gs.mod.passiveDetection;
      if (gs.player.detection > 1.0) gs.player.detection = 1.0;
      const pct = Math.round(gs.mod.passiveDetection * 100);
      entries.push({
        text: `>> HEARTBEAT: +${pct}% passive detection`,
        type: EntryType.Warning,
      });
    }

    // FLUX: rewire an edge every N actions
    if (gs.mod.fluxInterval && gs.actionCount % gs.mod.fluxInterval === 0) {
      rewireEdge(gs.network);
      entries.push({
        text: ">> FLUX: Network topology shifted! An edge has been rewired.",
        type: EntryType.Warning,
      });
    }

    // EPOCH: check action limit
    if (gs.mod.actionLimit && gs.actionCount >= gs.mod.actionLimit && !gs.won) {
      gs.player.detection = 1.0;
      entries.push({
        text: `>> TIME\'S UP! Action limit (${gs.mod.actionLimit}) reached.`,
        type: EntryType.Error,
      });
    }

    entries.push(...postTurnEffects(gs));
  }

  // Check lose
  if (!isAlive(gs.player)) {
    gs.killed = true;
    gs.lost = true;
  }

  return entries;
}

/**
 * @param {GameState} gs
 * @returns {HistoryEntry[]}
 */
function cmdHelp(gs) {
  const mod = gs.mod;
  const hopCost = mod.hopCost !== undefined ? mod.hopCost : 1;
  const scanCost = mod.scanCost !== undefined ? mod.scanCost : 1;
  const cloakCost = mod.freeCloakCost !== undefined ? mod.freeCloakCost : 3;
  const cm = mod.costMultiplier || 1;

  /** @type {HistoryEntry[]} */
  const lines = [
    "Available commands:",
    "  help   - Show this help message",
    "  status - Show current stats, connected nodes, and commands available at this node",
    "  map    - Show discovered network",
    `  scan   - Reveal connected nodes (${scanCost * cm} DATA)`,
    `  hop <node> - Move to a ${mod.hopAnywhere ? "discovered" : "connected"} node (free if visited & <50% detection, else ${hopCost * cm} DATA)`,
    "  crack  - Hack current node (variable DATA cost)",
    "  spike  - Plant spike on cracked target (free)",
    "  extract - Extract data from cracked Server (free)",
    "  pass   - gain 1 DATA, +5% detection",
    `  cloak  - Reduce detection for 3 turns (${cloakCost * cm} DATA)`,
    "  kill   - Eliminate rival hacker at your node (2 DATA)",
    "  sudo rm -rf user - undefined",
  ].map((text) => ({ text, type: EntryType.Info }));

  if (mod.name) {
    lines.push({ text: "", type: EntryType.System });
    lines.push({
      text: `Active modifier: ${mod.name} — ${mod.description}`,
      type: EntryType.Warning,
    });
  }

  return lines;
}

/** @param {GameState} gs */
function cmdStatus(gs) {
  const node = getNode(gs.network, gs.player.currentNode);
  const mod = gs.mod;
  const targetCount = mod.targetCount || 3;

  // Header stats line
  const cloak =
    gs.player.cloakTurns > 0 ? ` | CLOAK: ${gs.player.cloakTurns} turns` : "";
  const traces = gs.traces.length > 0 ? ` | TRACES: ${gs.traces.length}` : "";
  const rival = gs.rival ? ` | RIVAL: ${gs.rival.spikedTargets} spiked` : "";
  const epoch = mod.actionLimit
    ? ` | ACTIONS: ${gs.actionCount}/${mod.actionLimit}`
    : "";

  /** @type {HistoryEntry[]} */
  const entries = [
    {
      text: `DATA: ${gs.player.data} | DETECTION: ${Math.floor(gs.player.detection * 100)}% | NODE: ${node.name} [${NodeTypeNames[node.type]}] | TARGETS: ${gs.player.spikeCount}/${targetCount}${cloak}${traces}${rival}${epoch}`,
      type: EntryType.Info,
    },
  ];

  // Connected nodes
  const connectedDiscovered = node.edges
    .map((eid) => getNode(gs.network, eid))
    .filter((n) => n && n.state !== NodeState.Undiscovered);

  if (connectedDiscovered.length > 0) {
    entries.push({ text: "Connected nodes:", type: EntryType.System });
    for (const cn of connectedDiscovered) {
      let stateTag = "";
      if (cn.state === NodeState.Cracked) stateTag = " [CRACKED]";
      else if (cn.state === NodeState.Spiked) stateTag = " [SPIKED]";
      else if (cn.state === NodeState.Locked) stateTag = " [LOCKED]";
      const target = cn.isTarget ? " (TARGET)" : "";
      const ice =
        cn.ice &&
        cn.state !== NodeState.Cracked &&
        cn.state !== NodeState.Spiked
          ? " [ICE]"
          : "";
      const hasRival = gs.rival && gs.rival.currentNode === cn.id ? " [R]" : "";
      const hasTrace = gs.traces.some((t) => t.currentNode === cn.id)
        ? " [!]"
        : "";
      entries.push({
        text: `  • ${cn.name} [${NodeTypeNames[cn.type]}]${stateTag}${target}${ice}${hasRival}${hasTrace}`,
        type:
          cn.state === NodeState.Locked
            ? EntryType.Error
            : cn.isTarget
              ? EntryType.Warning
              : EntryType.System,
      });
    }
  } else {
    entries.push({
      text: "No discovered nodes connected from here.",
      type: EntryType.System,
    });
  }

  // Node-specific available commands
  /** @type {string[]} */
  const nodeSpecific = [];

  // crack — if node is not yet cracked/spiked/locked
  if (
    node.state !== NodeState.Cracked &&
    node.state !== NodeState.Spiked &&
    node.state !== NodeState.Locked
  ) {
    const baseCost = NodeTypeCost[node.type] + (mod.crackCostBonus || 0);
    const cost = baseCost * (mod.costMultiplier || 1);
    nodeSpecific.push(`crack (${cost} DATA) — hack this node`);
  }

  // spike — only on cracked target nodes
  if (node.isTarget && node.state === NodeState.Cracked) {
    nodeSpecific.push("spike — plant a spike on this target");
  }

  // extract — only on cracked/spiked Server nodes that haven't been extracted
  if (
    node.type === NodeType.Server &&
    (node.state === NodeState.Cracked || node.state === NodeState.Spiked) &&
    !node.extracted
  ) {
    nodeSpecific.push("extract — pull data from this server");
  }

  // feed — Camera cracked/spiked
  if (
    node.type === NodeType.Camera &&
    (node.state === NodeState.Cracked || node.state === NodeState.Spiked)
  ) {
    nodeSpecific.push(
      "feed — reveal adjacent nodes, gain +1 DATA/turn for 2 turns",
    );
  }

  // jam — Turret cracked/spiked
  if (
    node.type === NodeType.Turret &&
    (node.state === NodeState.Cracked || node.state === NodeState.Spiked)
  ) {
    nodeSpecific.push(
      "jam — suppress hop-detection on connected nodes for 3 turns",
    );
  }

  // bridge — Door cracked/spiked
  if (
    node.type === NodeType.Door &&
    (node.state === NodeState.Cracked || node.state === NodeState.Spiked)
  ) {
    nodeSpecific.push(
      "bridge <nodeA> <nodeB> (2 DATA, +5% det) — create an edge between two discovered nodes",
    );
  }

  // sniff — Comms cracked or spiked
  if (
    node.type === NodeType.Comms &&
    (node.state === NodeState.Cracked || node.state === NodeState.Spiked)
  ) {
    nodeSpecific.push(
      "sniff (1 DATA) — reveal rival location and block next trace spawn",
    );
  }

  // relay — Comms spiked only
  if (
    node.type === NodeType.Comms &&
    node.state === NodeState.Spiked &&
    gs.traces.length > 0
  ) {
    nodeSpecific.push(
      "relay <node> (1 DATA) — redirect a trace program to another node",
    );
  }

  // drain — Power cracked or spiked
  if (
    node.type === NodeType.Power &&
    (node.state === NodeState.Cracked || node.state === NodeState.Spiked)
  ) {
    nodeSpecific.push("drain — +2 DATA, +5% detection");
  }

  // overload — Power spiked only
  if (node.type === NodeType.Power && node.state === NodeState.Spiked) {
    nodeSpecific.push(
      "overload — clear ICE from adjacent nodes, next crack free (+8% detection)",
    );
  }

  // bypass — Firewall cracked or spiked
  if (
    node.type === NodeType.Firewall &&
    (node.state === NodeState.Cracked || node.state === NodeState.Spiked)
  ) {
    nodeSpecific.push(
      "bypass <node> (+3% detection) — unlock an adjacent locked node",
    );
  }

  // shatter — Firewall spiked only
  if (node.type === NodeType.Firewall && node.state === NodeState.Spiked) {
    nodeSpecific.push(
      "shatter (+10% detection) — remove all locks from the entire network",
    );
  }

  // kill — only if rival shares this node
  if (gs.rival && gs.rival.currentNode === gs.player.currentNode) {
    nodeSpecific.push("kill (2 DATA) — eliminate rival hacker [RIVAL IS HERE]");
  }

  if (nodeSpecific.length > 0) {
    entries.push({ text: "Commands at this node:", type: EntryType.System });
    for (const cmd of nodeSpecific) {
      entries.push({ text: `  > ${cmd}`, type: EntryType.Info });
    }
  }

  return entries;
}

/**
 * @param {import('./network.js').Node} node
 * @param {GameState} gs
 */
function nodeEntryType(node, gs) {
  if (node.id === gs.player.currentNode) return EntryType.Info;
  if (node.state === NodeState.Locked) return EntryType.Error;
  if (node.isTarget) return EntryType.Warning;
  if (node.state === NodeState.Cracked || node.state === NodeState.Spiked)
    return EntryType.Success;
  return EntryType.System;
}

/** @param {GameState} gs */
function cmdMap(gs) {
  /** @type {HistoryEntry[]} */
  const entries = [{ text: "=== NETWORK MAP ===", type: EntryType.Info }];
  const directed = gs.network.directed;

  for (const n of gs.network.nodes) {
    if (n.state === NodeState.Undiscovered) continue;

    let marker = "[ ]";
    if (n.id === gs.player.currentNode) marker = "[*]";
    else if (n.state === NodeState.Cracked) marker = "[+]";
    else if (n.state === NodeState.Spiked) marker = "[S]";
    else if (n.state === NodeState.Locked) marker = "[X]";

    const target = n.isTarget ? " (TARGET)" : "";
    const hasTrace = gs.traces.some((t) => t.currentNode === n.id)
      ? " [!]"
      : "";
    const hasRival = gs.rival && gs.rival.currentNode === n.id ? " [R]" : "";
    const hasIce =
      n.ice && n.state !== NodeState.Cracked && n.state !== NodeState.Spiked
        ? " [ICE]"
        : "";
    const extracted = n.extracted ? " (EXTRACTED)" : "";
    entries.push({
      text: `${marker} ${n.name} [${NodeTypeNames[n.type]}]${target}${extracted}${hasIce}${hasTrace}${hasRival}`,
      type: nodeEntryType(n, gs),
    });

    // Show connections to discovered nodes
    for (const eid of n.edges) {
      const en = getNode(gs.network, eid);
      if (en && en.state !== NodeState.Undiscovered) {
        const arrow = directed ? " -->" : " |--";
        entries.push({
          text: `   ${arrow} ${en.name}`,
          type: EntryType.System,
        });
      }
    }
  }

  if (directed) {
    entries.push({
      text: "(Edges are ONE-WAY: arrows show direction)",
      type: EntryType.Warning,
    });
  }

  return entries;
}

/** @param {GameState} gs */
function cmdScan(gs) {
  const mod = gs.mod;
  const baseCost = mod.scanCost !== undefined ? mod.scanCost : 1;
  const cost = baseCost * (mod.costMultiplier || 1);

  if (gs.player.data < cost) {
    return [
      {
        text: `Insufficient DATA to scan. Cost: ${cost}`,
        type: EntryType.Error,
      },
    ];
  }

  gs.player.data -= cost;
  const node = getNode(gs.network, gs.player.currentNode);
  let revealed = 0;

  /** @type {HistoryEntry[]} */
  const entries = [
    { text: `Scanning from ${node.name}...`, type: EntryType.System },
  ];

  for (const eid of node.edges) {
    const en = getNode(gs.network, eid);
    if (en && en.state === NodeState.Undiscovered) {
      en.state = NodeState.Discovered;
      revealed++;
      const target = en.isTarget ? " (TARGET)" : "";
      const ice = en.ice && mod.iceRevealed ? " [ICE]" : "";
      entries.push({
        text: `  Discovered: ${en.name} [${NodeTypeNames[en.type]}]${target}${ice}`,
        type: EntryType.Success,
      });
    }
  }

  if (revealed === 0) {
    entries.push({
      text: "  No new nodes discovered.",
      type: EntryType.System,
    });
  }
  entries.push({
    text: `-${cost} DATA (${gs.player.data} remaining)`,
    type: EntryType.Warning,
  });

  return entries;
}

/**
 * @param {GameState} gs
 * @param {string[]} args
 */
function cmdHop(gs, args) {
  if (args.length === 0) {
    return [{ text: "Usage: hop <node_name>", type: EntryType.Error }];
  }

  const targetName = args[0].toUpperCase();
  const target = nodeByName(gs.network, targetName);

  if (!target) {
    return [{ text: `Unknown node: ${targetName}`, type: EntryType.Error }];
  }
  if (target.state === NodeState.Undiscovered) {
    return [
      {
        text: "Node not yet discovered. Use 'scan' first.",
        type: EntryType.Error,
      },
    ];
  }
  if (target.state === NodeState.Locked) {
    return [
      { text: "Node is LOCKED. Cannot hop there.", type: EntryType.Error },
    ];
  }

  const mod = gs.mod;

  // Check adjacency (unless SOCKET: hopAnywhere)
  if (!mod.hopAnywhere) {
    const current = getNode(gs.network, gs.player.currentNode);
    if (!current.edges.includes(target.id)) {
      return [
        {
          text: "Node is not connected to current node.",
          type: EntryType.Error,
        },
      ];
    }
  }

  const baseCost = mod.hopCost !== undefined ? mod.hopCost : 1;
  let cost = baseCost * (mod.costMultiplier || 1);

  // Free hop to previously visited nodes while detection < 50%
  if (gs.player.visitedNodes.has(target.id) && gs.player.detection < 0.5) {
    cost = 0;
  }

  if (gs.player.data < cost) {
    return [
      {
        text: `Insufficient DATA to hop. Cost: ${cost}`,
        type: EntryType.Error,
      },
    ];
  }

  gs.player.data -= cost;
  gs.player.currentNode = target.id;
  gs.player.hopCount++;
  gs.player.visitedNodes.add(target.id);
  gs._justHopped = true;

  const isJammedHop = gs._jamTurns > 0 && gs._jammedNodes.has(target.id);

  /** @type {HistoryEntry[]} */
  const entries = [
    {
      text:
        cost === 0
          ? `Hopped to ${target.name}. (free revisit, ${gs.player.data} DATA remaining)`
          : `Hopped to ${target.name}. -${cost} DATA (${gs.player.data} remaining)`,
      type: EntryType.Info,
    },
  ];

  if (isJammedHop) {
    entries.push({
      text: `>> JAM ACTIVE: no detection risk hopping into ${target.name}.`,
      type: EntryType.Info,
    });
  }

  // SOCKET: detection penalty per hop (suppressed by jam)
  if (mod.hopDetectionPenalty && !isJammedHop) {
    gs.player.detection += mod.hopDetectionPenalty;
    if (gs.player.detection > 1.0) gs.player.detection = 1.0;
    const pct = Math.round(mod.hopDetectionPenalty * 100);
    entries.push({
      text: `>> DIRECT LINK: +${pct}% detection from hop`,
      type: EntryType.Warning,
    });
  }

  // Overlord check (suppressed by jam)
  if (!isJammedHop) {
    const msg = overlordCheck(gs.overlord, gs.player, gs.network, mod);
    if (msg) {
      entries.push({ text: msg, type: EntryType.Error });
    }
  }

  return entries;
}

/** @param {GameState} gs */
function cmdCrack(gs) {
  const node = getNode(gs.network, gs.player.currentNode);
  const mod = gs.mod;

  if (node.state === NodeState.Cracked || node.state === NodeState.Spiked) {
    return [{ text: "Node already cracked.", type: EntryType.Error }];
  }
  if (node.state === NodeState.Locked) {
    return [{ text: "Node is LOCKED. Cannot crack.", type: EntryType.Error }];
  }

  const baseCost = NodeTypeCost[node.type] + (mod.crackCostBonus || 0);
  let cost = baseCost * (mod.costMultiplier || 1);

  // Power overload: next crack is free
  if (gs._freeCrackTurn) {
    cost = 0;
    gs._freeCrackTurn = false;
  }

  if (gs.player.data < cost) {
    return [
      {
        text: `Insufficient DATA. Crack cost: ${cost}, you have: ${gs.player.data}`,
        type: EntryType.Error,
      },
    ];
  }

  gs.player.data -= cost;
  node.state = NodeState.Cracked;

  /** @type {HistoryEntry[]} */
  const entries = [
    {
      text:
        cost === 0
          ? `${node.name} cracked! (POWER OVERLOAD — free crack, ${gs.player.data} DATA remaining)`
          : `${node.name} cracked! -${cost} DATA (${gs.player.data} remaining)`,
      type: EntryType.Success,
    },
  ];

  // Cracking the Overlord neutralizes it
  if (node.type === NodeType.Overlord) {
    gs.overlord.neutralized = true;
    entries.push({
      text: ">> OVERLORD NEUTRALIZED. Detection system offline.",
      type: EntryType.Success,
    });
  }

  // QUBIT: reveal target status on crack
  if (mod.hiddenTargets && node._isTargetInternal) {
    node.isTarget = true;
    entries.push({
      text: ">> TARGET REVEALED: This node is a target!",
      type: EntryType.Success,
    });
  }

  // ICE trap trigger
  if (node.ice) {
    switch (node.ice) {
      case "drain": {
        const drainAmount = 2 * (mod.costMultiplier || 1);
        gs.player.data -= drainAmount;
        if (gs.player.data < 0) gs.player.data = 0;
        entries.push({
          text: `>> ICE TRAP [DRAIN]: -${drainAmount} DATA!`,
          type: EntryType.Error,
        });
        break;
      }
      case "lock": {
        const adjacent = node.edges.filter((eid) => {
          const adj = getNode(gs.network, eid);
          return (
            adj &&
            adj.state !== NodeState.Locked &&
            adj.state !== NodeState.Spiked &&
            adj.state !== NodeState.Undiscovered
          );
        });
        if (adjacent.length > 0) {
          const lockTarget = getNode(
            gs.network,
            adjacent[Math.floor(Math.random() * adjacent.length)],
          );
          lockTarget.state = NodeState.Locked;
          entries.push({
            text: `>> ICE TRAP [LOCK]: ${lockTarget.name} has been locked!`,
            type: EntryType.Error,
          });
        }
        break;
      }
      case "alert":
        gs.player.detection += 0.15;
        if (gs.player.detection > 1.0) gs.player.detection = 1.0;
        entries.push({
          text: ">> ICE TRAP [ALERT]: +15% DETECTION!",
          type: EntryType.Error,
        });
        break;
    }
    node.ice = null;
  }

  return entries;
}

/** @param {GameState} gs */
function cmdSpike(gs) {
  const node = getNode(gs.network, gs.player.currentNode);
  const mod = gs.mod;
  const targetCount = mod.targetCount || 3;

  if (!node.isTarget) {
    return [{ text: "This node is not a target.", type: EntryType.Error }];
  }
  if (node.state !== NodeState.Cracked) {
    return [
      { text: "Node must be cracked before spiking.", type: EntryType.Error },
    ];
  }

  node.state = NodeState.Spiked;
  gs.player.spikeCount++;
  gs.score += 100;

  /** @type {HistoryEntry[]} */
  const entries = [
    {
      text: `SPIKE PLANTED on ${node.name}! (${gs.player.spikeCount}/${targetCount}) [+100 PTS]`,
      type: EntryType.Success,
    },
  ];

  const rivalExtracted = (gs.rival && gs.rival.spikedTargets) || 0;
  if (gs.player.spikeCount + rivalExtracted >= targetCount) {
    gs.score += 500;
    gs.won = true;
    entries.push({
      text: "ALL TARGETS ACCOUNTED FOR! [+500 BONUS]",
      type: EntryType.Success,
    });
  }

  return entries;
}

/** @param {GameState} gs */
function cmdCloak(gs) {
  const mod = gs.mod;
  const baseCost = mod.freeCloakCost !== undefined ? mod.freeCloakCost : 3;
  const cost = baseCost * (mod.costMultiplier || 1);

  if (gs.player.data < cost) {
    return [
      {
        text: `Insufficient DATA. Cloak costs ${cost} DATA.`,
        type: EntryType.Error,
      },
    ];
  }

  gs.player.data -= cost;
  gs.player.cloakTurns = 3;

  return [
    {
      text: `Cloak activated for 3 turns. -${cost} DATA (${gs.player.data} remaining)`,
      type: EntryType.Success,
    },
  ];
}

/** @param {GameState} gs */
function cmdKill(gs) {
  if (!gs.rival) {
    return [
      { text: "No rival hacker in this network.", type: EntryType.Error },
    ];
  }
  if (gs.rival.currentNode !== gs.player.currentNode) {
    return [
      { text: "Rival hacker is not at your node.", type: EntryType.Error },
    ];
  }
  if (gs.player.data < 2) {
    return [
      { text: "Insufficient DATA. Kill costs 2 DATA.", type: EntryType.Error },
    ];
  }

  gs.player.data -= 2;
  gs.rival = null;
  gs.player.data += 10;

  return [
    {
      text: `>> RIVAL HACKER eliminated! +8 DATA net (${gs.player.data} remaining)`,
      type: EntryType.Success,
    },
  ];
}

/** @param {GameState} gs */
function cmdExtract(gs) {
  const node = getNode(gs.network, gs.player.currentNode);
  const mod = gs.mod;

  if (node.type !== NodeType.Server) {
    return [{ text: "This is not a Server node.", type: EntryType.Error }];
  }
  if (node.state !== NodeState.Cracked && node.state !== NodeState.Spiked) {
    return [
      {
        text: "Node must be cracked before extracting.",
        type: EntryType.Error,
      },
    ];
  }
  if (node.extracted) {
    return [
      {
        text: "Data already extracted from this server.",
        type: EntryType.Error,
      },
    ];
  }

  const extractMul = mod.extractMultiplier || 1;
  const rewardMul = mod.rewardMultiplier || 1;
  const base = Math.min(
    Math.floor(Math.random() * 8) + Math.floor(Math.random() * 9) + 5,
    20,
  );
  const reward = base * extractMul * rewardMul; // base 5-20, avg ~12.5, 20 is rare (~1.4%)
  gs.player.data += reward;
  node.extracted = true;

  return [
    {
      text: `Data extracted from ${node.name}! +${reward} DATA (${gs.player.data} total)`,
      type: EntryType.Success,
    },
  ];
}

/** @param {GameState} gs */
function cmdPass(gs) {
  gs.player.data += 1;
  gs.player.detection += 0.05;
  if (gs.player.detection > 1.0) gs.player.detection = 1.0;

  return [
    {
      text: `Idle cycle... +1 DATA (${gs.player.data} total)`,
      type: EntryType.Success,
    },
    {
      text: `>> +5% detection (${Math.floor(gs.player.detection * 100)}%)`,
      type: EntryType.Warning,
    },
  ];
}

/**
 * Post-turn effects: move traces, check trace contact, spawn traces, move rival.
 * @param {GameState} gs
 * @returns {HistoryEntry[]}
 */
function postTurnEffects(gs) {
  /** @type {HistoryEntry[]} */
  const entries = [];
  const mod = gs.mod;
  const traceInterval = mod.traceSpawnInterval || 4;

  // Move traces toward player
  const traceMessages = moveTraces(gs);
  for (const msg of traceMessages) {
    entries.push({ text: msg, type: EntryType.Error });
  }

  // Camera feed: passive +1 DATA per turn while active
  if (gs._cameraFeedTurns > 0) {
    gs._cameraFeedTurns--;
    gs.player.data += 1;
    entries.push({
      text: `>> CAMERA FEED: +1 DATA (${gs._cameraFeedTurns} turn(s) remaining)`,
      type: EntryType.Info,
    });
  }

  // Jam: count down active turns, clear when expired
  if (gs._jamTurns > 0) {
    gs._jamTurns--;
    if (gs._jamTurns === 0) {
      gs._jammedNodes = new Set();
      entries.push({ text: ">> JAM signal expired.", type: EntryType.Warning });
    }
  }

  // Spawn new trace every N hops while Overlord is active and not neutralized
  if (
    !gs.overlord.neutralized &&
    gs.player.hopCount > 0 &&
    gs.player.hopCount % traceInterval === 0 &&
    gs._justHopped
  ) {
    if (gs._sniffTraceBlock) {
      gs._sniffTraceBlock = false;
      entries.push({
        text: ">> COMMS INTERCEPT: Trace spawn blocked by sniff jamming.",
        type: EntryType.Info,
      });
    } else {
      spawnTrace(gs);
      entries.push({
        text: ">> New TRACE PROGRAM deployed from Overlord!",
        type: EntryType.Warning,
      });
    }
  }
  gs._justHopped = false;

  // Move rival
  const rivalMessages = moveRival(gs);
  for (const msg of rivalMessages) {
    entries.push({ text: msg, type: EntryType.Warning });
  }

  // Check combined win condition after rival moves:
  // player spikes + rival extractions together account for all targets.
  // This catches the case where the rival completes an extraction while the
  // player already has enough spikes to satisfy the win threshold.
  if (!gs.won && gs.rival) {
    const targetCount = mod.targetCount || 3;
    if (gs.player.spikeCount + gs.rival.spikedTargets >= targetCount) {
      gs.score += 500;
      gs.won = true;
      entries.push({
        text: "ALL TARGETS ACCOUNTED FOR! [+500 BONUS]",
        type: EntryType.Success,
      });
    }
  }

  // Rival extracted more than half of all targets — player loses (condition 2).
  // Threshold is strictly more than half: e.g. >1 of 3, >2 of 4.
  const targetCount = mod.targetCount || 3;
  if (!gs.won && gs.rival && gs.rival.spikedTargets > targetCount / 2) {
    gs.lost = true;
    entries.push({
      text: `>> RIVAL HACKER has spiked ${gs.rival.spikedTargets}/${targetCount} targets. Network compromised.`,
      type: EntryType.Error,
    });
  }

  return entries;
}

/** @param {GameState} gs */
function cmdFeed(gs) {
  const node = getNode(gs.network, gs.player.currentNode);
  if (node.type !== NodeType.Camera) {
    return [
      { text: "feed works only on Camera nodes.", type: EntryType.Error },
    ];
  }
  if (node.state !== NodeState.Cracked && node.state !== NodeState.Spiked) {
    return [
      {
        text: "Camera must be cracked before accessing the feed.",
        type: EntryType.Error,
      },
    ];
  }

  /** @type {HistoryEntry[]} */
  const entries = [
    {
      text: `Accessing camera feed on ${node.name}...`,
      type: EntryType.System,
    },
  ];

  let revealed = 0;
  for (const eid of node.edges) {
    const adj = getNode(gs.network, eid);
    if (adj && adj.state === NodeState.Undiscovered) {
      adj.state = NodeState.Discovered;
      revealed++;
      const target = adj.isTarget ? " (TARGET)" : "";
      entries.push({
        text: `  Feed reveals: ${adj.name} [${NodeTypeNames[adj.type]}]${target}`,
        type: EntryType.Success,
      });
    }
  }
  if (revealed === 0) {
    entries.push({
      text: "  No new nodes in camera range.",
      type: EntryType.System,
    });
  }

  gs._cameraFeedTurns = 2;
  entries.push({
    text: ">> CAMERA FEED active: +1 DATA/turn for 2 turns.",
    type: EntryType.Info,
  });
  return entries;
}

/** @param {GameState} gs */
function cmdJam(gs) {
  const node = getNode(gs.network, gs.player.currentNode);
  if (node.type !== NodeType.Turret) {
    return [{ text: "jam works only on Turret nodes.", type: EntryType.Error }];
  }
  if (node.state !== NodeState.Cracked && node.state !== NodeState.Spiked) {
    return [{ text: "Turret must be cracked to jam.", type: EntryType.Error }];
  }

  gs._jammedNodes = new Set(node.edges);
  gs._jamTurns = 3;

  /** @type {HistoryEntry[]} */
  const entries = [
    {
      text: `>> TURRET JAMMED: detection suppressed on ${node.edges.length} connected node(s) for 3 turns.`,
      type: EntryType.Success,
    },
  ];

  if (gs.rival) {
    gs.rival.moveCounter = Math.max(0, gs.rival.moveCounter - 1);
    entries.push({
      text: ">> Rival hacker disrupted by jamming signal.",
      type: EntryType.Info,
    });
  }

  return entries;
}

/**
 * @param {GameState} gs
 * @param {string[]} args
 */
function cmdBridge(gs, args) {
  const node = getNode(gs.network, gs.player.currentNode);
  if (node.type !== NodeType.Door) {
    return [
      { text: "bridge works only on Door nodes.", type: EntryType.Error },
    ];
  }
  if (node.state !== NodeState.Cracked && node.state !== NodeState.Spiked) {
    return [
      {
        text: "Door must be cracked to create a bridge.",
        type: EntryType.Error,
      },
    ];
  }
  if (args.length < 2) {
    return [{ text: "Usage: bridge <nodeA> <nodeB>", type: EntryType.Error }];
  }

  const nameA = args[0].toUpperCase();
  const nameB = args[1].toUpperCase();
  const nodeA = nodeByName(gs.network, nameA);
  const nodeB = nodeByName(gs.network, nameB);

  if (!nodeA)
    return [{ text: `Unknown node: ${nameA}`, type: EntryType.Error }];
  if (!nodeB)
    return [{ text: `Unknown node: ${nameB}`, type: EntryType.Error }];
  if (nodeA.id === nodeB.id)
    return [{ text: "Cannot bridge a node to itself.", type: EntryType.Error }];
  if (nodeA.state === NodeState.Undiscovered)
    return [
      { text: `${nameA} has not been discovered yet.`, type: EntryType.Error },
    ];
  if (nodeB.state === NodeState.Undiscovered)
    return [
      { text: `${nameB} has not been discovered yet.`, type: EntryType.Error },
    ];
  if (nodeA.edges.includes(nodeB.id))
    return [
      {
        text: `${nameA} and ${nameB} are already connected.`,
        type: EntryType.Error,
      },
    ];

  const cost = 2;
  if (gs.player.data < cost) {
    return [
      {
        text: `Insufficient DATA. bridge costs ${cost} DATA.`,
        type: EntryType.Error,
      },
    ];
  }

  gs.player.data -= cost;
  nodeA.edges.push(nodeB.id);
  if (!gs.network.directed) nodeB.edges.push(nodeA.id);

  gs.player.detection += 0.05;
  if (gs.player.detection > 1.0) gs.player.detection = 1.0;

  return [
    {
      text: `>> BRIDGE established: ${nameA} <-> ${nameB}. -${cost} DATA (${gs.player.data} remaining)`,
      type: EntryType.Success,
    },
    {
      text: `>> +5% detection from routing anomaly (${Math.floor(gs.player.detection * 100)}%).`,
      type: EntryType.Warning,
    },
  ];
}

/** @param {GameState} gs */
function cmdSniff(gs) {
  const node = getNode(gs.network, gs.player.currentNode);
  if (node.type !== NodeType.Comms) {
    return [
      { text: "sniff works only on Comms nodes.", type: EntryType.Error },
    ];
  }
  if (node.state !== NodeState.Cracked && node.state !== NodeState.Spiked) {
    return [
      {
        text: "Comms must be cracked to sniff traffic.",
        type: EntryType.Error,
      },
    ];
  }
  if (gs.player.data < 1) {
    return [
      { text: "Insufficient DATA. sniff costs 1 DATA.", type: EntryType.Error },
    ];
  }

  gs.player.data -= 1;

  /** @type {HistoryEntry[]} */
  const entries = [
    { text: "Sniffing network traffic...", type: EntryType.System },
  ];

  if (!gs.rival) {
    entries.push({
      text: "  No rival signal detected in this network.",
      type: EntryType.Info,
    });
  } else {
    const rivalNode = getNode(gs.network, gs.rival.currentNode);
    entries.push({
      text: `  Rival hacker located at: ${rivalNode ? rivalNode.name : "UNKNOWN"} (phase: ${gs.rival.phase})`,
      type: EntryType.Warning,
    });
    if (gs.rival.targetNode !== null) {
      const targetNode = getNode(gs.network, gs.rival.targetNode);
      if (targetNode) {
        entries.push({
          text: `  Rival next target: ${targetNode.name}`,
          type: EntryType.Warning,
        });
      }
    }
  }

  gs._sniffTraceBlock = true;
  entries.push({
    text: ">> Comms jamming active: next trace spawn will be intercepted.",
    type: EntryType.Info,
  });
  return entries;
}

/**
 * @param {GameState} gs
 * @param {string[]} args
 */
function cmdRelay(gs, args) {
  const node = getNode(gs.network, gs.player.currentNode);
  if (node.type !== NodeType.Comms) {
    return [
      { text: "relay works only on Comms nodes.", type: EntryType.Error },
    ];
  }
  if (node.state !== NodeState.Spiked) {
    return [
      { text: "Comms must be spiked to relay traffic.", type: EntryType.Error },
    ];
  }
  if (gs.traces.length === 0) {
    return [
      { text: "No active trace programs to redirect.", type: EntryType.Error },
    ];
  }
  if (args.length === 0) {
    return [{ text: "Usage: relay <node>", type: EntryType.Error }];
  }
  if (gs.player.data < 1) {
    return [
      { text: "Insufficient DATA. relay costs 1 DATA.", type: EntryType.Error },
    ];
  }

  const targetName = args[0].toUpperCase();
  const targetNode = nodeByName(gs.network, targetName);
  if (!targetNode)
    return [{ text: `Unknown node: ${targetName}`, type: EntryType.Error }];
  if (targetNode.state === NodeState.Undiscovered)
    return [
      {
        text: `${targetName} has not been discovered yet.`,
        type: EntryType.Error,
      },
    ];

  gs.player.data -= 1;
  gs.traces[0].currentNode = targetNode.id;

  return [
    {
      text: `>> RELAY: Trace program redirected to ${targetNode.name}. -1 DATA (${gs.player.data} remaining)`,
      type: EntryType.Success,
    },
  ];
}

/** @param {GameState} gs */
function cmdDrain(gs) {
  const node = getNode(gs.network, gs.player.currentNode);
  if (node.type !== NodeType.Power) {
    return [
      { text: "drain works only on Power nodes.", type: EntryType.Error },
    ];
  }
  if (node.state !== NodeState.Cracked && node.state !== NodeState.Spiked) {
    return [
      { text: "Power node must be cracked to drain.", type: EntryType.Error },
    ];
  }

  gs.player.data += 2;
  gs.player.detection += 0.05;
  if (gs.player.detection > 1.0) gs.player.detection = 1.0;

  return [
    {
      text: `>> POWER DRAIN: +2 DATA (${gs.player.data} total).`,
      type: EntryType.Success,
    },
    {
      text: `>> +5% detection from power surge (${Math.floor(gs.player.detection * 100)}%).`,
      type: EntryType.Warning,
    },
  ];
}

/** @param {GameState} gs */
function cmdOverload(gs) {
  const node = getNode(gs.network, gs.player.currentNode);
  if (node.type !== NodeType.Power) {
    return [
      { text: "overload works only on Power nodes.", type: EntryType.Error },
    ];
  }
  if (node.state !== NodeState.Spiked) {
    return [
      { text: "Power node must be spiked to overload.", type: EntryType.Error },
    ];
  }

  /** @type {HistoryEntry[]} */
  const entries = [
    {
      text: `>> POWER OVERLOAD on ${node.name}: frying adjacent security systems...`,
      type: EntryType.Warning,
    },
  ];

  let cleared = 0;
  for (const eid of node.edges) {
    const adj = getNode(gs.network, eid);
    if (adj && adj.ice) {
      adj.ice = null;
      cleared++;
      entries.push({
        text: `  ICE destroyed on ${adj.name}.`,
        type: EntryType.Success,
      });
    }
  }
  if (cleared === 0) {
    entries.push({
      text: "  No ICE traps found on adjacent nodes.",
      type: EntryType.System,
    });
  }

  gs._freeCrackTurn = true;
  gs.player.detection += 0.08;
  if (gs.player.detection > 1.0) gs.player.detection = 1.0;

  entries.push({
    text: ">> Next crack costs 0 DATA (power surge active).",
    type: EntryType.Info,
  });
  entries.push({
    text: `>> +8% detection from overload (${Math.floor(gs.player.detection * 100)}%).`,
    type: EntryType.Warning,
  });
  return entries;
}

/**
 * @param {GameState} gs
 * @param {string[]} args
 */
function cmdBypass(gs, args) {
  const node = getNode(gs.network, gs.player.currentNode);
  if (node.type !== NodeType.Firewall) {
    return [
      { text: "bypass works only on Firewall nodes.", type: EntryType.Error },
    ];
  }
  if (node.state !== NodeState.Cracked && node.state !== NodeState.Spiked) {
    return [
      { text: "Firewall must be cracked to bypass.", type: EntryType.Error },
    ];
  }
  if (args.length === 0) {
    return [{ text: "Usage: bypass <node>", type: EntryType.Error }];
  }

  const targetName = args[0].toUpperCase();
  const targetNode = nodeByName(gs.network, targetName);
  if (!targetNode)
    return [{ text: `Unknown node: ${targetName}`, type: EntryType.Error }];
  if (!node.edges.includes(targetNode.id))
    return [
      {
        text: `${targetName} is not adjacent to this Firewall.`,
        type: EntryType.Error,
      },
    ];
  if (targetNode.state !== NodeState.Locked)
    return [{ text: `${targetName} is not locked.`, type: EntryType.Error }];

  targetNode.state = NodeState.Discovered;
  gs.player.detection += 0.03;
  if (gs.player.detection > 1.0) gs.player.detection = 1.0;

  return [
    {
      text: `>> FIREWALL BYPASS: ${targetName} is now accessible.`,
      type: EntryType.Success,
    },
    {
      text: `>> +3% detection from bypass alarm (${Math.floor(gs.player.detection * 100)}%).`,
      type: EntryType.Warning,
    },
  ];
}

/** @param {GameState} gs */
function cmdShatter(gs) {
  const node = getNode(gs.network, gs.player.currentNode);
  if (node.type !== NodeType.Firewall) {
    return [
      { text: "shatter works only on Firewall nodes.", type: EntryType.Error },
    ];
  }
  if (node.state !== NodeState.Spiked) {
    return [
      { text: "Firewall must be spiked to shatter.", type: EntryType.Error },
    ];
  }

  let unlocked = 0;
  for (const n of gs.network.nodes) {
    if (n.state === NodeState.Locked) {
      n.state = NodeState.Discovered;
      unlocked++;
    }
  }

  gs.player.detection += 0.1;
  if (gs.player.detection > 1.0) gs.player.detection = 1.0;

  return [
    {
      text: `>> FIREWALL SHATTERED: ${unlocked} locked node(s) unlocked across the network.`,
      type: EntryType.Success,
    },
    {
      text: `>> +10% detection from security breach (${Math.floor(gs.player.detection * 100)}%).`,
      type: EntryType.Warning,
    },
  ];
}

/** @param {GameState} gs */
function cmdSudoRm(gs) {
  gs.killed = true;
  gs.lost = true;
  return [{ text: "USER DELETED.", type: EntryType.Error }];
}

/** @param {GameState} gs */
export function buildGameOverEntries(gs) {
  const targetCount = gs.mod.targetCount || 3;
  /** @type {HistoryEntry[]} */
  const entries = [{ text: "", type: EntryType.System }];

  if (gs.won) {
    entries.push(
      { text: "╔══════════════════════════════════╗", type: EntryType.Success },
      { text: "║        MISSION COMPLETE          ║", type: EntryType.Success },
      { text: "║     ALL TARGETS NEUTRALIZED      ║", type: EntryType.Success },
      { text: "╚══════════════════════════════════╝", type: EntryType.Success },
    );
  } else {
    // Determine loss reason from full game state, not just player state
    let reason;
    if (gs.player.detection >= 1.0) {
      reason = "DETECTED BY OVERLORD";
    } else if (
      gs.rival &&
      gs.rival.spikedTargets > (gs.mod.targetCount || 3) / 2
    ) {
      reason = "NETWORK COMPROMISED";
    } else {
      reason = loseReason(gs.player);
    }
    entries.push(
      { text: "╔══════════════════════════════════╗", type: EntryType.Error },
      { text: "║         MISSION FAILED           ║", type: EntryType.Error },
      {
        text: `║  ${reason.padStart(16 + reason.length / 2).padEnd(32)}║`,
        type: EntryType.Error,
      },
      { text: "╚══════════════════════════════════╝", type: EntryType.Error },
    );
  }

  entries.push(
    { text: "", type: EntryType.System },
    {
      text: `  Hops: ${gs.player.hopCount}  |  Targets spiked: ${gs.player.spikeCount}/${targetCount}  |  DATA remaining: ${gs.player.data}  |  SCORE: ${gs.score}`,
      type: EntryType.Info,
    },
    { text: "", type: EntryType.System },
  );

  return entries;
}

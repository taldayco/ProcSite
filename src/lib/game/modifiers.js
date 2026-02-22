/** @typedef {Record<string, any>} ModifierConfig */

/** @type {Record<string, ModifierConfig>} */
const MODIFIERS = {
  NEURAL: {
    name: 'Fast Learner',
    description: 'Overlord detection scales 2x faster',
    overlordScaleMultiplier: 2,
  },
  CIPHER: {
    name: 'Encrypted',
    description: 'Crack costs +1 DATA, but ICE traps are revealed',
    crackCostBonus: 1,
    iceRevealed: true,
  },
  VOID: {
    name: 'Barren',
    description: 'Minimum nodes, no Servers — pure scarcity',
    minNodes: 8,
    maxNodes: 8,
    noServers: true,
  },
  DAEMON: {
    name: 'Swarm',
    description: 'Traces spawn every 2 hops instead of 4',
    traceSpawnInterval: 2,
  },
  KERNEL: {
    name: 'Hardened Core',
    description: '4 targets required, Overlord is a target',
    targetCount: 4,
    overlordIsTarget: true,
  },
  BINARY: {
    name: 'Double Down',
    description: 'All costs double, all rewards double',
    costMultiplier: 2,
    rewardMultiplier: 2,
  },
  FLUX: {
    name: 'Unstable',
    description: 'Every 5 actions, a random edge is rewired',
    fluxInterval: 5,
  },
  PULSE: {
    name: 'Heartbeat',
    description: '+5% passive detection per action, but cloak is free',
    passiveDetection: 0.05,
    freeCloakCost: 0,
  },
  VERTEX: {
    name: 'Dense',
    description: 'Double extra edges — more paths, more trace routes',
    extraEdgeMultiplier: 2,
  },
  PROXY: {
    name: 'Bounce',
    description: 'Hops cost 0 DATA, scans cost 2 DATA',
    hopCost: 0,
    scanCost: 2,
  },
  SOCKET: {
    name: 'Direct Link',
    description: 'Hop to any discovered node, but +10% detection per hop',
    hopAnywhere: true,
    hopDetectionPenalty: 0.10,
  },
  BREACH: {
    name: 'Pre-Compromised',
    description: 'All nodes start Discovered, detection starts at 30%',
    allDiscovered: true,
    startDetection: 0.30,
  },
  SPAWN: {
    name: 'Overwhelm',
    description: 'Traces every 2 hops, trace contact does 40% detection',
    traceSpawnInterval: 2,
    traceContactDetection: 0.40,
  },
  VECTOR: {
    name: 'One-Way',
    description: 'Edges are directed — plan your route carefully',
    directedEdges: true,
  },
  QUBIT: {
    name: 'Superposition',
    description: 'Targets hidden until cracked',
    hiddenTargets: true,
  },
  CACHE: {
    name: 'Resource Race',
    description: 'Servers give double extract, rival moves every 2 turns',
    extractMultiplier: 2,
    rivalMoveInterval: 2,
  },
  EPOCH: {
    name: 'Time Pressure',
    description: '25-action limit to spike all targets',
    actionLimit: 25,
  },
  SHARD: {
    name: 'Fragmented',
    description: '4 targets, larger network (12-15 nodes)',
    targetCount: 4,
    minNodes: 12,
    maxNodes: 15,
  },
  EGO: {
    name: 'Overconfident',
    description: 'Start at 0% detection, but Overlord activates immediately',
    overlordImmediate: true,
  },
};

/** @type {ModifierConfig} */
const DEFAULT_MOD = { name: '', description: '' };

/**
 * @param {string} word
 * @returns {ModifierConfig}
 */
export function getModifier(word) {
  return MODIFIERS[word] || DEFAULT_MOD;
}

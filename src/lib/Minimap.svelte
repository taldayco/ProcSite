<script>
  import { NodeType, NodeState } from './game/network.js';

  /** @type {{ network: import('./game/network.js').Network, player: import('./game/player.js').Player, baseColor: number[] }} */
  let { network, player, baseColor } = $props();

  let colorRgb = $derived(`rgb(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]})`);
  let colorDim = $derived(`rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, 0.3)`);
  let colorGlow = $derived(`rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, 0.6)`);

  const SIZE = 200;
  const PAD = 20;
  const NODE_R = 8;

  /**
   * Force-directed layout positions, keyed by node id.
   * Computed once per network (stable across discovery changes).
   * @type {{ x: number, y: number }[]}
   */
  let positions = $state([]);

  /** Track network identity to recompute layout on new game */
  let lastNetwork = null;

  $effect(() => {
    if (network !== lastNetwork) {
      lastNetwork = network;
      positions = computeLayout(network);
    }
  });

  /**
   * Compute force-directed layout for all nodes.
   * @param {import('./game/network.js').Network} net
   * @returns {{ x: number, y: number }[]}
   */
  function computeLayout(net) {
    const n = net.nodes.length;
    if (n === 0) return [];

    // Seed in a circle with slight random offset
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const radius = (SIZE - PAD * 2) / 2.5;

    /** @type {{ x: number, y: number }[]} */
    const pos = net.nodes.map((_, i) => {
      const angle = (2 * Math.PI * i) / n;
      return {
        x: cx + radius * Math.cos(angle) + (Math.random() - 0.5) * 10,
        y: cy + radius * Math.sin(angle) + (Math.random() - 0.5) * 10,
      };
    });

    // Force simulation: 50 iterations
    const repulsion = 800;
    const attraction = 0.05;
    const damping = 0.9;

    /** @type {{ x: number, y: number }[]} */
    const vel = pos.map(() => ({ x: 0, y: 0 }));

    for (let iter = 0; iter < 50; iter++) {
      // Repulsion between all pairs
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let dx = pos[i].x - pos[j].x;
          let dy = pos[i].y - pos[j].y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          let force = repulsion / (dist * dist);
          let fx = (dx / dist) * force;
          let fy = (dy / dist) * force;
          vel[i].x += fx;
          vel[i].y += fy;
          vel[j].x -= fx;
          vel[j].y -= fy;
        }
      }

      // Attraction along edges
      for (const node of net.nodes) {
        for (const neighborId of node.edges) {
          if (neighborId <= node.id) continue; // process each edge once
          let dx = pos[neighborId].x - pos[node.id].x;
          let dy = pos[neighborId].y - pos[node.id].y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          let fx = dx * attraction;
          let fy = dy * attraction;
          vel[node.id].x += fx;
          vel[node.id].y += fy;
          vel[neighborId].x -= fx;
          vel[neighborId].y -= fy;
        }
      }

      // Center gravity
      for (let i = 0; i < n; i++) {
        vel[i].x += (cx - pos[i].x) * 0.01;
        vel[i].y += (cy - pos[i].y) * 0.01;
      }

      // Apply velocities with damping
      for (let i = 0; i < n; i++) {
        vel[i].x *= damping;
        vel[i].y *= damping;
        pos[i].x += vel[i].x;
        pos[i].y += vel[i].y;
        // Clamp to bounds
        pos[i].x = Math.max(PAD, Math.min(SIZE - PAD, pos[i].x));
        pos[i].y = Math.max(PAD, Math.min(SIZE - PAD, pos[i].y));
      }
    }

    return pos;
  }

  /**
   * Get SVG path for a node shape based on its type.
   * @param {number} type - NodeType value
   * @param {number} cx
   * @param {number} cy
   * @param {number} r
   * @returns {string}
   */
  function nodeShape(type, cx, cy, r) {
    switch (type) {
      case NodeType.Server: {
        // Square
        return `M${cx - r},${cy - r} L${cx + r},${cy - r} L${cx + r},${cy + r} L${cx - r},${cy + r} Z`;
      }
      case NodeType.Camera: {
        // Triangle
        return `M${cx},${cy - r} L${cx + r},${cy + r} L${cx - r},${cy + r} Z`;
      }
      case NodeType.Turret: {
        // Diamond
        return `M${cx},${cy - r} L${cx + r},${cy} L${cx},${cy + r} L${cx - r},${cy} Z`;
      }
      case NodeType.Door: {
        // Wide rectangle
        const w = r * 1.4;
        const h = r * 0.7;
        return `M${cx - w},${cy - h} L${cx + w},${cy - h} L${cx + w},${cy + h} L${cx - w},${cy + h} Z`;
      }
      case NodeType.Comms: {
        // Circle approximation (use SVG circle instead — handled separately)
        return 'circle';
      }
      case NodeType.Power: {
        // Hexagon
        const pts = [];
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 2;
          pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
        }
        return `M${pts.join(' L')} Z`;
      }
      case NodeType.Firewall: {
        // Octagon
        const pts2 = [];
        for (let i = 0; i < 8; i++) {
          const a = (Math.PI / 4) * i - Math.PI / 8;
          pts2.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
        }
        return `M${pts2.join(' L')} Z`;
      }
      case NodeType.Overlord: {
        // Star (5-pointed)
        const pts3 = [];
        for (let i = 0; i < 10; i++) {
          const a = (Math.PI / 5) * i - Math.PI / 2;
          const sr = i % 2 === 0 ? r * 1.2 : r * 0.5;
          pts3.push(`${cx + sr * Math.cos(a)},${cy + sr * Math.sin(a)}`);
        }
        return `M${pts3.join(' L')} Z`;
      }
      default:
        return 'circle';
    }
  }

  /**
   * @param {import('./game/network.js').Node} node
   * @returns {{ fill: string, stroke: string, className: string }}
   */
  function nodeStyle(node) {
    const isCurrent = node.id === player.currentNode;

    switch (node.state) {
      case NodeState.Discovered:
        return {
          fill: 'none',
          stroke: colorDim,
          className: isCurrent ? 'node-current' : '',
        };
      case NodeState.Cracked:
        return {
          fill: colorRgb,
          stroke: colorRgb,
          className: isCurrent ? 'node-current' : '',
        };
      case NodeState.Spiked:
        return {
          fill: colorRgb,
          stroke: colorGlow,
          className: `node-spiked${isCurrent ? ' node-current' : ''}`,
        };
      case NodeState.Locked:
        return {
          fill: 'rgba(255, 0, 0, 0.3)',
          stroke: '#ff4444',
          className: isCurrent ? 'node-current' : '',
        };
      default:
        return { fill: 'none', stroke: colorDim, className: '' };
    }
  }
</script>

<div class="minimap-container" style:--minimap-border-color={colorDim}>
  <svg
    width={SIZE}
    height={SIZE}
    viewBox="0 0 {SIZE} {SIZE}"
    xmlns="http://www.w3.org/2000/svg"
  >
    <!-- Edges between discovered nodes -->
    {#each network.nodes as node}
      {#if node.state >= NodeState.Discovered && positions[node.id]}
        {#each node.edges as neighborId}
          {#if neighborId > node.id && network.nodes[neighborId].state >= NodeState.Discovered && positions[neighborId]}
            <line
              x1={positions[node.id].x}
              y1={positions[node.id].y}
              x2={positions[neighborId].x}
              y2={positions[neighborId].y}
              stroke={colorDim}
              stroke-width="1"
            />
          {/if}
        {/each}
      {/if}
    {/each}

    <!-- Nodes -->
    {#each network.nodes as node}
      {#if node.state >= NodeState.Discovered && positions[node.id]}
        {@const style = nodeStyle(node)}
        {@const shape = nodeShape(node.type, positions[node.id].x, positions[node.id].y, NODE_R)}
        {@const isCurrent = node.id === player.currentNode}

        <g class={style.className}>
          {#if shape === 'circle'}
            <circle
              cx={positions[node.id].x}
              cy={positions[node.id].y}
              r={NODE_R}
              fill={style.fill}
              stroke={style.stroke}
              stroke-width={isCurrent ? 2 : 1.5}
            />
          {:else}
            <path
              d={shape}
              fill={style.fill}
              stroke={style.stroke}
              stroke-width={isCurrent ? 2 : 1.5}
            />
          {/if}

          <!-- Current node ping ring -->
          {#if isCurrent}
            <circle
              cx={positions[node.id].x}
              cy={positions[node.id].y}
              r={NODE_R + 4}
              fill="none"
              stroke={colorRgb}
              stroke-width="1"
              class="ping-ring"
            />
          {/if}

          <!-- Target marker -->
          {#if node.isTarget}
            <text
              x={positions[node.id].x}
              y={positions[node.id].y - NODE_R - 3}
              text-anchor="middle"
              font-size="8"
              font-family="monospace"
              fill={colorRgb}
            >T</text>
          {/if}

          <!-- Node name label -->
          <text
            x={positions[node.id].x}
            y={positions[node.id].y + NODE_R + 9}
            text-anchor="middle"
            font-size="6"
            font-family="monospace"
            fill={style.stroke}
            class="node-label"
          >{node.name}</text>

          <!-- Locked X overlay -->
          {#if node.state === NodeState.Locked}
            <line
              x1={positions[node.id].x - NODE_R + 2}
              y1={positions[node.id].y - NODE_R + 2}
              x2={positions[node.id].x + NODE_R - 2}
              y2={positions[node.id].y + NODE_R - 2}
              stroke="#ff4444"
              stroke-width="2"
            />
            <line
              x1={positions[node.id].x + NODE_R - 2}
              y1={positions[node.id].y - NODE_R + 2}
              x2={positions[node.id].x - NODE_R + 2}
              y2={positions[node.id].y + NODE_R - 2}
              stroke="#ff4444"
              stroke-width="2"
            />
          {/if}
        </g>
      {/if}
    {/each}
  </svg>
</div>

<style>
  .minimap-container {
    position: fixed;
    top: 1rem;
    right: 1rem;
    width: 200px;
    height: 200px;
    z-index: 210;
    pointer-events: none;
    background: rgba(0, 0, 0, 0.85);
    border: 1px solid var(--minimap-border-color);
    padding: 4px;
    box-shadow: 0 0 8px var(--minimap-border-color);
    animation: minimap-expand 0.5s ease-out 0.6s both;
  }

  @keyframes minimap-expand {
    0%   { opacity: 0; transform: scale(0); }
    15%  { opacity: 0.8; transform: scale(0.6); }
    25%  { opacity: 0.1; transform: scale(0.7); }
    40%  { opacity: 0.9; transform: scale(0.85); }
    50%  { opacity: 0.2; transform: scale(0.9); }
    65%  { opacity: 1; transform: scale(0.95); }
    75%  { opacity: 0.7; transform: scale(0.98); }
    100% { opacity: 1; transform: scale(1); }
  }

  .minimap-container svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  .node-label {
    opacity: 0.8;
    pointer-events: none;
  }

  .node-current {
    filter: brightness(1.5);
  }

  .node-spiked {
    animation: pulse-glow 1.2s ease-in-out infinite;
  }

  @keyframes pulse-glow {
    0%, 100% { filter: brightness(1); }
    50%      { filter: brightness(1.8) drop-shadow(0 0 4px currentColor); }
  }

  .ping-ring {
    animation: ping 1.5s ease-out infinite;
  }

  @keyframes ping {
    0%   { r: 12; opacity: 0.8; }
    100% { r: 20; opacity: 0; }
  }
</style>

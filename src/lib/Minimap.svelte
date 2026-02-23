<script>
  import { NodeType, NodeState } from './game/network.js';

  /** @type {{ network: import('./game/network.js').Network, player: import('./game/player.js').Player, baseColor: number[], traces: import('./game/player.js').Trace[], rival: import('./game/player.js').Rival }} */
  let { network, player, baseColor, traces = [], rival } = $props();

  let colorRgb = $derived(`rgb(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]})`);
  //brightness of nodes on minimap
  let colorDim = $derived(`rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, 0.9)`);
  let colorGlow = $derived(`rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, 0.6)`);

  const SIZE = 200;
  const PAD = 20;
  const NODE_R = 8;
  const EDGE_THRESHOLD = 6;
  const MIN_SIZE = 120;
  const MAX_SIZE = 500;
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 3.0;

  // Reactive minimap dimensions
  let mapWidth = $state(200);
  let mapHeight = $state(200);

  // Pan state
  let viewX = $state(0);
  let viewY = $state(0);

  // Zoom state
  let zoom = $state(1.0);
  let viewW = $derived(SIZE / zoom);
  let viewH = $derived(SIZE / zoom);

  // Interaction state
  let resizing = $state(false);
  let resizeEdges = $state({ left: false, bottom: false });
  let panning = $state(false);
  let panStart = { x: 0, y: 0, viewX: 0, viewY: 0 };
  let resizeStart = { x: 0, y: 0, w: 0, h: 0 };

  // Cursor state
  let cursorStyle = $state('grab');

  /** @type {HTMLDivElement} */
  let containerEl;

  /**
   * Detect which edges the pointer is near.
   * Since minimap is anchored top-right, only left and bottom edges are draggable.
   * @param {PointerEvent} e
   * @returns {{ left: boolean, bottom: boolean }}
   */
  function detectEdges(e) {
    if (!containerEl) return { left: false, bottom: false };
    const rect = containerEl.getBoundingClientRect();
    const left = e.clientX - rect.left < EDGE_THRESHOLD;
    const bottom = rect.bottom - e.clientY < EDGE_THRESHOLD;
    return { left, bottom };
  }

  /**
   * Get cursor for edge state.
   * @param {{ left: boolean, bottom: boolean }} edges
   * @returns {string}
   */
  function edgeCursor(edges) {
    if (edges.left && edges.bottom) return 'nesw-resize';
    if (edges.left) return 'ew-resize';
    if (edges.bottom) return 'ns-resize';
    return '';
  }

  /** @param {PointerEvent} e */
  function onPointerDown(e) {
    const edges = detectEdges(e);
    if (edges.left || edges.bottom) {
      // Start resize
      resizing = true;
      resizeEdges = edges;
      resizeStart = { x: e.clientX, y: e.clientY, w: mapWidth, h: mapHeight };
      cursorStyle = edgeCursor(edges);
      e.preventDefault();
    } else {
      // Start pan
      panning = true;
      panStart = { x: e.clientX, y: e.clientY, viewX, viewY };
      cursorStyle = 'grabbing';
      e.preventDefault();
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  /** @param {PointerEvent} e */
  function onPointerMove(e) {
    if (resizing) {
      if (resizeEdges.left) {
        // Dragging left edge left = wider (anchor is right side)
        const dx = resizeStart.x - e.clientX;
        mapWidth = Math.max(MIN_SIZE, Math.min(MAX_SIZE, resizeStart.w + dx));
      }
      if (resizeEdges.bottom) {
        const dy = e.clientY - resizeStart.y;
        mapHeight = Math.max(MIN_SIZE, Math.min(MAX_SIZE, resizeStart.h + dy));
      }
    } else if (panning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      // Convert screen pixels to viewBox units
      const scaleX = viewW / mapWidth;
      const scaleY = viewH / mapHeight;
      viewX = panStart.viewX - dx * scaleX;
      viewY = panStart.viewY - dy * scaleY;
    }
  }

  function onPointerUp() {
    resizing = false;
    panning = false;
    cursorStyle = 'grab';
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }

  /** @param {PointerEvent} e */
  function onContainerMove(e) {
    if (resizing || panning) return;
    const edges = detectEdges(e);
    const ec = edgeCursor(edges);
    cursorStyle = ec || 'grab';
  }

  /** @param {WheelEvent} e */
  function onWheel(e) {
    e.preventDefault();
    const rect = containerEl.getBoundingClientRect();
    // Pointer position in container (0..1)
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;

    // Point under cursor in viewBox coords before zoom
    const pointX = viewX + px * viewW;
    const pointY = viewY + py * viewH;

    // Adjust zoom
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * delta));
    const newW = SIZE / newZoom;
    const newH = SIZE / newZoom;

    // Adjust viewX/viewY so pointX/pointY stays under cursor
    viewX = pointX - px * newW;
    viewY = pointY - py * newH;
    zoom = newZoom;
  }

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
    const repulsion = 4000;
    const attraction = 0.05;
    const damping = 0.1;

    /** @type {{ x: number, y: number }[]} */
    const vel = pos.map(() => ({ x: 0, y: 0 }));

    for (let iter = 0; iter < 80; iter++) {
      // Repulsion between all pairs
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let dx = pos[i].x - pos[j].x;
          let dy = pos[i].y - pos[j].y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          let force = (repulsion * 2) / (dist * dist);
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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="minimap-container"
  style:--minimap-border-color={colorDim}
  style:width="{mapWidth}px"
  style:height="{mapHeight}px"
  style:cursor={cursorStyle}
  bind:this={containerEl}
  onpointerdown={onPointerDown}
  onpointermove={onContainerMove}
  onwheel={onWheel}
>
  <svg
    width={mapWidth}
    height={mapHeight}
    viewBox="{viewX} {viewY} {viewW} {viewH}"
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

          <!-- ICE indicator -->
          {#if node.ice && node.state !== NodeState.Cracked && node.state !== NodeState.Spiked}
            <text
              x={positions[node.id].x + NODE_R + 2}
              y={positions[node.id].y - NODE_R + 2}
              text-anchor="start"
              font-size="7"
              font-family="monospace"
              font-weight="bold"
              fill="#ff4444"
            >!</text>
          {/if}

          <!-- Extracted indicator -->
          {#if node.extracted}
            <text
              x={positions[node.id].x}
              y={positions[node.id].y + 3}
              text-anchor="middle"
              font-size="7"
              font-family="monospace"
              font-weight="bold"
              fill="rgba(136, 136, 136, 0.6)"
            >E</text>
          {/if}
        </g>
      {/if}
    {/each}

    <!-- Trace markers -->
    {#each traces as trace}
      {#if positions[trace.currentNode]}
        <circle
          cx={positions[trace.currentNode].x}
          cy={positions[trace.currentNode].y}
          r="3"
          fill="#ff4444"
          class="trace-pulse"
        />
      {/if}
    {/each}

    <!-- Rival marker -->
    {#if rival && positions[rival.currentNode]}
      {@const rx = positions[rival.currentNode].x}
      {@const ry = positions[rival.currentNode].y}
      <path
        d="M{rx},{ry - 4} L{rx + 3},{ry} L{rx},{ry + 4} L{rx - 3},{ry} Z"
        fill="#ffaa00"
        stroke="#ffaa00"
        stroke-width="0.5"
      />
    {/if}
  </svg>
</div>

<style>
  .minimap-container {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 210;
    background: rgba(0, 0, 0, 0.55);
    border: 1px dashed var(--minimap-border-color);
    padding: 4px;
    animation: minimap-expand 0.5s ease-out 0.6s both;
    user-select: none;
    touch-action: none;
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

  .trace-pulse {
    animation: trace-blink 0.8s ease-in-out infinite;
  }

  @keyframes trace-blink {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.3; }
  }
</style>

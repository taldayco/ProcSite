<script>
  import { tick } from 'svelte';
  import { newGameState, execute, buildGameOverEntries, EntryType } from './game/commands.js';
  import { getNode } from './game/network.js';
  import Minimap from './Minimap.svelte';

  /** @type {{ baseColor: number[], decodedWord?: string, ondetection?: () => void, onkill?: () => void, onnextlevel?: () => void }} */
  let { baseColor, decodedWord = '', ondetection, onkill, onnextlevel } = $props();

  let colorRgb = $derived(`rgb(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]})`);
  let colorGlow = $derived(`rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, 0.6)`);
  let colorDim = $derived(`rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, 0.3)`);

  // 'connecting' | 'active' | 'gameover'
  let phase = $state('connecting');

  /** @type {import('./game/commands.js').GameState} */
  let gs = $state(newGameState());

  /** @type {import('./game/commands.js').HistoryEntry[]} */
  let history = $state([]);

  let inputText = $state('');

  /** @type {HTMLDivElement} */
  let historyEl;

  /** @type {HTMLInputElement} */
  let realInputEl;

  /** @type {string[]} */
  let bootLines = $state([]);

  const BANNER = [
    '╔═══════════════════════════════════════╗',
    '║         (˵◡_◡˵) - Good Luck!           ║',
    '║              [Connected]              ║',
    '╚═══════════════════════════════════════╝',
  ];

  async function runBootSequence() {
    const lines = [
      'CONNECTING TO TARGET NETWORK...',
      'ESTABLISHING SECURE TUNNEL...',
      'BYPASSING FIREWALL...',
      'CONNECTED.',
      '...'
    ];
    for (const line of lines) {
      bootLines = [...bootLines, line];
      await new Promise(r => setTimeout(r, 280));
    }
    await new Promise(r => setTimeout(r, 300));

    // Switch to active
    const startNode = getNode(gs.network, gs.player.currentNode);
    history = [
      ...BANNER.map(text => ({ text, type: EntryType.Success })),
      { text: '', type: EntryType.System },
      { text: `Connected to node: ${startNode.name}`, type: EntryType.Info },
      { text: `DATA: ${gs.player.data} | Type 'help' for commands.`, type: EntryType.Info },
      { text: '', type: EntryType.System },
    ];
    phase = 'active';
    await tick();
    realInputEl?.focus();
  }

  function submitCommand() {
    if (gs.won || gs.lost) return;

    const cmd = inputText;
    inputText = '';

    const prevDetection = gs.player.detection;
    const entries = execute(gs, cmd);
    if (entries.length === 0) return;

    if (gs.killed && onkill) {
      onkill();
    } else if (gs.player.detection > prevDetection && ondetection) {
      ondetection();
    }

    // Trigger reactivity by reassigning
    gs = gs;
    history = [...history, ...entries];

    if ((gs.won || gs.lost) && !gs.killed) {
      if (gs.won && gs.devCheat && onnextlevel) {
        onnextlevel();
      } else {
        const gameOverEntries = buildGameOverEntries(gs);
        history = [...history, ...gameOverEntries];
        phase = 'gameover';
      }
    }

    tick().then(() => {
      if (historyEl) historyEl.scrollTop = historyEl.scrollHeight;
    });
  }

  function playAgain() {
    gs = newGameState();
    history = [];
    bootLines = [];
    booted = false;
    phase = 'connecting';
  }

  function focusInput() {
    if (phase === 'active') realInputEl?.focus();
  }

  /** @param {KeyboardEvent} e */
  function handleInputKeydown(e) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      submitCommand();
    }
  }

  let booted = false;

  $effect(() => {
    if (!booted) {
      booted = true;
      runBootSequence();
    }
  });

  $effect(() => {
    if (phase === 'active') {
      tick().then(() => realInputEl?.focus());
    }
  });

  /**
   * @param {string} type
   * @returns {string}
   */
  function entryColor(type) {
    switch (type) {
      case EntryType.Error: return '#ff4444';
      case EntryType.Success: return '#44ff44';
      case EntryType.Warning: return '#ffaa00';
      case EntryType.Input: return colorRgb;
      case EntryType.Info: return colorRgb;
      default: return '#888888';
    }
  }
</script>

{#if phase !== 'connecting'}
  <Minimap network={gs.network} player={gs.player} traces={gs.traces} rival={gs.rival} {baseColor} />
{/if}

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="terminal-overlay" onclick={focusInput}>
  <div class="terminal-frame">
    {#if phase === 'connecting'}
      <div class="boot-screen">
        {#each bootLines as line}
          <div class="boot-line" style="color: {colorRgb};">{line}</div>
        {/each}
        <span class="cursor" style="background: {colorRgb};">&#8203;</span>
      </div>
    {:else}
      <!-- Status bar -->
      <div class="status-bar" style="border-bottom-color: {colorDim}; color: {colorRgb};">
        {#if decodedWord}<span>{decodedWord}</span>{/if}
        <span>DATA: {gs.player.data}</span>
        <span>DETECTION: {Math.floor(gs.player.detection * 100)}%</span>
        <span>TARGETS: {gs.player.spikeCount}/3</span>
        {#if gs.player.cloakTurns > 0}
          <span>CLOAK: {gs.player.cloakTurns}</span>
        {/if}
      </div>

      <!-- History -->
      <div class="history" bind:this={historyEl}>
        {#each history as entry}
          <div class="history-line" style="color: {entryColor(entry.type)};">
            <pre>{entry.text}</pre>
          </div>
        {/each}
      </div>

      <!-- Input line -->
      {#if phase === 'active'}
        <div class="input-line" style="border-top-color: {colorDim};">
          <span class="prompt" style="color: {colorRgb};">&gt;&nbsp;</span>
          <span class="input-display" style="color: {colorRgb};">
            {inputText}<span class="cursor" style="background: {colorRgb};">&#8203;</span>
          </span>
          <input
            bind:this={realInputEl}
            bind:value={inputText}
            onkeydown={handleInputKeydown}
            class="hidden-input"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
        </div>
      {:else if phase === 'gameover'}
        <div class="gameover-buttons" style="border-top-color: {colorDim};">
          <span style="color: {colorRgb};">Play again?</span>
          <button
            class="game-btn"
            style="color: {colorRgb}; border-color: {colorDim}; --glow-color: {colorGlow};"
            onclick={playAgain}
          >[Y] Yes</button>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .terminal-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    box-sizing: border-box;
    pointer-events: none;
  }

  .terminal-frame {
    width: 100%;
    max-width: 800px;
    box-sizing: border-box;
    height: 80vh;
    max-height: 600px;
    border: none;
    border-radius: 0;
    background: transparent;
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    font-family: monospace;
    font-size: 14px;
    overflow: hidden;
    animation: terminal-flicker 0.5s ease-out forwards;
  }

  @keyframes terminal-flicker {
    0%   { opacity: 0; }
    15%  { opacity: 0.8; }
    25%  { opacity: 0.1; }
    40%  { opacity: 0.9; }
    50%  { opacity: 0.2; }
    65%  { opacity: 1; }
    75%  { opacity: 0.7; }
    100% { opacity: 1; }
  }

  .boot-screen {
    padding: 1.5rem;
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }

  .boot-line {
    font-family: monospace;
    font-size: 14px;
    margin-bottom: 0.3rem;
  }

  .status-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid;
    font-size: 12px;
    flex-shrink: 0;
  }

  @media (max-width: 500px) {
    .status-bar {
      font-size: 12px;
      padding: 0.4rem 0.5rem;
      gap: 0.3rem 0.8rem;
    }
    .terminal-frame {
      font-size: 12px;
    }
    .history-line pre,
    .prompt,
    .input-display,
    .boot-line {
      font-size: 12px;
    }
  }

  .history {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem 1rem;
    scrollbar-width: thin;
    scrollbar-color: #333 transparent;
  }

  .history-line pre {
    margin: 0;
    font-family: monospace;
    font-size: 14px;
    white-space: pre-wrap;
    word-break: break-all;
    line-height: 1.4;
  }

  .input-line {
    display: flex;
    align-items: center;
    padding: 0.5rem 1rem;
    border-top: 1px solid;
    flex-shrink: 0;
    position: relative;
  }

  .prompt {
    font-family: monospace;
    font-size: 14px;
    flex-shrink: 0;
  }

  .input-display {
    font-family: monospace;
    font-size: 14px;
    white-space: pre;
  }

  .hidden-input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
    pointer-events: none;
  }

  .cursor {
    display: inline-block;
    width: 0.55em;
    height: 1.1em;
    vertical-align: text-bottom;
    animation: blink-cursor 0.6s step-end infinite;
  }

  @keyframes blink-cursor {
    50% { opacity: 0; }
  }

  .gameover-buttons {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid;
    flex-shrink: 0;
  }

  .game-btn {
    font-family: monospace;
    font-size: 14px;
    background: transparent;
    border: 1px solid;
    padding: 0.4rem 1rem;
    cursor: pointer;
    transition: box-shadow 0.2s ease, background 0.2s ease;
  }

  .game-btn:hover {
    box-shadow: 0 0 12px var(--glow-color), inset 0 0 12px var(--glow-color);
    background: rgba(255, 255, 255, 0.05);
  }
</style>

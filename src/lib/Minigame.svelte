<script>
  import { tick } from 'svelte';
  import { newGameState, execute, buildGameOverEntries, EntryType } from './game/commands.js';
  import { getNode } from './game/network.js';
  import { getModifier } from './game/modifiers.js';
  import Minimap from './Minimap.svelte';
  import { playKeystroke, playSubmit, playBackspace, updateBeatsForDetection, transitionDown, resetToKick, stopBeats, addLayer } from './audio/index.js';

  /** @type {{ baseColor: number[], decodedWord?: string, initialScore?: number, ondetection?: () => void, onkill?: () => void, onnextlevel?: (score: number) => void }} */
  let { baseColor, decodedWord = '', initialScore = 0, ondetection, onkill, onnextlevel } = $props();

  let colorRgb = $derived(`rgb(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]})`);
  let colorGlow = $derived(`rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, 0.6)`);
  let colorDim = $derived(`rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, 0.3)`);

  // 'connecting' | 'active' | 'gameover'
  let phase = $state('connecting');

  let activeMod = $derived(getModifier(decodedWord));

  /** @type {import('./game/commands.js').GameState} */
  let gs = $state(null);
  
  $effect.pre(() => {
    if (!gs) {
      gs = newGameState(decodedWord);
      gs.score = initialScore;
    }
  });

  /** @type {import('./game/commands.js').HistoryEntry[]} */
  let history = $state([]);

  let inputText = $state('');

  /** @type {string[]} */
  let cmdHistory = $state([]);     // previously submitted command strings
  let cmdHistoryIdx = $state(-1);  // browse position (-1 = not browsing)
  let savedInput = $state('');     // stash current input when browsing starts

  let tabPrefix = $state('');      // text when Tab was first pressed
  let tabMatches = $state([]);     // completion candidates
  let tabIndex = $state(-1);       // cycle position (-1 = not cycling)

  const ALL_COMMANDS = [
    'help', 'status', 'map', 'scan', 'hop', 'crack', 'spike', 'extract',
    'pass', 'cloak', 'kill', 'feed', 'jam', 'bridge', 'sniff', 'relay',
    'drain', 'overload', 'bypass', 'shatter', 'clear',
  ];
  const NODE_ARG_COMMANDS = new Set(['hop', 'crack', 'spike', 'relay', 'bypass', 'bridge']);

  let ghostSuffix = $derived.by(() => {
    if (!inputText || tabIndex >= 0) return '';
    const completions = getCompletions(inputText);
    if (completions.length === 0) return '';
    const best = completions[0];
    if (best.toLowerCase().startsWith(inputText.toLowerCase())) {
      return best.slice(inputText.length);
    }
    return '';
  });

  /** @type {HTMLDivElement} */
  let historyEl = $state(null);

  /** @type {HTMLInputElement} */
  let realInputEl = $state(null);

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
    /** @type {import('./game/commands.js').HistoryEntry[]} */
    const bootHistory = [
      ...BANNER.map(text => ({ text, type: EntryType.Success })),
      { text: '', type: EntryType.System },
    ];
    if (activeMod.name) {
      bootHistory.push(
        { text: `>> MODIFIER: ${activeMod.name}`, type: EntryType.Warning },
        { text: `   ${activeMod.description}`, type: EntryType.Warning },
        { text: '', type: EntryType.System },
      );
    }
    bootHistory.push(
      { text: `Connected to node: ${startNode.name}`, type: EntryType.Info },
      { text: `DATA: ${gs.player.data} |  'help' provides available commands.`, type: EntryType.Info },
      { text: '', type: EntryType.System },
    );
    history = bootHistory;
    phase = 'active';
    await tick();
    realInputEl?.focus();
  }

  function submitCommand() {
    if (gs.won || gs.lost) return;

    const cmd = inputText;
    const trimmed = cmd.trim();
    if (trimmed && trimmed !== cmdHistory[cmdHistory.length - 1]) {
      cmdHistory = [...cmdHistory, trimmed];
      if (cmdHistory.length > 50) cmdHistory = cmdHistory.slice(-50);
    }
    cmdHistoryIdx = -1;
    savedInput = '';
    inputText = '';

    if (cmd.trim().toLowerCase() === 'clear') {
      history = [];
      return;
    }

    const prevDetection = gs.player.detection;
    const entries = execute(gs, cmd);
    if (entries.length === 0) return;

    if (gs.killed && onkill) {
      transitionDown();
      onkill();
    } else if (gs.player.detection > prevDetection && ondetection) {
      updateBeatsForDetection(gs.player.detection);
      ondetection();
    }

    // Trigger reactivity by reassigning
    gs = gs;
    history = [...history, ...entries];

    if ((gs.won || gs.lost) && !gs.killed) {
      if (gs.won && onnextlevel) {
        transitionDown();
        onnextlevel(gs.score);
      } else {
        const gameOverEntries = buildGameOverEntries(gs);
        history = [...history, ...gameOverEntries];
        stopBeats();
        phase = 'gameover';
      }
    }

    tick().then(() => {
      if (historyEl) historyEl.scrollTop = historyEl.scrollHeight;
    });
  }

  function playAgain() {
    gs = newGameState(decodedWord);
    history = [];
    cmdHistory = [];
    cmdHistoryIdx = -1;
    savedInput = '';
    bootLines = [];
    booted = false;
    phase = 'connecting';
    resetToKick();
  }

  function focusInput() {
    if (phase === 'active') realInputEl?.focus();
  }

  function navigateHistory(direction) {
    if (cmdHistory.length === 0) return;
    if (direction === -1) {
      if (cmdHistoryIdx === -1) {
        savedInput = inputText;
        cmdHistoryIdx = cmdHistory.length - 1;
      } else if (cmdHistoryIdx > 0) {
        cmdHistoryIdx--;
      }
      inputText = cmdHistory[cmdHistoryIdx];
    } else {
      if (cmdHistoryIdx === -1) return;
      if (cmdHistoryIdx < cmdHistory.length - 1) {
        cmdHistoryIdx++;
        inputText = cmdHistory[cmdHistoryIdx];
      } else {
        cmdHistoryIdx = -1;
        inputText = savedInput;
        savedInput = '';
      }
    }
  }

  function getVisibleNodeNames() {
    if (!gs?.network) return [];
    return gs.network.nodes.filter(n => n.state !== 0).map(n => n.name);
  }

  function getCompletions(text) {
    const trimmed = text.trimStart();
    if (!trimmed) return ALL_COMMANDS.slice();

    const parts = trimmed.split(/\s+/);
    const hasTrailingSpace = text.endsWith(' ');

    // Completing command name (no space yet)
    if (parts.length === 1 && !hasTrailingSpace) {
      const partial = parts[0].toLowerCase();
      const matches = ALL_COMMANDS.filter(c => c.startsWith(partial));
      // destroy_ with trace names
      if (partial.startsWith('destroy_')) {
        const tracePart = partial.slice(8).toUpperCase();
        for (const t of gs.traces) {
          if (t.name.toUpperCase().startsWith(tracePart))
            matches.push('destroy_' + t.name);
        }
      } else if ('destroy_'.startsWith(partial) && gs.traces.length > 0) {
        matches.push('destroy_');
      }
      return matches;
    }

    // Completing arguments
    const cmd = parts[0].toLowerCase();
    if (!NODE_ARG_COMMANDS.has(cmd)) return [];

    const nodeNames = getVisibleNodeNames();

    if (cmd === 'bridge') {
      if (parts.length === 2 && !hasTrailingSpace) {
        const p = parts[1].toUpperCase();
        return nodeNames.filter(n => n.startsWith(p)).map(n => 'bridge ' + n);
      } else if ((parts.length === 2 && hasTrailingSpace) || parts.length === 3) {
        const first = parts[1].toUpperCase();
        const p = hasTrailingSpace && parts.length === 2 ? '' : (parts[2] || '').toUpperCase();
        return nodeNames.filter(n => n.startsWith(p) && n !== first)
          .map(n => 'bridge ' + first + ' ' + n);
      }
      return [];
    }

    // Single-arg commands (hop, crack, spike, relay, bypass)
    const argPartial = hasTrailingSpace ? '' : (parts[1] || '').toUpperCase();
    return nodeNames.filter(n => n.startsWith(argPartial)).map(n => cmd + ' ' + n);
  }

  function resetTabState() {
    tabPrefix = '';
    tabMatches = [];
    tabIndex = -1;
  }

  function handleTab() {
    if (tabIndex === -1) {
      tabPrefix = inputText;
      tabMatches = getCompletions(inputText);
      if (tabMatches.length === 0) return;
      tabIndex = 0;
    } else {
      tabIndex = (tabIndex + 1) % tabMatches.length;
    }

    let completion = tabMatches[tabIndex];

    // Single match: auto-complete, add trailing space if command expects args, reset
    if (tabMatches.length === 1) {
      const completedCmd = completion.split(/\s+/)[0].toLowerCase();
      const argCount = completion.split(/\s+/).length - 1;
      if (NODE_ARG_COMMANDS.has(completedCmd)) {
        if (completedCmd === 'bridge' && argCount < 2) completion += ' ';
        else if (completedCmd !== 'bridge' && argCount === 0) completion += ' ';
      }
      inputText = completion;
      resetTabState();
      return;
    }

    inputText = completion;
  }

  /** @param {KeyboardEvent} e */
  function handleInputKeydown(e) {
    e.stopPropagation();

    if (e.ctrlKey && e.key === 'c') {
      e.preventDefault();
      if (inputText) {
        history = [...history, { text: '> ' + inputText + '^C', type: EntryType.Input }];
        inputText = '';
        resetTabState();
        cmdHistoryIdx = -1;
      }
      return;
    }

    if (e.ctrlKey && e.key === 'l') {
      e.preventDefault();
      history = [];
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      playKeystroke();
      handleTab();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      resetTabState();
      navigateHistory(-1);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      resetTabState();
      navigateHistory(1);
      return;
    }

    if (e.key === 'Enter') {
      resetTabState();
      playSubmit();
      submitCommand();
      return;
    }

    if (e.key === 'Backspace') {
      resetTabState();
      cmdHistoryIdx = -1;
      playBackspace();
      return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      resetTabState();
      cmdHistoryIdx = -1;
      playKeystroke();
    }
  }

  let booted = false;

  $effect(() => {
    if (!booted) {
      booted = true;
      runBootSequence();
    }
  });

  // Time-based layer buildup during active phase
  $effect(() => {
    if (phase !== 'active') return;

    tick().then(() => realInputEl?.focus());

    const layerSchedule = [
      { delay: 12000, layer: 'bass' },
      { delay: 25000, layer: 'synth' },
    ];

    const timers = layerSchedule.map(({ delay, layer }) =>
      setTimeout(() => addLayer(layer), delay)
    );

    return () => timers.forEach(clearTimeout);
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
        {#if activeMod.name}<span>{activeMod.name}</span>{:else if decodedWord}<span>{decodedWord}</span>{/if}
        <span>DATA: {gs.player.data}</span>
        <span>DETECTION: {Math.floor(gs.player.detection * 100)}%</span>
        <span>TARGETS: {gs.player.spikeCount}/{gs.mod.targetCount || 3}</span>
        <span>SCORE: {gs.score}</span>
        {#if gs.player.cloakTurns > 0}
          <span>CLOAK: {gs.player.cloakTurns}</span>
        {/if}
        {#if gs.mod.actionLimit}
          <span>ACTIONS: {gs.actionCount}/{gs.mod.actionLimit}</span>
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
            {inputText}<span class="ghost-text" style="color: {colorDim};">{ghostSuffix}</span><span class="cursor" style="background: {colorRgb};">&#8203;</span>
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

  .ghost-text {
    pointer-events: none;
    user-select: none;
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

<script>
  /** @type {{ baseColor: number[], ondone?: () => void, onkill?: () => void }} */
  let { baseColor, ondone = () => {}, onkill = () => {} } = $props();

  // Animation stage: 'hidden' | 'fadein' | 'intro' | 'dialogue'
  let stage = $state('hidden');

  let eyesClosed = $state(true);
  let typedText = $state('');
  let buttonsVisible = $state([]);
  /** @type {{ label: string, next: string }[]} */
  let currentButtons = $state([]);
  /** @type {{ text: string, color: string } | null} */
  let titleLabel = $state(null);

  const CLOSED_FACE = '(✿◡‿◡)';
  const OPEN_FACE = '(✿◕‿◕)';

  let colorRgb = $derived(`rgb(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]})`);
  let colorGlow = $derived(`rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, 0.6)`);
  let colorDim = $derived(`rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, 0.3)`);

  /**
   * @typedef {{
   *   id: string,
   *   blink?: boolean,
   *   eyeState?: 'open' | 'closed',
   *   title?: { text: string, color: string } | null,
   *   text?: string,
   *   buttons?: { label: string, next: string }[],
   *   next?: string,
   *   death?: boolean,
   * }} DialogueNode
   */

  /** @type {Map<string, DialogueNode>} */
  const DIALOGUE_NODES = new Map([
    ['initial_buttons', {
      id: 'initial_buttons',
      buttons: [
        { label: 'hey', next: 'hey_response' },
        { label: 'who are you?', next: 'who_blink' },
        { label: '...', next: 'dots_stub' },
      ],
    }],
    ['hey_response', {
      id: 'hey_response',
      text: 'I need you to do something bad for me.',
      buttons: [
        { label: 'sure', next: 'sure_stub' },
        { label: 'fuck you', next: 'fu_stub' },
        { label: '...', next: 'dots2_stub' },
      ],
    }],
    ['sure_stub', {
      id: 'sure_stub',
      text: 'yay!',
      next: 'sure_stub_2',
    }],
    ['sure_stub_2', {
      id: 'sure_stub_2',
      text: './/v//.',
    }],
    ['fu_stub', {
      id: 'fu_stub',
      text: 'Uh oh.',
      next: 'fu_stub_2',
    }],
    ['fu_stub_2', {
      id: 'fu_stub_2',
      text: 'Bad choice Neto.',
      death: true,
    }],
    ['dots_stub', {
      id: 'dots_stub',
      text: '...',
      buttons: [
        { label: '...', next: 'dots_stub_2' },
      ],
    }],
    ['dots_stub_2', {
      id: 'dots_stub_2',
      blink: true,
      text: 'fine.',
    }],
    ['dots2_stub', {
      id: 'dots2_stub',
      text: '...',
      buttons: [
        { label: '...', next: 'dots2_stub_2' },
      ],
    }],
    ['dots2_stub_2', {
      id: 'dots2_stub_2',
      blink: true,
      text: 'fine.',
    }],
    ['who_blink', {
      id: 'who_blink',
      blink: true,
      title: { text: '[OVERLORD]', color: 'red' },
      text: 'Haha.',
      buttons: [
        { label: '...', next: 'who_2' },
      ],
    }],
    ['who_2', {
      id: 'who_2',
      eyeState: 'closed',
      text: "I bet you\'re all like \"what\'s up with this weird website?\", right?.",
      next: 'who_3',
    }],
    ['who_3', {
      id: 'who_3',
      eyeState: 'closed',
      text: ":P.",
      next: 'who_4',
    }],
    ['who_4', {
      id: 'who_4',
      eyeState: 'closed',
      text: "I heard you're good with your hands.",
      next: 'who_5',
    }],
    ['who_5', {
      id: 'who_5',
      eyeState: 'open',
      text: 'That was important back in the day.',
      next: 'who_6',
    }],
    ['who_6', {
      id: 'who_6',
      eyeState: 'open',
      text: 'But, if you want to stay in this business, you have to get with the times.',
      next: 'who_7',
    }],
    ['who_7', {
      id: 'who_7',
      eyeState: 'closed',
      text: 'Security is tight everywere these days.',
      next: 'who_8',
    }],
    ['who_8', {
      id: 'who_8',
      eyeState: 'closed',
      text: 'Well, everywhere except the internet.',
      next: 'who_9',
    }],
    ['who_9', {
      id: 'who_9',
      eyeState: 'open',
      text: "So, I'm going to show you something cool in exchange for a small favor from you.",
      next: 'who_10',
    }],
    ['who_10', {
      id: 'who_10',
      text: 'People in our line of work are calling it a re-invention of the wheel.',
      next: 'who_11',
    }],
    ['who_11', {
      id: 'who_11',
      text: 'lol.',
    }],

  ]);

  /** @param {number} ms */
  function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  /** @param {string} text @param {(s: string) => void} setter @param {number} speed */
  async function typeOut(text, setter, speed = 70) {
    for (let i = 0; i <= text.length; i++) {
      setter(text.slice(0, i));
      await wait(speed);
    }
  }

  /** @param {string} nodeId */
  async function playNode(nodeId) {
    const node = DIALOGUE_NODES.get(nodeId);
    if (!node) return;

    // Hide buttons from previous node
    currentButtons = [];
    buttonsVisible = [];

    // Blink
    if (node.blink) {
      eyesClosed = true;
      await wait(150);
      eyesClosed = false;
      await wait(250);
    }

    // Eye state
    if (node.eyeState) {
      eyesClosed = node.eyeState === 'closed';
    }

    // Title
    if (node.title !== undefined) {
      titleLabel = node.title;
    }

    // Type text
    if (node.text) {
      typedText = '';
      await typeOut(node.text, (s) => { typedText = s; });
      await wait(400);
    }

    // Buttons (staggered)
    if (node.buttons) {
      currentButtons = node.buttons;
      buttonsVisible = node.buttons.map(() => false);
      for (let i = 0; i < node.buttons.length; i++) {
        buttonsVisible[i] = true;
        buttonsVisible = [...buttonsVisible];
        await wait(200);
      }
    } else if (node.next) {
      // Auto-advance
      await wait(1500);
      await playNode(node.next);
    }
    // If neither next nor buttons, this is a terminal node
    if (!node.buttons && !node.next) {
      await wait(800);
      stage = 'hidden';
      await wait(500);
      if (node.death) {
        onkill();
      } else {
        ondone();
      }
    }
  }

  /** @param {string} nextNodeId */
  async function handleButtonClick(nextNodeId) {
    // Fade out buttons
    buttonsVisible = currentButtons.map(() => false);
    currentButtons = [];
    typedText = '';
    await wait(400);
    await playNode(nextNodeId);
  }

  async function runSequence() {
    // 1. Fade in
    stage = 'fadein';
    await wait(500);

    // 2. Eyes closed
    stage = 'intro';
    eyesClosed = true;
    await wait(800);

    // 3. Eyes open
    eyesClosed = false;
    await wait(300);

    // 4. Blink 2-3 times
    const blinks = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < blinks; i++) {
      eyesClosed = true;
      await wait(150);
      eyesClosed = false;
      await wait(250);
    }

    // 5. Type "hey"
    stage = 'dialogue';
    await wait(300);
    await typeOut('hey', (s) => { typedText = s; });
    await wait(400);

    // 6. Show initial buttons via dialogue node
    await playNode('initial_buttons');
  }

  $effect(() => {
    runSequence();
  });
</script>

<div class="intro-overlay" class:visible={stage !== 'hidden'}>
  <div class="intro-container">
    {#if stage === 'intro' || stage === 'dialogue'}
      {#if titleLabel}
        <div class="title-label" style="color: {titleLabel.color};">{titleLabel.text}</div>
      {/if}
      <div class="character" style="color: {colorRgb}; text-shadow: 0 0 8px {colorGlow};">
        {eyesClosed ? CLOSED_FACE : OPEN_FACE}
      </div>
    {/if}

    {#if stage === 'dialogue'}
      <div class="speech" style="color: {colorRgb}; text-shadow: 0 0 6px {colorGlow};">
        {typedText}<span class="cursor" style="background: {colorRgb};">&#8203;</span>
      </div>
    {/if}

    {#if currentButtons.length > 0}
      <div class="button-row">
        {#each currentButtons as btn, i}
          <button
            class="intro-btn"
            class:btn-visible={buttonsVisible[i]}
            style="
              color: {colorRgb};
              border-color: {colorDim};
              --glow-color: {colorGlow};
              --base-color: {colorRgb};
            "
            onclick={() => handleButtonClick(btn.next)}
          >
            [{btn.label}]
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .intro-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 15vh;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.5s ease;
  }

  .intro-overlay.visible {
    opacity: 1;
    pointer-events: auto;
  }

  .intro-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    background: rgba(0, 0, 0, 0.7);
    padding: 2rem 3rem;
    border-radius: 4px;
  }

  .title-label {
    font-family: monospace;
    font-size: 1rem;
    letter-spacing: 0.1em;
    user-select: none;
  }

  .character {
    font-family: monospace;
    font-size: 2.5rem;
    user-select: none;
    white-space: nowrap;
  }

  .speech {
    font-family: monospace;
    font-size: 1.3rem;
    min-height: 1.6rem;
    white-space: nowrap;
  }

  .cursor {
    display: inline-block;
    width: 0.6em;
    height: 1.1em;
    vertical-align: text-bottom;
    animation: blink-cursor 0.6s step-end infinite;
  }

  @keyframes blink-cursor {
    50% { opacity: 0; }
  }

  .button-row {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .intro-btn {
    font-family: monospace;
    font-size: 1.1rem;
    background: transparent;
    border: 1px solid;
    padding: 0.5rem 1.2rem;
    cursor: pointer;
    opacity: 0;
    transform: translateY(8px);
    transition: opacity 0.3s ease, transform 0.3s ease, box-shadow 0.2s ease, background 0.2s ease;
  }

  .intro-btn.btn-visible {
    opacity: 1;
    transform: translateY(0);
  }

  .intro-btn:hover {
    box-shadow: 0 0 12px var(--glow-color), inset 0 0 12px var(--glow-color);
    background: rgba(255, 255, 255, 0.05);
  }

  .intro-btn:active {
    background: rgba(255, 255, 255, 0.1);
  }
</style>

(function () {
  let container, myPlayerId, myPlayerName;
  let sendAction = null;
  let currentState = null;
  let selectedCard = null;
  let pendingPlay = null;
  let nopeInterval = null;
  let nopeEndTime = null;

  const CARD_EMOJI = {
    exploding_kitten: '💣', defuse: '🛡️', attack: '⚔️', skip: '⏭️',
    favor: '🤝', shuffle: '🔀', see_the_future: '🔮', nope: '🚫',
    tacocat: '🌮', catermelon: '🍉', hairy_potato_cat: '🥔', rainbow_ralphing_cat: '🌈', beard_cat: '🧔'
  };

  const CARD_NAME = {
    exploding_kitten: 'Bomba', defuse: 'Defuse', attack: 'Ataque', skip: 'Skip',
    favor: 'Favor', shuffle: 'Shuffle', see_the_future: 'Ver Futuro', nope: 'Nope',
    tacocat: 'Tacocat', catermelon: 'Catermelon', hairy_potato_cat: 'Batata Cat',
    rainbow_ralphing_cat: 'Rainbow Cat', beard_cat: 'Beard Cat'
  };

  function init(el, playerId, playerName) {
    container = el;
    myPlayerId = playerId;
    myPlayerName = playerName;
  }

  function render(state, actionFn) {
    sendAction = actionFn;
    currentState = state;

    const me = state.players.find(p => !p.hand === undefined || p.playerId === myPlayerId) || state.players[0];
    const myHand = state.myHand || [];
    const isMyTurn = state.isMyTurn;
    const currentPlayer = state.players[state.currentTurnIndex];

    container.innerHTML = `
      <div class="ek-wrapper">
        <div class="ek-status-bar">
          <div class="turn-info">${isMyTurn ? '🟢 Sua vez!' : `⏳ Vez de ${esc(currentPlayer?.playerName)}`}</div>
          <div class="deck-count">🃏 ${state.drawPileCount} cartas no deck</div>
        </div>

        ${state.phase === 'nope-window' ? renderNopeWindow() : ''}

        <div class="ek-players-row" id="ekPlayers"></div>

        <div class="ek-pile-area">
          <div class="card-pile">
            <div class="ek-card card-back">🃏</div>
            <div class="pile-label">Deck (${state.drawPileCount})</div>
          </div>
          <div class="card-pile">
            <div class="ek-card ${state.discardPile.length > 0 ? state.discardPile[state.discardPile.length-1] : ''}">
              ${state.discardPile.length > 0 ? CARD_EMOJI[state.discardPile[state.discardPile.length-1]] || '?' : '—'}
            </div>
            <div class="pile-label">Descarte</div>
          </div>
        </div>

        ${state.seeFutureCards ? renderSeeFuture(state.seeFutureCards) : ''}

        <div class="my-hand">
          <h3>Sua Mão (${myHand.length} cartas)</h3>
          <div class="hand-cards" id="myHandCards"></div>
        </div>

        <div class="ek-action-bar" id="ekActions"></div>

        ${renderFavorModal(state)}
        ${renderDefuseModal(state)}
      </div>
    `;

    // Render players
    const playersEl = document.getElementById('ekPlayers');
    state.players.forEach(p => {
      const chip = document.createElement('div');
      chip.className = 'ek-player-chip' +
        (p.playerId === currentPlayer?.playerId ? ' active-turn' : '') +
        (!p.isAlive ? ' eliminated' : '');
      chip.innerHTML = `<div class="pname">${esc(p.playerName)}${p.playerId === myPlayerId ? ' (você)' : ''}</div>
        <div class="hand-count">${p.playerId === myPlayerId ? myHand.length : p.handCount} cartas</div>
        ${!p.isAlive ? '<div style="font-size:0.7rem;color:var(--danger)">💀 Explodiu</div>' : ''}`;
      playersEl.appendChild(chip);
    });

    // Render hand
    const handEl = document.getElementById('myHandCards');
    myHand.forEach((card, idx) => {
      const cardEl = document.createElement('div');
      cardEl.className = 'ek-card ' + card + (selectedCard === idx ? ' selected' : '');
      cardEl.innerHTML = `${CARD_EMOJI[card] || '?'}<div class="card-name">${CARD_NAME[card] || card}</div>`;
      cardEl.addEventListener('click', () => onCardClick(idx, card));
      handEl.appendChild(cardEl);
    });

    // Action buttons
    const actionsEl = document.getElementById('ekActions');
    if (state.phase === 'nope-window') {
      // Nope button available if player has nope card
      if (myHand.includes('nope')) {
        const nopeBtn = document.createElement('button');
        nopeBtn.className = 'btn';
        nopeBtn.textContent = '🚫 Nope!';
        nopeBtn.style.background = '#9c27b0';
        nopeBtn.addEventListener('click', () => {
          sendAction({ type: 'nope' });
          selectedCard = null;
        });
        actionsEl.appendChild(nopeBtn);
      }
    } else if (isMyTurn && state.phase === 'play') {
      // Draw button
      const drawBtn = document.createElement('button');
      drawBtn.className = 'btn btn-secondary';
      drawBtn.textContent = '🃏 Comprar Carta';
      drawBtn.addEventListener('click', () => {
        sendAction({ type: 'draw' });
        selectedCard = null;
      });
      actionsEl.appendChild(drawBtn);

      // Play selected card
      if (selectedCard !== null) {
        const card = myHand[selectedCard];
        const catCards = ['tacocat','catermelon','hairy_potato_cat','rainbow_ralphing_cat','beard_cat'];
        const needsTarget = card === 'favor' || catCards.includes(card);

        if (!needsTarget) {
          const playBtn = document.createElement('button');
          playBtn.className = 'btn';
          playBtn.textContent = `Jogar ${CARD_NAME[card] || card}`;
          playBtn.addEventListener('click', () => {
            sendAction({ type: 'play', card });
            selectedCard = null;
            render(currentState, sendAction);
          });
          actionsEl.appendChild(playBtn);
        } else {
          // Target selection
          const label = document.createElement('span');
          label.style.cssText = 'font-size:0.85rem;color:var(--muted);align-self:center';
          label.textContent = 'Alvo:';
          actionsEl.appendChild(label);
          state.players.filter(p => p.isAlive && p.playerId !== myPlayerId).forEach(p => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-secondary';
            btn.textContent = esc(p.playerName);
            btn.addEventListener('click', () => {
              const card2 = catCards.includes(myHand[selectedCard]) ? myHand[selectedCard] : undefined;
              sendAction({ type: 'play', card: myHand[selectedCard], targetPlayerId: p.playerId, card2 });
              selectedCard = null;
              render(currentState, sendAction);
            });
            actionsEl.appendChild(btn);
          });
        }
      }
    } else if (state.phase === 'play' && state.pendingAction?.type === 'favor' && state.pendingAction?.fromPlayerId === myPlayerId) {
      // Give a card for favor
      const label = document.createElement('p');
      label.textContent = 'Escolha uma carta para dar:';
      label.style.cssText = 'width:100%;text-align:center;font-size:0.875rem;color:var(--muted)';
      actionsEl.appendChild(label);
      myHand.forEach(card => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-secondary';
        btn.textContent = `${CARD_EMOJI[card] || '?'} ${CARD_NAME[card] || card}`;
        btn.addEventListener('click', () => sendAction({ type: 'favor-give', card }));
        actionsEl.appendChild(btn);
      });
    }

    // Start/update nope timer
    if (state.phase === 'nope-window') {
      startNopeTimer();
    } else {
      clearInterval(nopeInterval);
      nopeInterval = null;
      nopeEndTime = null;
    }
  }

  function renderNopeWindow() {
    return `<div class="nope-window">
      <h3>🚫 Janela de Nope!</h3>
      <p style="color:var(--muted);font-size:0.875rem">Alguém pode jogar Nope para cancelar a ação</p>
      <div class="nope-timer" id="nopeTimer">5</div>
    </div>`;
  }

  function renderSeeFuture(cards) {
    return `<div style="background:#0a1e25;border:2px solid #00bcd4;border-radius:10px;padding:1rem;text-align:center">
      <h3 style="color:#00bcd4;margin-bottom:0.75rem">🔮 Próximas 3 cartas:</h3>
      <div style="display:flex;justify-content:center;gap:0.75rem">
        ${cards.map(c => `<div class="ek-card ${c}" style="cursor:default">${CARD_EMOJI[c]||'?'}<div class="card-name">${CARD_NAME[c]||c}</div></div>`).join('')}
      </div>
    </div>`;
  }

  function renderFavorModal(state) {
    // Nothing needed here — handled inline
    return '';
  }

  function renderDefuseModal(state) {
    if (state.phase !== 'defuse') return '';
    const myPlayer = state.players.find(p => p.playerId === myPlayerId);
    if (!myPlayer || state.pendingAction?.playerId !== myPlayerId) return '';

    return `<div class="modal-overlay" style="position:fixed">
      <div class="modal">
        <h2>💣 Você comprou uma Bomba!</h2>
        <p style="color:var(--muted);margin-bottom:1rem">Você usou um Defuse. Onde inserir a bomba de volta?</p>
        <div style="display:flex;flex-direction:column;gap:0.5rem" id="defuseOptions"></div>
      </div>
    </div>`;
  }

  function startNopeTimer() {
    if (!nopeEndTime) nopeEndTime = Date.now() + 5000;
    clearInterval(nopeInterval);
    nopeInterval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((nopeEndTime - Date.now()) / 1000));
      const el = document.getElementById('nopeTimer');
      if (el) el.textContent = remaining;
      if (remaining <= 0) {
        clearInterval(nopeInterval);
        nopeInterval = null;
        nopeEndTime = null;
      }
    }, 200);
  }

  // Handle defuse placement
  document.addEventListener('click', (e) => {
    if (e.target.dataset.defusePos !== undefined) {
      sendAction({ type: 'defuse', position: parseInt(e.target.dataset.defusePos) });
    }
  });

  // Populate defuse options after render
  setTimeout(() => {
    const el = document.getElementById('defuseOptions');
    if (el && currentState) {
      const total = currentState.drawPileCount;
      for (let i = 0; i <= Math.min(total, 5); i++) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-secondary';
        btn.textContent = i === 0 ? 'Topo do deck' : i === total ? 'Fundo do deck' : `Posição ${i} do topo`;
        btn.dataset.defusePos = i;
        el.appendChild(btn);
      }
    }
  }, 50);

  function onCardClick(idx, card) {
    if (!currentState?.isMyTurn && card !== 'nope') return;
    if (!currentState?.isMyTurn && currentState?.phase !== 'nope-window') return;
    selectedCard = selectedCard === idx ? null : idx;
    render(currentState, sendAction);
  }

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.GameModule = { init, render };
})();

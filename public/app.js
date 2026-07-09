const app = document.getElementById('app');
const storageKeys = { roomId: 'blackjackRoomId', playerId: 'blackjackPlayerId', name: 'blackjackName' };
let socket;
let room = null;
let state = null;
let lobby = [];
let rooms = [];
let isOwner = false;
let message = '';
let myName = localStorage.getItem(storageKeys.name) || '';

const outcomeLabel = { win: '勝ち', lose: '負け', push: '引き分け', blackjack: 'BLACKJACK!' };
const outcomeIcon = { win: '🎉', lose: '💥', push: '🤝', blackjack: '✨' };
const cardImage = card => `/cards/${card.suit}_${card.rank}.jpg`;
const backImage = '/cards/back.jpg';

function connect() {
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  socket.addEventListener('open', () => {
    const roomId = localStorage.getItem(storageKeys.roomId);
    const playerId = localStorage.getItem(storageKeys.playerId);
    if (roomId && playerId) send({ type: 'rejoin', roomId, playerId });
    send({ type: 'listRooms' });
  });
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.type === 'session') {
      localStorage.setItem(storageKeys.roomId, data.roomId);
      localStorage.setItem(storageKeys.playerId, data.playerId);
    } else if (data.type === 'state') {
      room = data.room;
      state = data.state;
      lobby = data.lobby || [];
      isOwner = !!data.isOwner;
      message = '';
    } else if (data.type === 'roomList') {
      rooms = data.rooms || [];
    } else if (data.type === 'resetComplete') {
      clearSession();
      room = null;
      state = null;
      lobby = [];
      isOwner = false;
      message = data.message || '';
    } else if (data.type === 'error') {
      if (data.message === '再接続できるルームがありません') {
        clearSession();
        room = null;
        state = null;
        lobby = [];
        isOwner = false;
        message = '前回のルームは終了しています。新しく遊べます。';
        send({ type: 'listRooms' });
      } else {
        message = data.message;
      }
    }
    render();
  });
  socket.addEventListener('close', () => {
    message = 'サーバーとの接続が切れました。再接続します。';
    render();
    setTimeout(connect, 1200);
  });
}

function send(payload) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function clearSession() {
  localStorage.removeItem(storageKeys.roomId);
  localStorage.removeItem(storageKeys.playerId);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function myId() {
  return localStorage.getItem(storageKeys.playerId);
}

function you() {
  return state?.players.find(player => player.isYou);
}

function isMyTurn() {
  return state && state.turnPlayerId === myId() && !state.finished;
}

function createRoom() {
  const input = document.getElementById('playerName');
  myName = input.value.trim();
  if (!myName) { message = '名前を入力してください'; render(); return; }
  localStorage.setItem(storageKeys.name, myName);
  clearSession();
  send({ type: 'createRoom', name: myName });
}

function joinRoom(roomIdFromButton) {
  const input = document.getElementById('playerName');
  const roomInput = document.getElementById('joinRoomId');
  myName = input.value.trim();
  const roomId = roomIdFromButton || roomInput.value.trim().toUpperCase();
  if (!myName) { message = '名前を入力してください'; render(); return; }
  if (!roomId) { message = 'ルームIDを入力してください'; render(); return; }
  localStorage.setItem(storageKeys.name, myName);
  clearSession();
  send({ type: 'joinRoom', name: myName, roomId });
}

function startRoom() {
  send({ type: 'startRoom' });
}

function hit() {
  if (isMyTurn()) send({ type: 'hit' });
}

function stand() {
  if (isMyTurn()) send({ type: 'stand' });
}

function resetGame() {
  send({ type: 'resetGame' });
}

function playAgain() {
  send({ type: 'playAgain' });
}

function showRules() {
  alert(`ブラックジャックのルール

1. 21に近い方が勝ちです。
2. 22以上になるとバーストで負けです。
3. J/Q/Kは10点、Aは1点または11点です。
4. ヒットで1枚引きます。
5. スタンドで止めます。
6. 全員が止まるとディーラーが17以上まで引きます。
7. 最後にディーラーと点数を比べます。

この版は、掛け金・スプリット・ダブルダウンなしの簡単ルールです。`);
}

function renderTitle() {
  return `<section class="hero">
    <div class="fan" aria-hidden="true">
      ${['S_A', 'H_K', 'D_Q', 'C_J'].map((id, i) => `<img class="fan-card fan-${i}" src="/cards/${id}.jpg" alt="" />`).join('')}
    </div>
    <p class="eyebrow">ONLINE CARD GAME</p>
    <h1>オンラインブラックジャック</h1>
    <p class="lead">21を超えずに、ディーラーより強い手を目指そう。</p>
    <button class="ghost" onclick="showRules()">ルール説明</button>
  </section>`;
}

function renderLobby() {
  const roomRows = rooms.length
    ? rooms.map(r => `<div class="room-row">
        <div><strong>${escapeHtml(r.roomId)}</strong><span>${r.currentPlayers}/${r.maxPlayers}人・${escapeHtml(r.statusLabel)}</span></div>
        <button ${r.status !== 'waiting' || r.full ? 'disabled' : ''} onclick="joinRoom('${escapeHtml(r.roomId)}')">参加</button>
      </div>`).join('')
    : '<p class="muted">現在、募集中のルームはありません。</p>';

  const joined = room && !state;
  return `<section class="panel lobby">
    <label>プレイヤー名<input id="playerName" value="${escapeHtml(myName)}" placeholder="名前を入力" maxlength="16" /></label>
    <div class="action-grid">
      <div class="box primary-action">
        <h2>すぐ遊ぶ</h2>
        <p class="muted">1人でも開始できます。友達がいる時はルームIDを共有してください。</p>
        <button onclick="createRoom()">ルームを作る</button>
      </div>
      <div class="box">
        <h2>ルームに参加</h2>
        <label>ルームID<input id="joinRoomId" placeholder="例: A1B2C3" /></label>
        <button onclick="joinRoom()">参加する</button>
      </div>
    </div>
    ${joined ? `<div class="box joined">
      <h2>ルーム ${escapeHtml(room.roomId)}</h2>
      <p>${lobby.map(p => escapeHtml(p.name)).join(' / ')}</p>
      <p class="muted">準備できたら開始。各プレイヤーがディーラーと勝負します。</p>
      ${isOwner ? '<button onclick="startRoom()">ゲーム開始</button>' : '<p>作成者の開始を待っています。</p>'}
      <button class="danger" onclick="resetGame()">ロビーに戻る</button>
    </div>` : ''}
    <div class="box">
      <div class="row-title"><h2>ルーム一覧</h2><button class="ghost" onclick="send({type:'listRooms'})">更新</button></div>
      ${roomRows}
    </div>
  </section>`;
}

function renderCard(card, hidden = false) {
  const src = hidden ? backImage : cardImage(card);
  const alt = hidden ? '裏向きのカード' : `${card.suit} ${card.rank}`;
  return `<div class="card ${hidden ? 'hidden-card' : ''}"><img src="${src}" alt="${alt}" /></div>`;
}

function renderHand(cards) {
  return `<div class="hand">${cards.map(card => card ? renderCard(card) : renderCard({}, true)).join('')}</div>`;
}

function renderStats() {
  if (!state?.stats) return '';
  const stats = state.stats;
  const parts = [`${stats.rounds}戦`, `${stats.win}勝`, `${stats.lose}敗`];
  if (stats.push) parts.push(`${stats.push}分`);
  if (stats.blackjack) parts.push(`BJ ${stats.blackjack}`);
  return `<section class="summary-strip">
    <div><span>通算</span><strong>${parts.join(' ')}</strong></div>
    <div><span>現在</span><strong>第${state.roundNumber || 1}戦</strong></div>
  </section>`;
}

function renderHistory() {
  const history = state?.history || [];
  if (!history.length) return '';
  const rows = history.slice(-6).reverse().map(round => {
    const mine = round.results.find(result => result.playerId === myId());
    if (!mine) return '';
    const score = `${mine.value}対${round.dealerValue}`;
    const label = outcomeLabel[mine.outcome] || mine.outcome;
    const icon = outcomeIcon[mine.outcome] || '•';
    const dealerNote = round.dealerBust ? ' / 親バースト' : '';
    return `<li><strong>第${round.round}戦</strong><span>${score}${dealerNote}</span><b class="${mine.outcome}">${icon} ${escapeHtml(label)}</b></li>`;
  }).join('');
  return `<section class="round-history">
    <h3>対戦履歴</h3>
    <ul>${rows}</ul>
  </section>`;
}

function renderPlayer(player) {
  const active = state.turnPlayerId === player.id && !state.finished;
  const outcome = player.outcome ? `<span class="result-chip ${player.outcome}">${outcomeIcon[player.outcome]} ${outcomeLabel[player.outcome]}</span>` : '';
  return `<section class="player-card ${player.isYou ? 'you' : ''} ${active ? 'active' : ''}">
    <div class="player-head">
      <h3>${escapeHtml(player.name)}${player.isYou ? '（あなた）' : ''}</h3>
      <strong>${player.value}</strong>
    </div>
    ${renderHand(player.hand)}
    <p class="muted">${player.blackjack ? 'ブラックジャック！' : player.bust ? 'バースト' : player.status === 'stood' ? 'スタンド' : active ? '考え中' : '待機中'} ${outcome}</p>
  </section>`;
}

function renderGame() {
  const me = you();
  const controlsDisabled = !isMyTurn() ? 'disabled' : '';
  const myOutcome = state.finished && me?.outcome ? me.outcome : '';
  const headline = myOutcome
    ? `${outcomeIcon[myOutcome]} ${outcomeLabel[myOutcome]}`
    : state.finished
      ? 'ラウンド終了'
      : `${escapeHtml(state.turnPlayerName)}さんの番です`;

  return `<section class="game">
    <div class="game-head">
      <div>
        <p class="eyebrow">ROOM ${escapeHtml(room?.roomId || '')}</p>
        <h2>${escapeHtml(headline)}</h2>
        <p>${escapeHtml(state.lastAction || '')}</p>
      </div>
      <div class="game-actions">
        ${state.finished ? '<button onclick="playAgain()">もう一度遊ぶ</button>' : ''}
        <button class="danger" onclick="resetGame()">ロビーに戻る</button>
      </div>
    </div>
    ${renderStats()}
    <section class="dealer">
      <div class="player-head"><h3>ディーラー</h3><strong>${state.dealer.value ?? '?'}</strong></div>
      ${renderHand(state.dealer.hand)}
      <p class="muted">${state.dealer.bust ? 'バースト' : state.finished ? '勝負！' : '2枚目は伏せ札'}</p>
    </section>
    <div class="controls">
      <button onclick="hit()" ${controlsDisabled}>ヒット<br><small>1枚引く</small></button>
      <button onclick="stand()" ${controlsDisabled}>スタンド<br><small>止める</small></button>
    </div>
    ${state.finished ? `<section class="result"><h2>${escapeHtml(headline)}</h2><p>第${state.roundNumber || 1}戦の結果です。同じルームのまま続けるか、ロビーに戻るか選べます。</p><div class="result-actions"><button onclick="playAgain()">同じメンバーでもう一度</button><button class="ghost" onclick="resetGame()">ロビーに戻る</button></div></section>` : ''}
    ${renderHistory()}
    <div class="players">${state.players.map(renderPlayer).join('')}</div>
  </section>`;
}

function render() {
  app.innerHTML = `${renderTitle()}
    ${message ? `<div class="message">${escapeHtml(message)}</div>` : ''}
    ${state ? renderGame() : renderLobby()}
    <footer>公開用標準カード版 / 簡単ブラックジャック</footer>`;
}

window.showRules = showRules;
window.createRoom = createRoom;
window.joinRoom = joinRoom;
window.startRoom = startRoom;
window.hit = hit;
window.stand = stand;
window.playAgain = playAgain;
window.resetGame = resetGame;
window.send = send;

connect();
render();

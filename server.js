const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');
const { createGame, hit, stand, publicState } = require('./src/game');

const PORT = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, 'public');
const MAX_PLAYERS = 4;
const statusLabels = { waiting: '募集中', playing: '対戦中', finished: '終了' };
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png'
};

const server = http.createServer((req, res) => {
  const requested = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = path.normalize(path.join(publicDir, requested));
  if (!file.startsWith(publicDir)) return res.writeHead(403).end('Forbidden');
  fs.readFile(file, (error, data) => {
    if (error) return res.writeHead(404).end('Not found');
    res.writeHead(200, {
      'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const rooms = new Map();
const send = (socket, payload) => socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify(payload));
const fail = (socket, message) => send(socket, { type: 'error', message });
const newRoomId = () => {
  let id;
  do id = crypto.randomBytes(3).toString('hex').toUpperCase(); while (rooms.has(id));
  return id;
};
const newPlayerId = () => crypto.randomBytes(8).toString('hex');

function roomSummary(room) {
  return {
    roomId: room.id,
    currentPlayers: room.players.size,
    maxPlayers: MAX_PLAYERS,
    status: room.status,
    statusLabel: statusLabels[room.status],
    full: room.players.size >= MAX_PLAYERS
  };
}

function roomList() {
  return [...rooms.values()].map(roomSummary);
}

function broadcastRoomList() {
  for (const socket of wss.clients) send(socket, { type: 'roomList', rooms: roomList() });
}

function lobby(room) {
  return [...room.players.values()].map(player => ({ id: player.id, name: player.name }));
}

function attach(socket, room, player) {
  socket.roomId = room.id;
  socket.playerId = player.id;
  player.socket = socket;
  send(socket, { type: 'session', roomId: room.id, playerId: player.id });
}

function broadcastRoom(room) {
  for (const player of room.players.values()) {
    send(player.socket, {
      type: 'state',
      room: roomSummary(room),
      state: publicState(room.game, player.id),
      lobby: lobby(room),
      isOwner: player.id === room.ownerId
    });
  }
  broadcastRoomList();
}

function resetRoom(room) {
  rooms.delete(room.id);
  for (const player of room.players.values()) {
    delete player.socket?.roomId;
    delete player.socket?.playerId;
    send(player.socket, { type: 'resetComplete', message: 'ロビーに戻りました' });
  }
  broadcastRoomList();
}

function getContext(socket) {
  const room = rooms.get(socket.roomId);
  const player = room?.players.get(socket.playerId);
  if (!room || !player) throw new Error('ルームに参加していません');
  return { room, player };
}

wss.on('connection', socket => {
  send(socket, { type: 'roomList', rooms: roomList() });

  socket.on('message', raw => {
    try {
      const data = JSON.parse(raw);
      if (data.type === 'listRooms') return send(socket, { type: 'roomList', rooms: roomList() });

      if (data.type === 'createRoom') {
        const name = String(data.name || '').trim().slice(0, 16);
        if (!name) throw new Error('名前を入力してください');
        const id = newRoomId();
        const pid = newPlayerId();
        const room = { id, ownerId: pid, players: new Map(), status: 'waiting', game: null };
        const player = { id: pid, name, socket };
        room.players.set(pid, player);
        rooms.set(id, room);
        attach(socket, room, player);
        broadcastRoom(room);
        return;
      }

      if (data.type === 'joinRoom') {
        const room = rooms.get(String(data.roomId || '').trim().toUpperCase());
        const name = String(data.name || '').trim().slice(0, 16);
        if (!room) throw new Error('ルームが見つかりません');
        if (!name) throw new Error('名前を入力してください');
        if (room.status !== 'waiting') throw new Error('このルームはゲーム開始済みです');
        if (room.players.size >= MAX_PLAYERS) throw new Error('このルームは満室です');
        const pid = newPlayerId();
        const player = { id: pid, name, socket };
        room.players.set(pid, player);
        attach(socket, room, player);
        broadcastRoom(room);
        return;
      }

      if (data.type === 'rejoin') {
        const room = rooms.get(data.roomId);
        const player = room?.players.get(data.playerId);
        if (!room || !player) throw new Error('再接続できるルームがありません');
        attach(socket, room, player);
        broadcastRoom(room);
        return;
      }

      const { room, player } = getContext(socket);

      if (data.type === 'startRoom') {
        if (room.ownerId !== player.id) throw new Error('ルーム作成者だけが開始できます');
        if (room.status !== 'waiting') throw new Error('すでに開始しています');
        room.game = createGame([...room.players.values()].map(member => ({ id: member.id, name: member.name })));
        room.status = 'playing';
      } else if (data.type === 'hit') {
        hit(room.game, player.id);
      } else if (data.type === 'stand') {
        stand(room.game, player.id);
      } else if (data.type === 'resetGame') {
        resetRoom(room);
        return;
      } else {
        throw new Error('不明な操作です');
      }

      if (room.game?.finished) room.status = 'finished';
      broadcastRoom(room);
    } catch (error) {
      fail(socket, error.message);
    }
  });

  socket.on('close', () => {
    const room = rooms.get(socket.roomId);
    const player = room?.players.get(socket.playerId);
    if (!room || !player || player.socket !== socket) return;
    player.socket = null;
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`http://0.0.0.0:${PORT}`));

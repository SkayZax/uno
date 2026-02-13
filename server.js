const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const ROOMS_FILE = path.join(__dirname, 'rooms.json');

// Initialisation du fichier JSON s'il n'existe pas
if (!fs.existsSync(ROOMS_FILE)) {
    fs.writeFileSync(ROOMS_FILE, JSON.stringify({}));
}

// --- UTILITAIRES JSON ---
function loadRooms() {
    try {
        const data = fs.readFileSync(ROOMS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return {};
    }
}

function saveRooms(rooms) {
    try {
        fs.writeFileSync(ROOMS_FILE, JSON.stringify(rooms, null, 2));
    } catch (err) {
        console.error("Erreur de sauvegarde JSON:", err);
    }
}

// --- LOGIQUE UNO ---
const colors = ['red', 'yellow', 'green', 'blue'];
const values = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', '+2'];

function createDeck() {
    const deck = [];
    colors.forEach(color => {
        deck.push({ color, value: '0' });
        values.forEach(value => {
            if (value !== '0') {
                deck.push({ color, value });
                deck.push({ color, value });
            }
        });
    });
    for (let i = 0; i < 4; i++) {
        deck.push({ color: 'wild', value: 'wild' });
        deck.push({ color: 'wild', value: 'wild+4' });
    }
    return shuffle(deck);
}

function shuffle(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getNextPlayerIndex(room) {
    let nextIndex = room.currentPlayerIndex + room.direction;
    if (nextIndex >= room.players.length) nextIndex = 0;
    else if (nextIndex < 0) nextIndex = room.players.length - 1;
    return nextIndex;
}

function applyCardEffect(room, card) {
    let skipNext = false;
    if (card.value === 'skip') {
        skipNext = true;
    } else if (card.value === 'reverse') {
        room.direction *= -1;
        if (room.players.length === 2) skipNext = true;
    } else if (card.value === '+2' || card.value === 'wild+4') {
        const drawCount = card.value === '+2' ? 2 : 4;
        const nextIdx = getNextPlayerIndex(room);
        const victim = room.players[nextIdx];
        for (let i = 0; i < drawCount; i++) {
            if (room.deck.length === 0) {
                const top = room.discardPile.pop();
                room.deck = shuffle(room.discardPile);
                room.discardPile = [top];
            }
            room.playerHands[victim.id].push(room.deck.pop());
        }
        skipNext = true;
    }
    room.currentPlayerIndex = getNextPlayerIndex(room);
    if (skipNext) room.currentPlayerIndex = getNextPlayerIndex(room);
}

// --- SYNC ET BROADCAST ---
function getAvailableRooms() {
    const rooms = loadRooms();
    return Object.keys(rooms)
        .filter(code => !rooms[code].started)
        .map(code => ({
            code,
            players: rooms[code].players.length,
            host: rooms[code].players[0].name
        }));
}

function broadcastRooms() {
    io.emit('availableRooms', getAvailableRooms());
}

function sendUpdate(room, winner = null) {
    const counts = {};
    room.players.forEach(p => counts[p.id] = room.playerHands[p.id].length);
    room.players.forEach(player => {
        io.to(player.id).emit('gameUpdate', {
            players: room.players,
            currentPlayerIndex: room.currentPlayerIndex,
            topCard: room.discardPile[room.discardPile.length - 1],
            wildColor: room.wildColor,
            hand: room.playerHands[player.id],
            playerHands: counts,
            winner
        });
    });
}

// --- SOCKET.IO ---
app.use(express.static('public'));

io.on('connection', (socket) => {
    socket.emit('availableRooms', getAvailableRooms());

    socket.on('createRoom', (playerName) => {
        const rooms = loadRooms();
        const code = generateRoomCode();
        rooms[code] = {
            code, host: socket.id, players: [{ id: socket.id, name: playerName }],
            pendingPlayers: [], started: false, deck: createDeck(),
            discardPile: [], currentPlayerIndex: 0, direction: 1,
            playerHands: {}, wildColor: null
        };
        saveRooms(rooms);
        socket.join(code);
        socket.emit('roomCreated', { roomCode: code, playerName });
        broadcastRooms();
    });

    socket.on('joinRoom', ({ roomCode, playerName }) => {
        const rooms = loadRooms();
        const room = rooms[roomCode];
        if (!room || room.started) return socket.emit('error', 'Salle indisponible');
        
        if (room.players.some(p => p.name === playerName) || room.pendingPlayers.some(p => p.name === playerName)) {
            return socket.emit('error', 'Pseudo déjà pris');
        }

        const pending = { id: socket.id, name: playerName };
        room.pendingPlayers.push(pending);
        saveRooms(rooms);

        io.to(room.host).emit('newJoinRequest', pending);
        socket.emit('waitingForApproval');
    });

    socket.on('respondToJoinRequest', ({ roomCode, playerId, accept }) => {
        const rooms = loadRooms();
        const room = rooms[roomCode];
        if (!room || room.host !== socket.id) return;

        const idx = room.pendingPlayers.findIndex(p => p.id === playerId);
        if (idx === -1) return;

        const player = room.pendingPlayers.splice(idx, 1)[0];
        if (accept) {
            room.players.push(player);
            const target = io.sockets.sockets.get(playerId);
            if (target) {
                target.join(roomCode);
                target.emit('roomJoined', { roomCode, playerName: player.name });
            }
            io.to(roomCode).emit('playersUpdate', { players: room.players, host: room.host });
        } else {
            io.to(playerId).emit('error', 'L’hôte a refusé votre entrée.');
        }
        saveRooms(rooms);
        socket.emit('updatePendingList', room.pendingPlayers);
        broadcastRooms();
    });

    socket.on('startGame', (roomCode) => {
        const rooms = loadRooms();
        const room = rooms[roomCode];
        if (!room || room.host !== socket.id || room.players.length < 2) return;

        room.started = true;
        room.players.forEach(p => {
            room.playerHands[p.id] = [];
            for (let i = 0; i < 7; i++) room.playerHands[p.id].push(room.deck.pop());
        });
        let first = room.deck.pop();
        while (first.color === 'wild') { room.deck.unshift(first); first = room.deck.pop(); }
        room.discardPile.push(first);
        
        saveRooms(rooms);
        sendUpdate(room);
        broadcastRooms();
    });

    socket.on('playCard', ({ roomCode, cardIndex, wildColor }) => {
        const rooms = loadRooms();
        const room = rooms[roomCode];
        if (!room || !room.started || room.players[room.currentPlayerIndex].id !== socket.id) return;

        const card = room.playerHands[socket.id][cardIndex];
        room.playerHands[socket.id].splice(cardIndex, 1);
        room.discardPile.push(card);
        room.wildColor = (card.color === 'wild') ? wildColor : null;

        let winner = (room.playerHands[socket.id].length === 0) ? room.players.find(p => p.id === socket.id).name : null;
        applyCardEffect(room, card);
        saveRooms(rooms);
        sendUpdate(room, winner);
    });

    socket.on('drawCard', (roomCode) => {
        const rooms = loadRooms();
        const room = rooms[roomCode];
        if (!room || !room.started || room.players[room.currentPlayerIndex].id !== socket.id) return;

        if (room.deck.length === 0) {
            const top = room.discardPile.pop();
            room.deck = shuffle(room.discardPile);
            room.discardPile = [top];
        }
        room.playerHands[socket.id].push(room.deck.pop());
        room.currentPlayerIndex = getNextPlayerIndex(room);
        saveRooms(rooms);
        sendUpdate(room);
    });

    socket.on('sayUno', (roomCode) => {
        const rooms = loadRooms();
        const room = rooms[roomCode];
        if (room) {
            const p = room.players.find(p => p.id === socket.id);
            if (p) io.to(roomCode).emit('playerSaidUno', p.name);
        }
    });

    socket.on('disconnect', () => {
        const rooms = loadRooms();
        let changed = false;
        Object.keys(rooms).forEach(code => {
            const room = rooms[code];
            const idx = room.players.findIndex(p => p.id === socket.id);
            if (idx !== -1) {
                room.players.splice(idx, 1);
                changed = true;
                if (room.players.length === 0) delete rooms[code];
                else {
                    if (room.host === socket.id) room.host = room.players[0].id;
                    if (room.started) {
                        if (idx < room.currentPlayerIndex) room.currentPlayerIndex--;
                        if (room.currentPlayerIndex >= room.players.length) room.currentPlayerIndex = 0;
                        sendUpdate(room);
                    } else {
                        io.to(code).emit('playersUpdate', { players: room.players, host: room.host });
                    }
                }
            }
            // Nettoyage aussi des joueurs en attente
            const pIdx = room.pendingPlayers ? room.pendingPlayers.findIndex(p => p.id === socket.id) : -1;
            if (pIdx !== -1) {
                room.pendingPlayers.splice(pIdx, 1);
                changed = true;
                io.to(room.host).emit('updatePendingList', room.pendingPlayers);
            }
        });
        if (changed) { saveRooms(rooms); broadcastRooms(); }
    });
});

http.listen(PORT, () => console.log(`Serveur UNO prêt sur le port ${PORT}`));
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

const PORT = process.env.PORT || 3000;

// Servir les fichiers statiques
app.use(express.static('public'));

// Route principale
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Stockage des salles de jeu
const rooms = new Map();

// Couleurs et valeurs de cartes
const colors = ['red', 'yellow', 'green', 'blue'];
const values = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', '+2'];

// Créer un deck complet
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

// Mélanger un tableau
function shuffle(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Générer un code de salle
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Obtenir l'index du joueur suivant
function getNextPlayerIndex(room) {
  let nextIndex = room.currentPlayerIndex + room.direction;
  if (nextIndex >= room.players.length) {
    nextIndex = 0;
  } else if (nextIndex < 0) {
    nextIndex = room.players.length - 1;
  }
  return nextIndex;
}

// Remélanger le deck
function reshuffleDeck(room) {
  if (room.discardPile.length <= 1) return;
  
  const topCard = room.discardPile.pop();
  room.deck = shuffle(room.discardPile);
  room.discardPile = [topCard];
}

// Appliquer les effets des cartes
function applyCardEffect(room, card) {
  let skipNext = false;

  if (card.value === 'skip') {
    skipNext = true;
  } else if (card.value === 'reverse') {
    room.direction *= -1;
    if (room.players.length === 2) {
      skipNext = true;
    }
  } else if (card.value === '+2') {
    const nextPlayerIndex = getNextPlayerIndex(room);
    const nextPlayer = room.players[nextPlayerIndex];
    for (let i = 0; i < 2; i++) {
      if (room.deck.length === 0) reshuffleDeck(room);
      room.playerHands[nextPlayer.id].push(room.deck.pop());
    }
    skipNext = true;
  } else if (card.value === 'wild+4') {
    const nextPlayerIndex = getNextPlayerIndex(room);
    const nextPlayer = room.players[nextPlayerIndex];
    for (let i = 0; i < 4; i++) {
      if (room.deck.length === 0) reshuffleDeck(room);
      room.playerHands[nextPlayer.id].push(room.deck.pop());
    }
    skipNext = true;
  }

  room.currentPlayerIndex = getNextPlayerIndex(room);
  if (skipNext) {
    room.currentPlayerIndex = getNextPlayerIndex(room);
  }
}

// Gestion des connexions Socket.IO
io.on('connection', (socket) => {
  console.log('Nouveau joueur connecté:', socket.id);

  // Créer une salle
  socket.on('createRoom', (playerName) => {
    const roomCode = generateRoomCode();
    
    const room = {
      code: roomCode,
      host: socket.id,
      players: [{
        id: socket.id,
        name: playerName
      }],
      started: false,
      deck: createDeck(),
      discardPile: [],
      currentPlayerIndex: 0,
      direction: 1,
      playerHands: {},
      wildColor: null
    };

    rooms.set(roomCode, room);
    socket.join(roomCode);

    socket.emit('roomCreated', { roomCode, playerName });
    console.log(`Salle ${roomCode} créée par ${playerName}`);
  });

  // Rejoindre une salle
  socket.on('joinRoom', ({ roomCode, playerName }) => {
    const room = rooms.get(roomCode);

    if (!room) {
      socket.emit('error', 'Salle introuvable');
      return;
    }

    if (room.started) {
      socket.emit('error', 'La partie a déjà commencé');
      return;
    }

    if (room.players.some(p => p.name === playerName)) {
      socket.emit('error', 'Ce pseudo est déjà pris');
      return;
    }

    room.players.push({
      id: socket.id,
      name: playerName
    });

    socket.join(roomCode);
    socket.emit('roomJoined', { roomCode, playerName });
    
    // Notifier tous les joueurs de la mise à jour
    io.to(roomCode).emit('playersUpdate', {
      players: room.players.map(p => ({ id: p.id, name: p.name })),
      host: room.host
    });

    console.log(`${playerName} a rejoint la salle ${roomCode}`);
  });

  // Démarrer la partie
  socket.on('startGame', (roomCode) => {
    const room = rooms.get(roomCode);

    if (!room) {
      socket.emit('error', 'Salle introuvable');
      return;
    }

    if (room.host !== socket.id) {
      socket.emit('error', 'Seul l\'hôte peut démarrer la partie');
      return;
    }

    if (room.players.length < 2) {
      socket.emit('error', 'Minimum 2 joueurs requis');
      return;
    }

    // Distribuer les cartes
    room.players.forEach(player => {
      room.playerHands[player.id] = [];
      for (let i = 0; i < 7; i++) {
        room.playerHands[player.id].push(room.deck.pop());
      }
    });

    // Première carte sur le tas de défausse
    let firstCard = room.deck.pop();
    while (firstCard.color === 'wild') {
      room.deck.unshift(firstCard);
      firstCard = room.deck.pop();
    }
    room.discardPile.push(firstCard);

    room.started = true;
    room.currentPlayerIndex = 0;

    // Envoyer l'état du jeu à tous les joueurs
    room.players.forEach(player => {
      io.to(player.id).emit('gameStarted', {
        roomCode,
        players: room.players.map(p => ({ id: p.id, name: p.name })),
        currentPlayerIndex: room.currentPlayerIndex,
        topCard: firstCard,
        wildColor: null,
        hand: room.playerHands[player.id],
        playerHands: Object.keys(room.playerHands).reduce((acc, key) => {
          acc[key] = room.playerHands[key].length;
          return acc;
        }, {})
      });
    });

    console.log(`Partie démarrée dans la salle ${roomCode}`);
  });

  // Jouer une carte
  socket.on('playCard', ({ roomCode, cardIndex, wildColor }) => {
    const room = rooms.get(roomCode);

    if (!room || !room.started) {
      socket.emit('error', 'Partie introuvable');
      return;
    }

    const currentPlayer = room.players[room.currentPlayerIndex];
    if (currentPlayer.id !== socket.id) {
      socket.emit('error', 'Ce n\'est pas votre tour');
      return;
    }

    const card = room.playerHands[socket.id][cardIndex];
    if (!card) {
      socket.emit('error', 'Carte invalide');
      return;
    }

    // Retirer la carte de la main
    room.playerHands[socket.id].splice(cardIndex, 1);
    room.discardPile.push(card);

    // Si c'est une carte wild, appliquer la couleur choisie
    if (card.color === 'wild' && wildColor) {
      room.wildColor = wildColor;
    } else if (card.color !== 'wild') {
      room.wildColor = null;
    }

    // Appliquer les effets de la carte
    applyCardEffect(room, card);

    // Vérifier s'il y a un gagnant
    let winner = null;
    if (room.playerHands[socket.id].length === 0) {
      winner = currentPlayer.name;
    }

    // Envoyer l'état mis à jour à tous les joueurs
    room.players.forEach(player => {
      io.to(player.id).emit('gameUpdate', {
        currentPlayerIndex: room.currentPlayerIndex,
        topCard: room.discardPile[room.discardPile.length - 1],
        wildColor: room.wildColor,
        hand: room.playerHands[player.id],
        playerHands: Object.keys(room.playerHands).reduce((acc, key) => {
          acc[key] = room.playerHands[key].length;
          return acc;
        }, {}),
        winner
      });
    });

    if (winner) {
      console.log(`${winner} a gagné dans la salle ${roomCode}!`);
    }
  });

  // Piocher une carte
  socket.on('drawCard', (roomCode) => {
    const room = rooms.get(roomCode);

    if (!room || !room.started) {
      socket.emit('error', 'Partie introuvable');
      return;
    }

    const currentPlayer = room.players[room.currentPlayerIndex];
    if (currentPlayer.id !== socket.id) {
      socket.emit('error', 'Ce n\'est pas votre tour');
      return;
    }

    if (room.deck.length === 0) {
      reshuffleDeck(room);
    }

    const drawnCard = room.deck.pop();
    room.playerHands[socket.id].push(drawnCard);
    room.currentPlayerIndex = getNextPlayerIndex(room);

    // Envoyer l'état mis à jour
    room.players.forEach(player => {
      io.to(player.id).emit('gameUpdate', {
        currentPlayerIndex: room.currentPlayerIndex,
        topCard: room.discardPile[room.discardPile.length - 1],
        wildColor: room.wildColor,
        hand: room.playerHands[player.id],
        playerHands: Object.keys(room.playerHands).reduce((acc, key) => {
          acc[key] = room.playerHands[key].length;
          return acc;
        }, {})
      });
    });
  });

  // Dire UNO
  socket.on('sayUno', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      io.to(roomCode).emit('playerSaidUno', player.name);
    }
  });

  // Déconnexion
  socket.on('disconnect', () => {
    console.log('Joueur déconnecté:', socket.id);

    // Trouver et nettoyer les salles
    rooms.forEach((room, roomCode) => {
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      
      if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        room.players.splice(playerIndex, 1);

        if (room.players.length === 0) {
          rooms.delete(roomCode);
          console.log(`Salle ${roomCode} supprimée`);
        } else {
          // Si c'était l'hôte, transférer à quelqu'un d'autre
          if (room.host === socket.id) {
            room.host = room.players[0].id;
          }

          io.to(roomCode).emit('playerLeft', {
            playerName: player.name,
            players: room.players.map(p => ({ id: p.id, name: p.name })),
            host: room.host
          });
        }
      }
    });
  });
});

// Démarrer le serveur
http.listen(PORT, () => {
  console.log(`🎴 Serveur UNO démarré sur le port ${PORT}`);
  console.log(`📍 Accédez au jeu sur http://localhost:${PORT}`);
});

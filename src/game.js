const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function createDeck() {
  return SUITS.flatMap(suit => RANKS.map(rank => ({ suit, rank })));
}

function shuffle(deck, random = Math.random) {
  const cards = [...deck];
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function cardPoints(card) {
  if (card.rank === 'A') return 11;
  if (['J', 'Q', 'K'].includes(card.rank)) return 10;
  return Number(card.rank);
}

function handValue(hand) {
  let total = hand.reduce((sum, card) => sum + cardPoints(card), 0);
  let aces = hand.filter(card => card.rank === 'A').length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return {
    total,
    soft: hand.some(card => card.rank === 'A') && total <= 21,
    bust: total > 21,
    blackjack: hand.length === 2 && total === 21
  };
}

function draw(game) {
  if (!game.deck.length) game.deck = shuffle(createDeck());
  return game.deck.pop();
}

function createGame(players, options = {}) {
  const deck = shuffle(createDeck(), options.random);
  const game = {
    deck,
    players: players.map(player => ({
      id: player.id,
      name: player.name,
      hand: [],
      status: 'playing',
      outcome: null
    })),
    dealer: { hand: [], status: 'hidden' },
    turnIndex: 0,
    finished: false,
    lastAction: 'カードを配りました'
  };

  for (let i = 0; i < 2; i += 1) {
    for (const player of game.players) player.hand.push(draw(game));
    game.dealer.hand.push(draw(game));
  }

  for (const player of game.players) {
    if (handValue(player.hand).blackjack) player.status = 'blackjack';
  }
  advanceTurn(game);
  return game;
}

function activePlayer(game) {
  return game.players[game.turnIndex] || null;
}

function advanceTurn(game) {
  if (game.finished) return;
  const next = game.players.findIndex(player => player.status === 'playing');
  if (next >= 0) {
    game.turnIndex = next;
    return;
  }
  finishDealer(game);
}

function hit(game, playerId) {
  if (game.finished) throw new Error('ゲームは終了しています');
  const player = activePlayer(game);
  if (!player || player.id !== playerId) throw new Error('あなたの番ではありません');
  if (player.status !== 'playing') throw new Error('このプレイヤーは行動できません');

  player.hand.push(draw(game));
  const value = handValue(player.hand);
  if (value.bust) {
    player.status = 'busted';
    player.outcome = 'lose';
    game.lastAction = `${player.name}さんがバーストしました`;
    advanceTurn(game);
  } else if (value.total === 21) {
    player.status = 'stood';
    game.lastAction = `${player.name}さんは21でストップしました`;
    advanceTurn(game);
  } else {
    game.lastAction = `${player.name}さんが1枚引きました`;
  }
  return player;
}

function stand(game, playerId) {
  if (game.finished) throw new Error('ゲームは終了しています');
  const player = activePlayer(game);
  if (!player || player.id !== playerId) throw new Error('あなたの番ではありません');
  if (player.status !== 'playing') throw new Error('このプレイヤーは行動できません');

  player.status = 'stood';
  game.lastAction = `${player.name}さんがスタンドしました`;
  advanceTurn(game);
  return player;
}

function finishDealer(game) {
  if (game.finished) return;
  game.dealer.status = 'playing';
  while (handValue(game.dealer.hand).total < 17) game.dealer.hand.push(draw(game));
  game.dealer.status = 'stood';

  const dealerValue = handValue(game.dealer.hand);
  for (const player of game.players) {
    const playerValue = handValue(player.hand);
    if (player.status === 'busted') {
      player.outcome = 'lose';
    } else if (playerValue.blackjack && !dealerValue.blackjack) {
      player.outcome = 'blackjack';
    } else if (dealerValue.bust) {
      player.outcome = 'win';
    } else if (playerValue.total > dealerValue.total) {
      player.outcome = 'win';
    } else if (playerValue.total < dealerValue.total) {
      player.outcome = 'lose';
    } else {
      player.outcome = 'push';
    }
    player.status = 'finished';
  }

  game.finished = true;
  game.lastAction = dealerValue.bust
    ? 'ディーラーがバーストしました'
    : `ディーラーは${dealerValue.total}でストップしました`;
}

function publicState(game, viewerId) {
  if (!game) return null;
  const revealDealer = game.finished || game.dealer.status !== 'hidden';
  return {
    finished: game.finished,
    turnPlayerId: activePlayer(game)?.id || null,
    turnPlayerName: activePlayer(game)?.name || '',
    lastAction: game.lastAction,
    dealer: {
      hand: revealDealer ? game.dealer.hand : [game.dealer.hand[0], null],
      value: revealDealer ? handValue(game.dealer.hand).total : null,
      bust: revealDealer ? handValue(game.dealer.hand).bust : false
    },
    players: game.players.map(player => {
      const value = handValue(player.hand);
      return {
        id: player.id,
        name: player.name,
        isYou: player.id === viewerId,
        hand: player.hand,
        value: value.total,
        bust: value.bust,
        blackjack: value.blackjack,
        status: player.status,
        outcome: player.outcome
      };
    })
  };
}

module.exports = {
  createDeck,
  shuffle,
  handValue,
  createGame,
  hit,
  stand,
  publicState
};

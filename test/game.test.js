const test = require('node:test');
const assert = require('node:assert/strict');
const { createDeck, handValue, createGame, hit, stand, publicState } = require('../src/game');

test('deck has 52 standard cards', () => {
  const deck = createDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map(card => `${card.suit}_${card.rank}`)).size, 52);
});

test('ace counts as 11 or 1', () => {
  assert.equal(handValue([{ suit: 'S', rank: 'A' }, { suit: 'H', rank: '9' }]).total, 20);
  assert.equal(handValue([{ suit: 'S', rank: 'A' }, { suit: 'H', rank: '9' }, { suit: 'D', rank: '5' }]).total, 15);
});

test('blackjack is detected', () => {
  const value = handValue([{ suit: 'S', rank: 'A' }, { suit: 'H', rank: 'K' }]);
  assert.equal(value.total, 21);
  assert.equal(value.blackjack, true);
});

test('createGame deals two cards to each player and dealer', () => {
  const game = createGame([{ id: 'p1', name: 'たむたむ' }, { id: 'p2', name: '友達' }]);
  assert.equal(game.players[0].hand.length, 2);
  assert.equal(game.players[1].hand.length, 2);
  assert.equal(game.dealer.hand.length, 2);
});

test('publicState hides dealer hole card before finish', () => {
  const game = createGame([{ id: 'p1', name: 'たむたむ' }]);
  const state = publicState(game, 'p1');
  assert.equal(state.dealer.hand.length, 2);
  assert.equal(state.dealer.hand[1], null);
  assert.equal(state.dealer.value, null);
});

test('stand advances to dealer and finishes single player round', () => {
  const game = createGame([{ id: 'p1', name: 'たむたむ' }]);
  stand(game, 'p1');
  assert.equal(game.finished, true);
  assert.ok(['win', 'lose', 'push', 'blackjack'].includes(game.players[0].outcome));
});

test('hit is only allowed on your turn', () => {
  const game = createGame([{ id: 'p1', name: 'たむたむ' }, { id: 'p2', name: '友達' }]);
  assert.throws(() => hit(game, 'p2'), /あなたの番ではありません/);
});

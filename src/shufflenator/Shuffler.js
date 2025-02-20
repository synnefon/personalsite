import { SCORE_FUNCTION_MAP } from './shuffle_scorers.js';

class ShuffledDeck {
    constructor(cardList, permutation, scoreType) {
        this.cardList = cardList;
        this.permutation = permutation;
        this.scoreType = scoreType;
        this.score = SCORE_FUNCTION_MAP[scoreType](cardList);
    }

    equals(other) {
        return other instanceof ShuffledDeck && this.cardList === other.cardList;
    }

    hash() {
        return this.cardList.join(',');
    }

    print() {
        console.log(this.permutation, ":", this.score);
    }
}

function formatResponse(originalDeck, cardPiles) {
    return new ShuffledDeck(
        cardPiles.flat(),
        [...originalDeck.permutation, cardPiles.length],
        originalDeck.scoreType
    );
}

function shuffle(pileSelector, deck, numPiles) {
    const piles = Array.from({ length: numPiles }, () => []);

    for (let idx = 0; idx < deck.cardList.length; idx++) {
        const pile = pileSelector(idx);
        piles[pile].unshift(deck.cardList[idx]);
    }

    return formatResponse(deck, piles);
}

function pileShuffle(deck, numPiles) {
    const pileSelector = (idx) => idx % numPiles;
    return shuffle(pileSelector, deck, numPiles);
}

function randomPileShuffle(deck, numPiles) {
    const pileSelector = () => Math.floor(Math.random() * numPiles);
    return shuffle(pileSelector, deck, numPiles);
}

function cutDeck(deck) {
    const halfWay = Math.floor(deck.cardList.length / 2);
    const pileSelector = (idx) => (idx < halfWay ? idx + halfWay : idx - halfWay);
    return shuffle(pileSelector, deck, deck.cardList.length);
}

const SHUFFLE_STRAT = {
    PILE: 'PILE',
    RANDOM_PILE: 'RANDOM_PILE'
};

const SHUFFLE_FUNCTION_MAP = {
    [SHUFFLE_STRAT.PILE]: pileShuffle,
    [SHUFFLE_STRAT.RANDOM_PILE]: randomPileShuffle
};


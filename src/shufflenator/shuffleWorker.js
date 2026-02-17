// Self-contained web worker for shuffle computation.
// All logic is inlined to avoid import issues in worker context.

// --- Scorers ---

function calcAverageNeighborDist(cards) {
    const deckLen = cards.length;
    let total = 0;
    for (let idx = 0; idx < deckLen; idx++) {
        let diff = cards[(idx + 1) % deckLen] - cards[idx];
        if (diff < 0) diff += deckLen;
        total += diff;
    }
    return total / deckLen;
}

function calcLocationDelta(cards) {
    let total = 0;
    for (let idx = 0; idx < cards.length; idx++) {
        total += Math.abs(idx - cards[idx]);
    }
    return total / cards.length;
}

function calcShannonEntropy(cards) {
    const deckLen = cards.length;
    const counts = {};
    for (let idx = 0; idx < deckLen; idx++) {
        let diff = cards[(idx + 1) % deckLen] - cards[idx];
        if (diff < 0) diff += deckLen;
        counts[diff] = (counts[diff] || 0) + 1;
    }
    let entropy = 0;
    for (const key in counts) {
        const p = counts[key] / deckLen;
        entropy += Math.abs(Math.log(p) * p);
    }
    return entropy;
}

const SCORE_FUNCTION_MAP = {
    "SHANNON_ENTROPY": calcShannonEntropy,
    "NEIGHBOR_DIST": calcAverageNeighborDist,
    "LOCATION_DELTA": calcLocationDelta,
};

// --- Shuffler ---

function makeShuffledDeck(cardList, permutation, scoreType) {
    return {
        cardList,
        permutation,
        score: SCORE_FUNCTION_MAP[scoreType](cardList),
        key: permutation.join(','),
    };
}

function shuffle(pileSelector, deck, numPiles, scoreType) {
    const piles = Array.from({ length: numPiles }, () => []);
    for (let idx = 0; idx < deck.cardList.length; idx++) {
        piles[pileSelector(idx)].unshift(deck.cardList[idx]);
    }
    return makeShuffledDeck(piles.flat(), [...deck.permutation, numPiles], scoreType);
}

function pileShuffle(deck, numPiles, scoreType) {
    const cards = deck.cardList;
    const len = cards.length;
    const result = new Array(len);
    const full = Math.floor(len / numPiles);
    const remainder = len % numPiles;
    let offset = 0;
    const pileStart = new Array(numPiles);
    const pileSize = new Array(numPiles);
    for (let p = 0; p < numPiles; p++) {
        pileStart[p] = offset;
        pileSize[p] = p < remainder ? full + 1 : full;
        offset += pileSize[p];
    }
    const writePos = new Array(numPiles);
    for (let p = 0; p < numPiles; p++) {
        writePos[p] = pileStart[p] + pileSize[p] - 1;
    }
    for (let idx = 0; idx < len; idx++) {
        const p = idx % numPiles;
        result[writePos[p]] = cards[idx];
        writePos[p]--;
    }
    return makeShuffledDeck(result, [...deck.permutation, numPiles], scoreType);
}

function randomPileShuffle(deck, numPiles, scoreType) {
    return shuffle(() => Math.floor(Math.random() * numPiles), deck, numPiles, scoreType);
}

const SHUFFLE_FUNCTION_MAP = {
    "PILE": pileShuffle,
    "RANDOM_PILE": randomPileShuffle,
};

// --- Simulator ---
// eslint-disable-next-line no-restricted-globals
const workerScope = self;

workerScope.onmessage = (e) => {
    const { shuffleStrat, scoreType, maxShuffles, deckSize, minNumPiles, maxNumPiles } = e.data;
    const pileDivisions = Array.from({ length: maxNumPiles - minNumPiles + 1 }, (_, i) => i + minNumPiles);
    const shuffleFunction = SHUFFLE_FUNCTION_MAP[shuffleStrat];

    const seen = new Set();
    const baseCardList = Array.from({ length: deckSize }, (_, i) => i);
    const baseDeck = makeShuffledDeck(baseCardList, [], scoreType);
    seen.add(baseDeck.key);
    let frontier = [baseDeck];
    let best = null;

    for (let round = 0; round < maxShuffles; round++) {
        const roundTotal = frontier.length * pileDivisions.length;
        const nextFrontier = [];

        for (let j = 0; j < frontier.length; j++) {
            const deck = frontier[j];
            for (const numPiles of pileDivisions) {
                const newDeck = shuffleFunction(deck, numPiles, scoreType);
                if (!seen.has(newDeck.key)) {
                    seen.add(newDeck.key);
                    nextFrontier.push(newDeck);
                    if (!best || newDeck.score > best.score) best = newDeck;
                }
            }
            if (j % 50 === 0) {
                workerScope.postMessage({
                    type: 'progress',
                    completed: (j + 1) * pileDivisions.length,
                    total: roundTotal,
                    round: round + 1,
                });
            }
        }

        // free old frontier keys from deck objects
        for (const deck of frontier) { delete deck.key; }
        frontier = nextFrontier;

        workerScope.postMessage({
            type: 'progress',
            completed: roundTotal,
            total: roundTotal,
            round: round + 1,
        });
    }

    workerScope.postMessage({
        type: 'result',
        data: best ? { permutation: best.permutation, score: best.score } : null,
    });
};

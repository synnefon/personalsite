// Self-contained web worker for shuffle computation.
// All logic is inlined to avoid import issues in worker context.

// --- Scorers ---

function calcAdjacentTermDifferences(cards) {
    const deckLen = cards.length;
    const diffs = [];
    for (let idx = 0; idx < deckLen; idx++) {
        let diff = cards[(idx + 1) % deckLen] - cards[idx];
        if (diff < 0) diff += deckLen;
        diffs.push(diff);
    }
    return diffs;
}

function calcAverageNeighborDist(cards) {
    return calcAdjacentTermDifferences(cards).reduce((a, b) => a + b, 0) / cards.length;
}

function calcLocationDelta(cards) {
    let total = 0;
    for (let idx = 0; idx < cards.length; idx++) {
        total += Math.abs(idx - cards[idx]);
    }
    return total / cards.length;
}

function calcShannonEntropy(cards) {
    const diffs = calcAdjacentTermDifferences(cards);
    const counts = {};
    for (const d of diffs) counts[d] = (counts[d] || 0) + 1;
    const pCounts = Object.values(counts).map(c => c / cards.length);
    return pCounts.map(p => Math.abs(Math.log(p) * p)).filter(p => p > 0).reduce((a, b) => a + b, 0);
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
    // compute how many cards land in each pile
    const full = Math.floor(len / numPiles);
    const remainder = len % numPiles;
    // pile i has (full + 1) cards if i < remainder, else full cards
    // cards are dealt cyclically and unshifted, so within each pile they're reversed
    // compute the starting write index for each pile
    let offset = 0;
    const pileStart = new Array(numPiles);
    const pileSize = new Array(numPiles);
    for (let p = 0; p < numPiles; p++) {
        pileStart[p] = offset;
        pileSize[p] = p < remainder ? full + 1 : full;
        offset += pileSize[p];
    }
    // write position tracks next write slot per pile (fill from end to simulate unshift)
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

function runPerm(shuffledDecks, pileDivisions, shuffleFunction, scoreType) {
    const newDecks = [];
    for (const deck of shuffledDecks) {
        for (const numPiles of pileDivisions) {
            newDecks.push(shuffleFunction(deck, numPiles, scoreType));
        }
    }
    return newDecks;
}

function shuffleDecks({ shuffleStrat, scoreType, maxShuffles, deckSize, minNumPiles, maxNumPiles }) {
    const pileDivisions = Array.from({ length: maxNumPiles - minNumPiles + 1 }, (_, i) => i + minNumPiles);
    const baseCardList = Array.from({ length: deckSize }, (_, i) => i);
    const shuffleFunction = SHUFFLE_FUNCTION_MAP[shuffleStrat];

    const seen = new Set();
    const baseDeck = makeShuffledDeck(baseCardList, [], scoreType);
    seen.add(baseDeck.cardList.join(','));
    let shuffledDecks = [baseDeck];
    let best = null;

    for (let i = 0; i < maxShuffles; i++) {
        const newDecks = runPerm(shuffledDecks, pileDivisions, shuffleFunction, scoreType);
        for (const deck of newDecks) {
            const key = deck.cardList.join(',');
            if (seen.has(key)) continue;
            seen.add(key);
            shuffledDecks.push(deck);
        }
        for (const deck of shuffledDecks) {
            if (!best || deck.score > best.score) best = deck;
        }
    }

    return best;
}

// --- Worker message handler ---
// eslint-disable-next-line no-restricted-globals
const workerScope = self;

workerScope.onmessage = (e) => {
    const result = shuffleDecks(e.data);
    workerScope.postMessage(result);
};

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

let entropyCounts = null;
let entropySlots = null;
let entropyLookup = null;

function calcShannonEntropy(cards) {
    const deckLen = cards.length;
    if (!entropyCounts || entropyCounts.length < deckLen) {
        entropyCounts = new Uint32Array(deckLen);
        entropySlots = new Uint16Array(deckLen);
        entropyLookup = new Float64Array(deckLen + 1);
        for (let k = 1; k <= deckLen; k++) {
            const p = k / deckLen;
            entropyLookup[k] = -Math.log(p) * p;
        }
    }
    let usedCount = 0;
    for (let idx = 0; idx < deckLen - 1; idx++) {
        let diff = cards[idx + 1] - cards[idx];
        if (diff < 0) diff += deckLen;
        if (entropyCounts[diff] === 0) entropySlots[usedCount++] = diff;
        entropyCounts[diff]++;
    }
    let diff = cards[0] - cards[deckLen - 1];
    if (diff < 0) diff += deckLen;
    if (entropyCounts[diff] === 0) entropySlots[usedCount++] = diff;
    entropyCounts[diff]++;

    let entropy = 0;
    for (let i = 0; i < usedCount; i++) {
        const slot = entropySlots[i];
        entropy += entropyLookup[entropyCounts[slot]];
        entropyCounts[slot] = 0;
    }
    return entropy;
}

const SCORE_FUNCTION_MAP = {
    "SHANNON_ENTROPY": calcShannonEntropy,
    "NEIGHBOR_DIST": calcAverageNeighborDist,
    "LOCATION_DELTA": calcLocationDelta,
};

// --- Precomputed maps (populated per run) ---
let permMaps = {};

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
    return makeShuffledDeck(piles.flat(), deck.permutation.concat(numPiles), scoreType);
}

function pileShuffle(deck, numPiles, scoreType) {
    const cards = deck.cardList;
    const len = cards.length;
    const map = permMaps[numPiles];
    const result = new Array(len);
    for (let i = 0; i < len; i++) {
        result[map[i]] = cards[i];
    }
    return makeShuffledDeck(result, deck.permutation.concat(numPiles), scoreType);
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
    const numOptions = pileDivisions.length;

    // Precompute permutation index maps for each pile count
    permMaps = {};
    for (const numPiles of pileDivisions) {
        const map = new Int32Array(deckSize);
        const full = Math.floor(deckSize / numPiles);
        const remainder = deckSize % numPiles;
        let offset = 0;
        const pileStart = new Array(numPiles);
        const pileSz = new Array(numPiles);
        for (let p = 0; p < numPiles; p++) {
            pileStart[p] = offset;
            pileSz[p] = p < remainder ? full + 1 : full;
            offset += pileSz[p];
        }
        const writePos = new Array(numPiles);
        for (let p = 0; p < numPiles; p++) {
            writePos[p] = pileStart[p] + pileSz[p] - 1;
        }
        for (let idx = 0; idx < deckSize; idx++) {
            map[idx] = writePos[idx % numPiles];
            writePos[idx % numPiles]--;
        }
        permMaps[numPiles] = map;
    }

    const baseCardList = Array.from({ length: deckSize }, (_, i) => i);
    const baseDeck = makeShuffledDeck(baseCardList, [], scoreType);

    let totalNodes = 0;
    for (let d = 1; d <= maxShuffles; d++) totalNodes += Math.pow(numOptions, d);

    let nodesVisited = 0;
    let best = null;

    // Iterative DFS — stack stays at O(maxShuffles * numOptions) entries max,
    // vs BFS frontier which grows as O(numOptions^round).
    const stack = [{ deck: baseDeck, depth: 0 }];

    function processChunk() {
        const start = performance.now();

        while (stack.length > 0) {
            const { deck, depth } = stack.pop();

            if (depth > 0) {
                nodesVisited++;
                if (!best || deck.score > best.score) {
                    best = { permutation: [...deck.permutation], score: deck.score };
                }
            }

            if (depth < maxShuffles) {
                for (let i = numOptions - 1; i >= 0; i--) {
                    const child = shuffleFunction(deck, pileDivisions[i], scoreType);
                    stack.push({ deck: child, depth: depth + 1 });
                }
            }

            if (performance.now() - start > 200) {
                workerScope.postMessage({
                    type: 'progress',
                    completed: nodesVisited,
                    total: totalNodes,
                    round: 1,
                });
                setTimeout(processChunk, 0);
                return;
            }
        }

        workerScope.postMessage({
            type: 'result',
            data: best ? { permutation: best.permutation, score: best.score } : null,
        });
    }

    processChunk();
};

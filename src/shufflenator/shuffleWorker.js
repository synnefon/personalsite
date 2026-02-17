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

function calcShannonEntropy(cards) {
    const deckLen = cards.length;
    if (!entropyCounts || entropyCounts.length < deckLen) {
        entropyCounts = new Uint32Array(deckLen);
        entropySlots = new Uint16Array(deckLen);
    }
    let usedCount = 0;
    for (let idx = 0; idx < deckLen; idx++) {
        let diff = cards[(idx + 1) % deckLen] - cards[idx];
        if (diff < 0) diff += deckLen;
        if (entropyCounts[diff] === 0) entropySlots[usedCount++] = diff;
        entropyCounts[diff]++;
    }
    let entropy = 0;
    for (let i = 0; i < usedCount; i++) {
        const slot = entropySlots[i];
        const p = entropyCounts[slot] / deckLen;
        entropy -= Math.log(p) * p;
        entropyCounts[slot] = 0;
    }
    return entropy;
}

const SCORE_FUNCTION_MAP = {
    "SHANNON_ENTROPY": calcShannonEntropy,
    "NEIGHBOR_DIST": calcAverageNeighborDist,
    "LOCATION_DELTA": calcLocationDelta,
};

// --- Profiling ---
let tShuffle = 0, tScore = 0, tSpread = 0, tStackOps = 0, tTimeCheck = 0;

// --- Shuffler ---

function makeShuffledDeck(cardList, permutation, scoreType) {
    const t0 = performance.now();
    const score = SCORE_FUNCTION_MAP[scoreType](cardList);
    tScore += performance.now() - t0;

    return { cardList, permutation, score };
}

function shuffle(pileSelector, deck, numPiles, scoreType) {
    const piles = Array.from({ length: numPiles }, () => []);
    for (let idx = 0; idx < deck.cardList.length; idx++) {
        piles[pileSelector(idx)].unshift(deck.cardList[idx]);
    }
    return makeShuffledDeck(piles.flat(), deck.permutation.concat(numPiles), scoreType);
}

function pileShuffle(deck, numPiles, scoreType) {
    const t0 = performance.now();
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
    const t1 = performance.now();
    tShuffle += t1 - t0;  // just the card rearrangement

    const t2 = performance.now();
    const perm = deck.permutation.concat(numPiles);
    tSpread += performance.now() - t2;

    return makeShuffledDeck(result, perm, scoreType);
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
    console.log(`[params] deck=${deckSize} piles=${minNumPiles}-${maxNumPiles} rounds=${maxShuffles} strat=${shuffleStrat} score=${scoreType}`);
    const pileDivisions = Array.from({ length: maxNumPiles - minNumPiles + 1 }, (_, i) => i + minNumPiles);
    const shuffleFunction = SHUFFLE_FUNCTION_MAP[shuffleStrat];
    const numOptions = pileDivisions.length;

    const baseCardList = Array.from({ length: deckSize }, (_, i) => i);
    const baseDeck = makeShuffledDeck(baseCardList, [], scoreType);

    let totalNodes = 0;
    for (let d = 1; d <= maxShuffles; d++) totalNodes += Math.pow(numOptions, d);

    let nodesVisited = 0;
    let best = null;

    // Iterative DFS — stack stays at O(maxShuffles * numOptions) entries max,
    // vs BFS frontier which grows as O(numOptions^round).
    const stack = [{ deck: baseDeck, depth: 0 }];

    tShuffle = 0; tScore = 0; tSpread = 0; tStackOps = 0; tTimeCheck = 0;

    function processChunk() {
        const start = performance.now();

        while (stack.length > 0) {
            let t0, t1;

            t0 = performance.now();
            const { deck, depth } = stack.pop();
            t1 = performance.now();
            tStackOps += t1 - t0;

            if (depth > 0) {
                nodesVisited++;
                if (!best || deck.score > best.score) {
                    best = { permutation: [...deck.permutation], score: deck.score };
                }
            }

            if (depth < maxShuffles) {
                for (let i = numOptions - 1; i >= 0; i--) {
                    const child = shuffleFunction(deck, pileDivisions[i], scoreType);

                    t0 = performance.now();
                    stack.push({ deck: child, depth: depth + 1 });
                    tStackOps += performance.now() - t0;
                }
            }

            t0 = performance.now();
            const elapsed = t0 - start;
            tTimeCheck += performance.now() - t0;

            if (elapsed > 200) {
                workerScope.postMessage({
                    type: 'progress',
                    completed: nodesVisited,
                    total: totalNodes,
                    round: 1,
                });
                console.log(
                    `[profile] nodes=${nodesVisited} | shuffle=${tShuffle.toFixed(0)}ms score=${tScore.toFixed(0)}ms spread=${tSpread.toFixed(0)}ms | stackOps=${tStackOps.toFixed(0)}ms timeCheck=${tTimeCheck.toFixed(0)}ms`
                );
                setTimeout(processChunk, 0);
                return;
            }
        }

        console.log(
            `[profile FINAL] nodes=${nodesVisited} | shuffle=${tShuffle.toFixed(0)}ms score=${tScore.toFixed(0)}ms spread=${tSpread.toFixed(0)}ms | stackOps=${tStackOps.toFixed(0)}ms timeCheck=${tTimeCheck.toFixed(0)}ms`
        );
        workerScope.postMessage({
            type: 'result',
            data: best ? { permutation: best.permutation, score: best.score } : null,
        });
    }

    processChunk();
};

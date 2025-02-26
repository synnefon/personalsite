function calcAdjacentTermDifferences(cards) {
    const deckLen = cards.length;
    const adjacentTermDifferences = [];
    for (let idx = 0; idx < deckLen; idx++) {
        const nextIdx = (idx + 1) % deckLen;
        let diff = (cards[nextIdx] - cards[idx]);
        if (diff < 0) {
            diff += deckLen;
        }
        adjacentTermDifferences.push(diff);
    }
    return adjacentTermDifferences;
}

function calcAverageNeighborDist(cards) {
    return calcAdjacentTermDifferences(cards).reduce((a, b) => a + b, 0) / cards.length;
}

function calcLocationDelta(cards) {
    let totalLocationDelta = 0;
    for (let idx = 0; idx < cards.length; idx++) {
        const delta = Math.abs(idx - cards[idx]);
        totalLocationDelta += delta;
    }
    return totalLocationDelta / cards.length;
}

function calcShannonEntropy(cards) {
    const adjacentTermDifferences = calcAdjacentTermDifferences(cards);
    const termCounts = {};
    for (const diff of adjacentTermDifferences) {
        termCounts[diff] = (termCounts[diff] || 0) + 1;
    }
    const pCounts = Object.values(termCounts).map(c => c / cards.length);
    const lnPCounts = pCounts.map(p => Math.abs(Math.log(p) * p)).filter(p => p > 0);
    return lnPCounts.reduce((a, b) => a + b, 0);
}

export const SCORE_TYPE = ['SHANNON_ENTROPY', 'NEIGHBOR_DIST', 'LOCATION_DELTA'];
export const SCORE_FUNCTION_MAP = {
    "SHANNON_ENTROPY": calcShannonEntropy,
    "NEIGHBOR_DIST": calcAverageNeighborDist,
    "LOCATION_DELTA": calcLocationDelta
};


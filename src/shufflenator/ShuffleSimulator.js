import { SHUFFLE_FUNCTION_MAP, ShuffledDeck } from './Shuffler';
// import { Worker, isMainThread, parentPort } from 'worker_threads';

// const MT_CUTOFF = 5000;

function runPerm(shuffledDecks, pileDivisions, shuffleFunction) {
    const newDecks = [];
    for (const deck of shuffledDecks) {
        for (const numPiles of pileDivisions) {
            const res = shuffleFunction(deck, numPiles);
            newDecks.push(res);
        }
    }

    return newDecks;
}

export const shuffleDecks = async ({
    shuffleStrat,
    scoreType,
    maxShuffles,
    deckSize,
    minNumPiles,
    maxNumPiles
}) => {
    const pileDivisions = Array.from({ length: maxNumPiles - minNumPiles + 1 }, (_, i) => i + minNumPiles);
    const baseCardList = Array.from({ length: deckSize }, (_, i) => i);
    const shuffleFunction = SHUFFLE_FUNCTION_MAP[shuffleStrat];

    let shuffledDecks = [new ShuffledDeck(baseCardList, [], scoreType)];
    let best = null;

    for (let i = 0; i < maxShuffles; i++) {
        const newDecks = runPerm(shuffledDecks, pileDivisions, shuffleFunction);

        shuffledDecks = [...new Set([...shuffledDecks, ...newDecks])];
        shuffledDecks.sort((a, b) => b.score - a.score);
        
        best = shuffledDecks[0];
    }

    return best;
}

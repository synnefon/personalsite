import { SHUFFLE_FUNCTION_MAP, ShuffledDeck } from 'shufflers';
import { Worker, isMainThread, parentPort } from 'worker_threads';

const MT_CUTOFF = 5000;

function runPermMulti(shuffledDecks, pileDivisions, shuffleFunction) {
    const numThreads = Math.ceil(shuffledDecks.length / MT_CUTOFF);
    const chunks = Array.from({ length: numThreads }, (_, i) => 
        shuffledDecks.slice(i * MT_CUTOFF, (i + 1) * MT_CUTOFF)
    );

    const promises = chunks.map(chunk => 
        new Promise((resolve) => {
            const worker = new Worker(__filename, {
                workerData: { chunk, pileDivisions, shuffleFunction }
            });
            worker.on('message', resolve);
        })
    );

    return Promise.all(promises).then(resultLists => {
        return resultLists.flat();
    });
}

function runPerm(shuffledDecks, pileDivisions, shuffleFunction) {
    if (shuffledDecks.length > MT_CUTOFF) {
        return runPermMulti(shuffledDecks, pileDivisions, shuffleFunction);
    }

    const newDecks = [];
    for (const deck of shuffledDecks) {
        for (const numPiles of pileDivisions) {
            const res = shuffleFunction(deck, numPiles);
            newDecks.push(res);
        }
    }

    return newDecks;
}

async function shuffleDecks(
    shuffleStrat,
    scoreType,
    maxShuffles,
    deckSize,
    minNumPiles,
    maxNumPiles
) {
    const pileDivisions = Array.from({ length: maxNumPiles - minNumPiles + 1 }, (_, i) => i + minNumPiles);
    const baseCardList = Array.from({ length: deckSize }, (_, i) => i);
    const shuffleFunction = SHUFFLE_FUNCTION_MAP[shuffleStrat];

    let shuffledDecks = [new ShuffledDeck(baseCardList, [], scoreType)];
    let best = null;

    for (let i = 0; i < maxShuffles; i++) {
        console.log("ITERATION", i + 1);
        const newDecks = await runPerm(shuffledDecks, pileDivisions, shuffleFunction);

        shuffledDecks = [...new Set([...shuffledDecks, ...newDecks])];
        shuffledDecks.sort((a, b) => b.score - a.score);
        
        best = shuffledDecks[0];
    }

    return best;
}

if (!isMainThread) {
    const { workerData } = require('worker_threads');
    const result = runPerm(workerData.chunk, workerData.pileDivisions, workerData.shuffleFunction);
    parentPort.postMessage(result);
}


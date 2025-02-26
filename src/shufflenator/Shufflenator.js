import { useState } from 'react';
import MultiRangeSlider from "multi-range-slider-react";

import { shuffleDecks } from './ShuffleSimulator';
import { SHUFFLE_STRAT } from './Shuffler';
import { SCORE_TYPE } from './ShuffleScorers';

import '../styles/shufflenator.css'

export default function Shufflenator() {
  const [cardsInDeck, setCardsInDeck] = useState(52);
  const [pileMin, setPileMin] = useState(5);
  const [pileMax, setPileMax] = useState(10);
  const [maxShuffles, setMaxShuffles] = useState(3);
  const [shuffleStrat, setShuffleStrat] = useState("PILE");
  const [scoreType, setScoreType] = useState("SHANNON_ENTROPY");
  const [results, setResults] = useState(null);

  const CardsInDeck = () => {
    return (
      <div className='shufflenator-selector-row'>
        <div className='shufflenator-selector-row-title'>cards in deck:</div>
        <input
          className='shufflenator-selector-row-number'
          type="number"
          value={cardsInDeck}
          step={10}
          min={10}
          max={1_000}
          onChange={e => {
            setCardsInDeck(e.target.value);
            setResults(null);
          }}
        />
      </div>
    );
  }

  const PileSizeRange = () => {
    const MAX_DIF = 10;

    const onChange = e => {
      const goingDown = e.minValue !== pileMin;
      const newMin = goingDown 
        ? e.minValue 
        : Math.max(e.minValue, e.maxValue - MAX_DIF);
      const newMax = goingDown 
        ? Math.min(e.maxValue, e.minValue + MAX_DIF) 
        : e.maxValue;
      if (newMin !== e.minValue || newMax !== e.maxValue) {
        setResults(null);
      }
      setPileMin(newMin);
      setPileMax(newMax);
    };

    return (
      <div className='shufflenator-selector-row'>
        <div className='shufflenator-selector-row-title'>pile size range:</div>
        <MultiRangeSlider
          className='shufflenator-selector-row-slider'
          min={2}
          max={20}
          step={1}
          minValue={pileMin}
          maxValue={pileMax}
          onChange={onChange}
          preventWheel={true}
          stepOnly={true}
          ruler={false}
          label={false}
        />
      </div>
    );
  };

  const Dropdown = ({title, options, value, onChange}) => {
    return (
      <div className='shufflenator-selector-row'>
        <div className='shufflenator-selector-row-title'>{title}:</div>
        <select
          className='shufflenator-selector-row-options'
          value={value}
          onChange={(e) => {
            onChange(e);
            setResults(null);
          }}
        >
          {options.map(o => {
            return (
              <option 
                key={`${title}-${o}`}
                className="shufflenator-selector-row-options-choice"
                value={o}>
                  {o}
              </option>
            );
          })}
        </select>
      </div>
    );
  };

  const MaxShuffles = () => {
    return (
      <Dropdown
        title="max shuffles"
        options={[1, 2, 3, 4, 5]}
        value={maxShuffles}
        onChange={e => setMaxShuffles(e.target.value)}
      />
    );
  };

  const ShuffleStrategy = () => {
    return (
      <Dropdown
        title="shuffle strategy"
        options={SHUFFLE_STRAT}
        value={shuffleStrat}
        onChange={e => setShuffleStrat(e.target.value)}
      />
    );
  }

  const ScoreType = () => {
    return (
      <Dropdown
        title="scorer type"
        options={SCORE_TYPE}
        value={scoreType}
        onChange={e => setScoreType(e.target.value)}
      />
    );
  };
  
  const shuffle = async () => {
    const ret = await shuffleDecks({
      shuffleStrat: shuffleStrat, 
      scoreType: scoreType,
      maxShuffles: maxShuffles,
      deckSize: cardsInDeck,
      minNumPiles: pileMin,
      maxNumPiles: pileMax
    })

    setResults(ret);
  };

  const SubmitButton = () => {
    const cn = "shufflenator-submit-button"
    return <div onClick={shuffle} className={cn}>submit</div>;
  };

  const Results = () => {
    return (
      <div className="shufflenator-results">
        <div>{`( ${results.permutation.join(",")} )`}</div>
      </div>
    );
  }

  return (
    <div className="shufflenator">
      <div className='shufflenator-selector'>
        <CardsInDeck/>
        <PileSizeRange/>
        <MaxShuffles/>
        <ShuffleStrategy/>
        <ScoreType/>
      </div>
      <SubmitButton/>
      {results && <Results/>}
    </div>
  );
};

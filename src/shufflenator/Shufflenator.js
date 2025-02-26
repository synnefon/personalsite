import { useRef, useState } from 'react';
import MultiRangeSlider from "multi-range-slider-react";
import Select from 'react-select'

import { shuffleDecks } from './ShuffleSimulator';
import { SHUFFLE_STRAT } from './Shuffler';
import { SCORE_TYPE } from './ShuffleScorers';

import '../styles/shufflenator.css'

const selectStyles = {
  control: (baseStyles, { isFocused }) => ({
    ...baseStyles,
    backgroundColor: "var(--alt-bg-color)",
    borderColor: isFocused ? 'var(--text-color)' : 'var(--tertiary)',
    cursor: "var(--pointer)",
  }),
  singleValue: (baseStyles) => ({
    ...baseStyles,
    color:'var(--alt-text-color)',
  }),
  option: (baseStyles, { isFocused }) => ({
    ...baseStyles,
    cursor: "var(--pointer)",
    color:'var(--alt-text-color)',
    backgroundColor: isFocused ?  "var(--text-color)" : "var(--alt-bg-color)" ,
  }),
  menu: (baseStyles) => ({
    ...baseStyles,
    backgroundColor: "var(--alt-bg-color)",
  }),
  indicatorSeparator: (baseStyles) => ({...baseStyles, backgroundColor: 'var(--alt-text-color)'})
};

export default function Shufflenator() {
  const cardsInDeck = useRef();
  const [pileMin, setPileMin] = useState(5);
  const [pileMax, setPileMax] = useState(10);
  const [maxShuffles, setMaxShuffles] = useState({value: 3, label: 3});
  const [shuffleStrat, setShuffleStrat] = useState({value: "PILE", label: "PILE"});
  const [scoreType, setScoreType] = useState({value: "SHANNON_ENTROPY", label: "SHANNON_ENTROPY"});
  const [results, setResults] = useState(null);

  const CardsInDeck = () => {
    return (
      <div className='shufflenator-selector-row'>
        <div className='shufflenator-selector-row-title'>cards in deck:</div>
        <input
          className='shufflenator-selector-row-number'
          type="number"
          ref={cardsInDeck}
          defaultValue={52}
          step={10}
          min={10}
          max={1_000}
        />
      </div>
    );
  };
  const cardsInDeckInput = useRef(<CardsInDeck/>);

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

  const Dropdown = ({title, options, value, defaultValue, onChange}) => {
    options = options.map(o => {
      return {value: o, label: o};
    });
    return (
      <div className='shufflenator-selector-row'>
        <div className='shufflenator-selector-row-title'>{title}:</div>
        <Select
          value={value}
          defaultValue={defaultValue}
          options={options}
          onChange={onChange}
          isSearchable={false}
          styles={selectStyles}
        />
      </div>
    );
  };

  const MaxShuffles = () => {
    return (
      <Dropdown
        title="max shuffles"
        options={[1, 2, 3, 4, 5]}
        value={maxShuffles}
        defaultValue={3}
        onChange={setMaxShuffles}
      />
    );
  };

  const ShuffleStrategy = () => {
    return (
      <Dropdown
        title="shuffle strategy"
        options={SHUFFLE_STRAT}
        value={shuffleStrat}
        defaultValue={"PILE"}
        onChange={setShuffleStrat}
      />
    );
  }

  const ScoreType = () => {
    return (
      <Dropdown
        title="score strategy"
        options={SCORE_TYPE}
        value={scoreType}
        defaultValue={"SHANNON_ENTROPY"}
        onChange={setScoreType}
      />
    );
  };
  
  const shuffle = async () => {
    const ret = await shuffleDecks({
      shuffleStrat: shuffleStrat.value, 
      scoreType: scoreType.value,
      maxShuffles: maxShuffles.value,
      deckSize: cardsInDeck.current.value,
      minNumPiles: pileMin,
      maxNumPiles: pileMax
    })
    setResults(ret);
  };

  const SubmitButton = () => {
    return <div onClick={shuffle} className="shufflenator-submit-button">
      <div className="shufflenator-submit-button-text">submit</div>
    </div>;
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
        {cardsInDeckInput.current}
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

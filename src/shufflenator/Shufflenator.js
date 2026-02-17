import MultiRangeSlider from "multi-range-slider-react";
import { useEffect, useRef, useState } from "react";
import Select from "react-select";

import { SCORE_TYPE } from "./ShuffleScorers";

import "../styles/shufflenator.css";

const selectStyles = {
  control: (baseStyles, { isFocused }) => ({
    ...baseStyles,
    backgroundColor: "var(--alt-bg-color)",
    borderColor: isFocused ? "var(--text-color)" : "var(--tertiary)",
    cursor: "var(--pointer)",
  }),
  singleValue: (baseStyles) => ({
    ...baseStyles,
    color: "var(--alt-text-color)",
  }),
  option: (baseStyles, { isFocused, isSelected }) => ({
    ...baseStyles,
    cursor: "var(--pointer)",
    color: isSelected ? "var(--bg-color)" : "var(--alt-text-color)",
    backgroundColor: isSelected
      ? "var(--tertiary)"
      : isFocused
        ? "var(--text-color)"
        : "var(--alt-bg-color)",
    fontWeight: isSelected ? "bold" : "normal",
  }),
  menu: (baseStyles) => ({
    ...baseStyles,
    backgroundColor: "var(--alt-bg-color)",
  }),
  indicatorSeparator: (baseStyles) => ({
    ...baseStyles,
    backgroundColor: "var(--alt-text-color)",
  }),
};

export default function Shufflenator() {
  const cardsInDeck = useRef();
  const workerRef = useRef(null);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const [pileMin, setPileMin] = useState(5);
  const [pileMax, setPileMax] = useState(10);
  const [maxShuffles, setMaxShuffles] = useState({ value: 3, label: 3 });
  const [shuffleStrat] = useState({ value: "PILE", label: "PILE" });
  const [scoreType, setScoreType] = useState({
    value: "SHANNON_ENTROPY",
    label: "SHANNON_ENTROPY",
  });
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showExplainer, setShowExplainer] = useState(false);

  const CardsInDeck = () => {
    return (
      <div className="shufflenator-selector-row">
        <div className="shufflenator-selector-row-title">cards in deck:</div>
        <input
          className="shufflenator-selector-row-number"
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
  const cardsInDeckInput = useRef(<CardsInDeck />);

  const onPileRangeChange = (e) => {
    setPileMin(e.minValue);
    setPileMax(e.maxValue);
  };

  const Dropdown = ({ title, options, value, defaultValue, onChange }) => {
    options = options.map((o) => {
      return { value: o, label: o };
    });
    return (
      <div className="shufflenator-selector-row">
        <div className="shufflenator-selector-row-title">{title}:</div>
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

  // const ShuffleStrategy = () => {
  //   return (
  //     <Dropdown
  //       title="shuffle strategy"
  //       options={SHUFFLE_STRAT}
  //       value={shuffleStrat}
  //       defaultValue={"PILE"}
  //       onChange={setShuffleStrat}
  //     />
  //   );
  // }

  // const ScoreType = () => {
  //   return (
  //     <Dropdown
  //       title="score strategy"
  //       options={SCORE_TYPE}
  //       value={scoreType}
  //       defaultValue={"SHANNON_ENTROPY"}
  //       onChange={setScoreType}
  //     />
  //   );
  // };

  const shuffle = () => {
    workerRef.current?.terminate();
    setResults(null);
    setLoading(true);
    const worker = new Worker(new URL("./shuffleWorker.js", import.meta.url));
    workerRef.current = worker;
    worker.postMessage({
      shuffleStrat: shuffleStrat.value,
      scoreType: scoreType.value,
      maxShuffles: maxShuffles.value,
      deckSize: cardsInDeck.current.value,
      minNumPiles: pileMin,
      maxNumPiles: pileMax,
    });
    worker.onmessage = (e) => {
      setResults(e.data);
      setLoading(false);
      workerRef.current = null;
    };
  };

  const SubmitButton = () => {
    if (loading) return <div className="shufflenator-spinner" />;
    return (
      <div onClick={shuffle} className="shufflenator-submit-button">
        <div className="shufflenator-submit-button-text">submit</div>
      </div>
    );
  };

  const Results = () => {
    return (
      <div className="shufflenator-results">
        <span className="shufflenator-results-number">optimal sequence:</span>
        {results.permutation.map((n, i) => (
          <div key={i}>
            &nbsp;&nbsp;{i + 1}. cyclically deal into{" "}
            <span className="shufflenator-results-number">{n}</span> piles.
          </div>
        ))}
        <br />
        <div className="shufflenator-results-note">
          * after each step, reassemble piles in order.
        </div>
      </div>
    );
  };

  return (
    <div className="shufflenator">
      <div className="shufflenator-header">
        <h1 className="shufflenator-title">shufflenator</h1>
        <button
          className="shufflenator-help-button"
          onClick={() => setShowExplainer(true)}
        >
          ?
        </button>
      </div>

      {showExplainer && (
        <div
          className="shufflenator-modal-overlay"
          onClick={() => setShowExplainer(false)}
        >
          <div
            className="shufflenator-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="shufflenator-modal-close"
              onClick={() => setShowExplainer(false)}
            >
              ×
            </button>
            <div className="shufflenator-explainer">
              <h2>how it works</h2>
              <p>
                this tool calculates the best pile shuffle pattern for
                thoroughly randomizing a deck of cards. pile shuffling alone
                doesn't randomize—it performs a deterministic permutation. but
                the right sequence of pile shuffles can spread cards maximally
                before you do your riffle shuffles.
              </p>
              <p>
                configure your deck size, pile size range, and how many shuffles
                you want to perform. the calculator will find the permutation
                that maximizes shannon entropy (randomness) given your
                constraints.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="shufflenator-selector">
        {cardsInDeckInput.current}
        <div className="shufflenator-selector-row">
          <div className="shufflenator-selector-row-title">
            pile size range:
          </div>
          <MultiRangeSlider
            className="shufflenator-selector-row-slider"
            min={2}
            max={20}
            step={1}
            minValue={pileMin}
            maxValue={pileMax}
            onChange={onPileRangeChange}
            preventWheel={true}
            stepOnly={false}
            ruler={false}
            label={false}
          />
        </div>
        <MaxShuffles />
        {/* <ShuffleStrategy/> */}
        {/* <ScoreType/> */}
      </div>
      <SubmitButton />
      {results && <Results />}
    </div>
  );
}

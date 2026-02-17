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
      clearTimeout(progressTimerRef.current);
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
  const [showProgress, setShowProgress] = useState(false);
  const [rounds, setRounds] = useState([]);
  const progressTimerRef = useRef(null);
  const [showExplainer, setShowExplainer] = useState(false);

  const CardsInDeck = () => {
    return (
      <div className="shufflenator-selector-row">
        <div className="shufflenator-selector-row-title">cards in deck:</div>
        <input
          className="shufflenator-selector-row-number"
          type="number"
          ref={cardsInDeck}
          defaultValue={100}
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
        title="max rounds"
        options={[1, 2, 3, 4, 5, 6, 7]}
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
    clearTimeout(progressTimerRef.current);
    setResults(null);
    setLoading(true);
    setShowProgress(false);
    const numRounds = maxShuffles.value;
    setRounds(Array.from({ length: numRounds }, () => ({ completed: 0, total: 1 })));
    progressTimerRef.current = setTimeout(() => setShowProgress(true), 1000);

    const worker = new Worker(new URL("./shuffleWorker.js", import.meta.url));
    workerRef.current = worker;
    worker.postMessage({
      shuffleStrat: shuffleStrat.value,
      scoreType: scoreType.value,
      maxShuffles: numRounds,
      deckSize: Number(cardsInDeck.current.value),
      minNumPiles: pileMin,
      maxNumPiles: pileMax,
    });
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        setRounds((prev) => {
          const next = [...prev];
          next[msg.round - 1] = { completed: msg.completed, total: msg.total };
          return next;
        });
      } else {
        clearTimeout(progressTimerRef.current);
        setResults(msg.data);
        setLoading(false);
        setShowProgress(false);
        setRounds([]);
        workerRef.current = null;
      }
    };
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
      <div onClick={loading ? undefined : shuffle} className={`shufflenator-submit-button${loading ? ' disabled' : ''}`}>
        <div className="shufflenator-submit-button-text">submit</div>
      </div>
      {showProgress && (
        <div className="shufflenator-rounds">
          {rounds.map((round, i) => (
            <div key={i} className="shufflenator-round">
              <span className="shufflenator-round-label">round {i + 1}</span>
              <div className="shufflenator-progress">
                <div className="shufflenator-progress-bar" style={{ width: `${(round.completed / round.total) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {results && <Results />}
    </div>
  );
}

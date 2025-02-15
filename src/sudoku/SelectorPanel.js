export default function SelectorPanel ({allNums, valCounts, selectedVal, onSelectorClick}) {
  return (
    <div className='sudoku-selector-panel'>
      {allNums.map(n => {
        return valCounts[n-1] === 9 
        ? <div key={`selector-empty-${n}`} className="sudoku-selection empty"/> 
        : <div
          key={`selector-${n}`}
          className={`sudoku-selection${selectedVal === n ? ' selected' : ''}`}
          onClick={() => onSelectorClick(n)}
        >
          {n}
        </div>
      })}
    </div>
  );
};

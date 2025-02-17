const noteSubCell = (cell, highlightCell, selectedVal, n) => {
  const key = `${cell.ridx}-${cell.cidx}-${n}`;
  const shouldHighlightText = n === (highlightCell?.val ? highlightCell.val : selectedVal);
  return <div key={key} className={`note-sub-cell ${shouldHighlightText && "text-highlight"}`}>
    {<div className={`${cell.notes.includes(n) && cell.val === "." ? "" : "invisible-num"}`}>{n}</div>}
  </div>;
};

const DisplayableCell = ({cell, highlightCell, selectedVal}) => {
  if (cell.val !== ".") return <div>{cell.val}</div>;
  return <div className='note-cell'>
    <div className='note-row'>{["1", "2", "3"].map(n => noteSubCell(cell, highlightCell, selectedVal, n))}</div>
    <div className='note-row'>{["4", "5", "6"].map(n => noteSubCell(cell, highlightCell, selectedVal, n))}</div>
    <div className='note-row'>{["7", "8", "9"].map(n => noteSubCell(cell, highlightCell, selectedVal, n))}</div>
  </div>;
};

export default function DisplayableBoard ({board, highlightCell, onBoardClick, selectedVal}) {
  return (
    <div className='sudoku-board'>
      {board.map((row, ridx) => {
        return (
          <div key={ridx} className='sudoku-row'>
            {row.map((cell, cidx) => {
              const shouldHighlightText = 
                cell.color !== "incorrect"
                && cell.val === (highlightCell?.val ? highlightCell.val : selectedVal);
              const color = `
                ${cell.color ? cell.color : "inherit"}
                ${cell.highlightColor ? " " + cell.highlightColor : ""}
                ${shouldHighlightText ? " text-highlight" : ""}
              `;
              return <div
                key={`${ridx}-${cidx}`}
                className={`sudoku-cell ${color} r${ridx} c${cidx}`}
                onClick={() => onBoardClick(ridx, cidx)}
              >
                <DisplayableCell cell={cell} highlightCell={highlightCell} selectedVal={selectedVal}/>
              </div>
            })}
          </div>
        );
      })}
    </div>
  );
};

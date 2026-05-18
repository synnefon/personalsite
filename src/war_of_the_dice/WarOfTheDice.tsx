import React, { useState, type ReactElement } from "react";
import MapView from "./MapView.tsx";
import { generateMap } from "./mapGenerator.ts";
import type { GameMap } from "./types.ts";

import "../styles/warofthedice.css";

export default function WarOfTheDice(): ReactElement {
  const [map, setMap] = useState<GameMap>(() => generateMap());
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<number | null>(
    null
  );

  const regenerate = (): void => {
    setMap(generateMap());
    setSelectedTerritoryId(null);
  };

  const handleTerritoryClick = (territoryId: number): void => {
    setSelectedTerritoryId((current) =>
      current === territoryId ? null : territoryId
    );
  };

  return (
    <div className="wotd-container">
      <div className="wotd-header">
        <h2 className="wotd-title">war of the dice</h2>
        <button
          className="wotd-regen"
          onClick={regenerate}
          title="regenerate map"
        >
          ↻
        </button>
      </div>
      <div className="wotd-map-wrapper">
        <MapView
          map={map}
          selectedTerritoryId={selectedTerritoryId}
          onTerritoryClick={handleTerritoryClick}
          onBackgroundClick={() => setSelectedTerritoryId(null)}
        />
      </div>
    </div>
  );
}

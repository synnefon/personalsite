import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import MapView from "./MapView.tsx";
import {
  makePersonality,
  selectBestAttack,
  type AIPersonality,
} from "./ai.ts";
import { canAttack, resolveAttack } from "./combat.ts";
import { NUM_PLAYERS, PLAYER_COLORS, USER_PLAYER_ID } from "./constants.ts";
import {
  largestComponent,
  playerIsEliminated,
  soleSurvivor,
} from "./gameLogic.ts";
import { generateMap } from "./mapGenerator.ts";
import { reinforcePlayer } from "./reinforcement.ts";
import type { GameMap } from "./types.ts";

import "../styles/warofthedice.css";

// AI attack visualization timing. Each move walks through three phases so
// the user can follow what the AI is doing:
//   1. source highlighted only
//   2. source + target highlighted
//   3. captured cell highlighted on win — or just a pause on loss, same
//      duration either way
const AI_DECIDE_MS = 220;
const PHASE_1_MS = 380;
const PHASE_2_MS = 480;
const PHASE_3_MS = 380;

type AIAction = {
  sourceId: number;
  targetId: number | null;
};

type PlayerStat = {
  playerId: number;
  largest: number;
  territories: number;
};

// Turn order is a Fisher–Yates shuffle of the player/color list. Nothing
// else — the user might end up anywhere in the sequence. Each turn advances
// one slot; once we wrap past the end we loop back to index 0.
function makeTurnOrder(rng: () => number): number[] {
  const order: number[] = [];
  for (let i = 0; i < NUM_PLAYERS; i++) order.push(i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  return order;
}

function computeStats(map: GameMap): PlayerStat[] {
  const territoryCounts = new Array<number>(NUM_PLAYERS).fill(0);
  for (const t of map.territories) territoryCounts[t.ownerId]++;
  const stats: PlayerStat[] = [];
  for (let i = 0; i < NUM_PLAYERS; i++) {
    stats.push({
      playerId: i,
      largest: largestComponent(map, i),
      territories: territoryCounts[i],
    });
  }
  return stats;
}

export default function WarOfTheDice(): ReactElement {
  const [map, setMap] = useState<GameMap>(() => generateMap());
  const [turnOrder, setTurnOrder] = useState<number[]>(() =>
    makeTurnOrder(Math.random)
  );
  const [currentTurnIdx, setCurrentTurnIdx] = useState<number>(0);
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<number | null>(
    null
  );
  const [bankedDice, setBankedDice] = useState<number[]>(() =>
    new Array(NUM_PLAYERS).fill(0)
  );
  const [personalities, setPersonalities] = useState<AIPersonality[]>(() =>
    Array.from({ length: NUM_PLAYERS }, () => makePersonality(Math.random))
  );
  const [aiAction, setAiAction] = useState<AIAction | null>(null);

  const stats = useMemo(() => computeStats(map), [map]);
  const winnerId = useMemo(() => soleSurvivor(map), [map]);
  const currentActor = turnOrder[currentTurnIdx];
  const isGameOver = winnerId !== null;
  const isPlayerTurn = !isGameOver && currentActor === USER_PLAYER_ID;
  const isAITurn = !isGameOver && currentActor !== USER_PLAYER_ID;

  // The set of territories that should show the white selection outline:
  // the user's currently-picked-up source, plus whatever the AI is currently
  // flashing (source only, source+target, or the captured cell).
  const highlightedIds = useMemo(() => {
    const ids: number[] = [];
    if (selectedTerritoryId !== null) ids.push(selectedTerritoryId);
    if (aiAction !== null) {
      ids.push(aiAction.sourceId);
      if (aiAction.targetId !== null) ids.push(aiAction.targetId);
    }
    return ids;
  }, [selectedTerritoryId, aiAction]);

  // Keep a ref of the latest map so the AI scheduler can read fresh state
  // mid-chain without needing `map` in its deps (a map change mid-attack
  // would otherwise tear the animation chain down).
  const mapRef = useRef(map);
  useEffect(() => {
    mapRef.current = map;
  }, [map]);

  // End the current actor's turn: reinforce them (one die per territory in
  // their largest connected cluster, scattered across ALL their territories)
  // and advance to the next non-eliminated player. Overflow dice (when every
  // territory is at the cap) carry forward in the per-player bank.
  const advanceTurn = (currentMap: GameMap, fromIdx: number): void => {
    const actor = turnOrder[fromIdx];
    const { map: reinforced, bank: newBank } = reinforcePlayer(
      currentMap,
      actor,
      bankedDice[actor]
    );

    let nextIdx = (fromIdx + 1) % turnOrder.length;
    let safety = turnOrder.length;
    while (
      playerIsEliminated(reinforced, turnOrder[nextIdx]) &&
      safety-- > 0
    ) {
      nextIdx = (nextIdx + 1) % turnOrder.length;
    }

    setMap(reinforced);
    setBankedDice((prev) => {
      const next = prev.slice();
      next[actor] = newBank;
      return next;
    });
    setCurrentTurnIdx(nextIdx);
  };

  // AI scheduler. Runs once when the active actor becomes an AI; chains its
  // moves via timeouts (map is read from a ref, not from deps, so a
  // mid-attack setMap doesn't tear the chain down). Each move plays four
  // beats: source-only highlight → both highlighted → resolve + show result
  // (captured cell on win, blank pause on loss) → loop into the next move.
  // The effect re-runs when the actor changes (advanceTurn was called).
  useEffect(() => {
    if (!isAITurn) {
      setAiAction(null);
      return;
    }
    let cancelled = false;
    const timeouts: number[] = [];
    const wait = (ms: number, fn: () => void): void => {
      const id = window.setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timeouts.push(id);
    };

    const playOneMove = (): void => {
      if (cancelled) return;
      const move = selectBestAttack(
        mapRef.current,
        currentActor,
        personalities[currentActor]
      );
      if (!move) {
        advanceTurn(mapRef.current, currentTurnIdx);
        return;
      }
      // Phase 1: source only.
      setAiAction({ sourceId: move.sourceId, targetId: null });
      wait(PHASE_1_MS, () => {
        // Phase 2: source + target.
        setAiAction({ sourceId: move.sourceId, targetId: move.targetId });
        wait(PHASE_2_MS, () => {
          const result = resolveAttack(
            mapRef.current,
            move.sourceId,
            move.targetId
          );
          setMap(result.map);
          // Phase 3: captured cell only if the attacker won, blank
          // otherwise — durations match so loss and win take the same time.
          if (result.outcome.attackerWon) {
            setAiAction({ sourceId: move.targetId, targetId: null });
          } else {
            setAiAction(null);
          }
          wait(PHASE_3_MS, () => {
            setAiAction(null);
            playOneMove();
          });
        });
      });
    };

    wait(AI_DECIDE_MS, playOneMove);

    return () => {
      cancelled = true;
      for (const t of timeouts) window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAITurn, currentActor, currentTurnIdx]);

  const regenerate = (): void => {
    setMap(generateMap());
    setTurnOrder(makeTurnOrder(Math.random));
    setCurrentTurnIdx(0);
    setSelectedTerritoryId(null);
    setBankedDice(new Array(NUM_PLAYERS).fill(0));
    setPersonalities(
      Array.from({ length: NUM_PLAYERS }, () => makePersonality(Math.random))
    );
    setAiAction(null);
  };

  const endTurn = (): void => {
    if (!isPlayerTurn) return;
    setSelectedTerritoryId(null);
    advanceTurn(map, currentTurnIdx);
  };

  const handleTerritoryClick = (territoryId: number): void => {
    if (!isPlayerTurn) return;
    const clicked = map.territories[territoryId];
    if (!clicked) return;

    if (selectedTerritoryId === null) {
      if (clicked.ownerId === USER_PLAYER_ID && clicked.dice >= 2) {
        setSelectedTerritoryId(territoryId);
      }
      return;
    }

    if (selectedTerritoryId === territoryId) {
      setSelectedTerritoryId(null);
      return;
    }

    if (clicked.ownerId === USER_PLAYER_ID) {
      setSelectedTerritoryId(clicked.dice >= 2 ? territoryId : null);
      return;
    }

    if (canAttack(map, selectedTerritoryId, territoryId)) {
      const { map: nextMap } = resolveAttack(
        map,
        selectedTerritoryId,
        territoryId
      );
      setMap(nextMap);
    }
    setSelectedTerritoryId(null);
  };

  const statusText: ReactElement | string = (() => {
    if (isGameOver) {
      if (winnerId === USER_PLAYER_ID) return "you win!";
      if (winnerId !== null) return "you lose";
      return "game over";
    }
    if (isAITurn) {
      return (
        <span style={{ color: PLAYER_COLORS[currentActor] }}>thinking…</span>
      );
    }
    return "your move";
  })();

  return (
    <div className="wotd-container">
      <div className="wotd-header">
        <h2 className="wotd-title">war of the dice</h2>
        <button
          className="wotd-regen"
          onClick={regenerate}
          title="new game"
        >
          ↻
        </button>
      </div>
      <div className="wotd-body">
        <aside className="wotd-sidebar">
          <div className="wotd-scores">
            {turnOrder
              .map((id) => stats[id])
              .filter((s) => s.territories > 0)
              .map((s) => {
                const classes = [
                  "wotd-score",
                  s.playerId === USER_PLAYER_ID ? "you" : "",
                  s.playerId === currentActor && !isGameOver ? "active" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <div key={s.playerId} className={classes}>
                    <span
                      className="wotd-swatch"
                      style={{ backgroundColor: PLAYER_COLORS[s.playerId] }}
                    />
                    <span className="wotd-score-dice">{s.largest}</span>
                  </div>
                );
              })}
          </div>
          <button
            className="wotd-end-turn"
            disabled={!isPlayerTurn}
            onClick={endTurn}
          >
            end turn
          </button>
          <div className="wotd-status">{statusText}</div>
        </aside>
        <div className="wotd-map-wrapper">
          <MapView
            map={map}
            highlightedTerritoryIds={highlightedIds}
            onTerritoryClick={handleTerritoryClick}
            onBackgroundClick={() => setSelectedTerritoryId(null)}
          />
        </div>
      </div>
    </div>
  );
}

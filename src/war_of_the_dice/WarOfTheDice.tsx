import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import MapView from "./MapView.tsx";
import {
  bucketKnob,
  makePersonality,
  selectBestAttack,
  type AIPersonality,
} from "./ai.ts";
import { canAttack, resolveAttack, type AttackOutcome } from "./combat.ts";
import {
  NUM_PLAYERS,
  PLAYER_COLORS,
  USER_PLAYER_ID,
} from "./constants.ts";
import {
  largestComponent,
  playerIsEliminated,
  soleSurvivor,
} from "./gameLogic.ts";
import { generateMap } from "./mapGenerator.ts";
import { selectBestAttackBaked } from "./model/bakedAI.ts";
import { reinforcePlayer } from "./reinforcement.ts";
import type { GameMap } from "./types.ts";

import "../styles/warofthedice.css";

// Flip to `false` to fall back to the linear personality-driven AI.
const USE_NN_AI = true;

// Attack visualization timing. Both AI moves and player attacks walk the
// same four-phase sequence so the user can follow each step:
//   1. source highlighted only (AI-only; player already did this manually
//      by selecting the source)
//   2. source + target highlighted, no numbers yet
//   3. dice numbers stack into view, source + target still highlighted
//   4. result applied: captured cell highlighted on win, blank on loss
const AI_DECIDE_MS = 286;
const PHASE_1_MS = 494;
const PHASE_2_MS = 624;
const PHASE_4_MS = 494;

// Dice-stack timings live here too so the AI scheduler can hold phase 3 open
// until the stack animation finishes (see playOneMove). Keep these in sync
// with the .wotd-battle-die / .wotd-battle-total CSS animation duration.
const STACK_STAGGER_MS = 120;
const DIE_ANIM_MS = 360;

type AIAction = {
  sourceId: number;
  targetId: number | null;
};

type BattleDisplay = {
  attackerId: number;
  defenderId: number;
  attackerRolls: number[];
  defenderRolls: number[];
  attackerSum: number;
  defenderSum: number;
  attackerWon: boolean;
  key: number;
};

type PlayerStat = {
  playerId: number;
  largest: number;
  territories: number;
};

/**
 * Turn order is a Fisher–Yates shuffle of the player list. The user might
 * land anywhere in the sequence; each turn advances one slot, wrapping at
 * the end.
 */
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

/** Per-player sidebar stats: largest connected component and total territories owned. */
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

/**
 * Total time for a battle dice stack to fully resolve: the sum (last item)
 * starts at rollCount * STACK_STAGGER_MS and runs DIE_ANIM_MS long.
 */
function stackDurationMs(rollCount: number): number {
  return rollCount * STACK_STAGGER_MS + DIE_ANIM_MS;
}

/** One side of the battle pane: animated dice stack and animated total. */
function BattleSide({
  color,
  rolls,
  sum,
  won,
  side,
  totalDelayMs,
}: {
  color: string;
  rolls: ReadonlyArray<number>;
  sum: number;
  won: boolean;
  side: "left" | "right";
  totalDelayMs: number;
}): ReactElement {
  return (
    <div className={`wotd-battle-side ${side}`} style={{ color }}>
      <div className="wotd-battle-rolls">
        {rolls.map((r, i) => (
          <span
            key={i}
            className="wotd-battle-die"
            style={{ animationDelay: `${i * STACK_STAGGER_MS}ms` }}
          >
            {r}
          </span>
        ))}
      </div>
      <div
        className={`wotd-battle-total ${won ? "win" : "loss"}`}
        style={{ animationDelay: `${totalDelayMs}ms` }}
      >
        {sum}
      </div>
    </div>
  );
}

/**
 * Top-level component for the war-of-the-dice game: owns all game state
 * (map, turn order, banks, personalities), runs the AI scheduler, handles
 * player input, and renders the map, sidebar, and battle pane.
 */
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
  const [lastBattle, setLastBattle] = useState<BattleDisplay | null>(null);
  const [isRegenSpinning, setIsRegenSpinning] = useState<boolean>(false);
  const [attackInProgress, setAttackInProgress] = useState<boolean>(false);
  const [round, setRound] = useState<number>(0);
  const battleKeyRef = useRef(0);
  const playerTimeoutsRef = useRef<number[]>([]);
  const roundRef = useRef<number>(0);
  useEffect(() => {
    roundRef.current = round;
  }, [round]);

  /** Cancel any scheduled timeouts from the player's in-progress attack chain. */
  const cancelPlayerAttack = (): void => {
    for (const t of playerTimeoutsRef.current) window.clearTimeout(t);
    playerTimeoutsRef.current = [];
  };

  /** Schedule a timeout for the player attack chain so it can be cleared on reset. */
  const schedulePlayerWait = (ms: number, fn: () => void): void => {
    const id = window.setTimeout(() => {
      playerTimeoutsRef.current = playerTimeoutsRef.current.filter(
        (x) => x !== id
      );
      fn();
    }, ms);
    playerTimeoutsRef.current.push(id);
  };

  /** Stash the most-recent attack outcome so the battle pane can animate it. */
  const recordBattle = (
    attackerId: number,
    defenderId: number,
    outcome: AttackOutcome
  ): void => {
    battleKeyRef.current += 1;
    setLastBattle({
      attackerId,
      defenderId,
      attackerRolls: outcome.attackerRolls,
      defenderRolls: outcome.defenderRolls,
      attackerSum: outcome.attackerSum,
      defenderSum: outcome.defenderSum,
      attackerWon: outcome.attackerWon,
      key: battleKeyRef.current,
    });
  };

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

  // Log each game's AI personalities so the player can see what they're up
  // against. A field-description table comes first as a legend, then the
  // per-AI values keyed by color name. Fires on initial mount and every new
  // game.
  useEffect(() => {
    const fieldDescriptions: Record<string, string> = {
      confidence: "trusts its dice-odds heavily",
      expansion: "values growing its own cluster",
      disruption: "loves carving up opponents",
      caution: "avoids ending up exposed",
      pickiness: "passes on marginal attacks",
      predation: "HIGH preys on the weak; LOW targets the strong",
    };
    const rows: Record<string, Record<string, string>> = {};
    personalities.forEach((p, i) => {
      if (i === USER_PLAYER_ID) return;
      rows[PLAYER_COLORS[i].name] = {
        confidence: bucketKnob(p.confidence),
        expansion: bucketKnob(p.expansion),
        disruption: bucketKnob(p.disruption),
        caution: bucketKnob(p.caution),
        pickiness: bucketKnob(p.pickiness),
        predation: bucketKnob(p.predation),
      };
    });
    /* eslint-disable no-console */
    console.table(fieldDescriptions);
    console.table(rows);
    /* eslint-enable no-console */
  }, [personalities]);

  /**
   * End the current actor's turn: reinforce them (one die per territory in
   * their largest connected cluster, scattered across ALL their territories)
   * and advance to the next non-eliminated player. Overflow dice (every
   * territory at cap) carry forward in the per-player bank.
   */
  const advanceTurn = (currentMap: GameMap, fromIdx: number): void => {
    const actor = turnOrder[fromIdx];
    const { map: reinforced, bank: newBank } = reinforcePlayer(
      currentMap,
      actor,
      bankedDice[actor]
    );

    let nextIdx = (fromIdx + 1) % turnOrder.length;
    let wrapped = nextIdx === 0;
    let safety = turnOrder.length;
    while (
      playerIsEliminated(reinforced, turnOrder[nextIdx]) &&
      safety-- > 0
    ) {
      nextIdx = (nextIdx + 1) % turnOrder.length;
      if (nextIdx === 0) wrapped = true;
    }

    setMap(reinforced);
    setBankedDice((prev) => {
      const next = prev.slice();
      next[actor] = newBank;
      return next;
    });
    setCurrentTurnIdx(nextIdx);
    if (wrapped) setRound((r) => r + 1);
  };

  /**
   * Run phases 2–4 of an attack. Phase 1 (source-only highlight) is the
   * caller's responsibility — for the player it's the manual selection
   * step, for the AI it's an explicit setAiAction in the scheduler before
   * calling this. Reads mapRef so the AI chain can keep firing without
   * mid-chain renders tearing down the closure.
   */
  const runAttackFromPhase2 = (
    actorId: number,
    sourceId: number,
    targetId: number,
    scheduleWait: (ms: number, fn: () => void) => void,
    onDone: () => void
  ): void => {
    setAiAction({ sourceId, targetId });
    scheduleWait(PHASE_2_MS, () => {
      const defenderId = mapRef.current.territories[targetId].ownerId;
      const result = resolveAttack(mapRef.current, sourceId, targetId);
      recordBattle(actorId, defenderId, result.outcome);
      const maxRolls = Math.max(
        result.outcome.attackerRolls.length,
        result.outcome.defenderRolls.length
      );
      scheduleWait(stackDurationMs(maxRolls), () => {
        setMap(result.map);
        if (result.outcome.attackerWon) {
          setAiAction({ sourceId: targetId, targetId: null });
        } else {
          setAiAction(null);
        }
        scheduleWait(PHASE_4_MS, () => {
          setAiAction(null);
          onDone();
        });
      });
    });
  };

  // AI scheduler. Runs once when the active actor becomes an AI; chains its
  // moves via timeouts (map is read from a ref, not from deps, so a
  // mid-attack setMap doesn't tear the chain down). Each move walks the
  // four phases described above and then loops into the next move.
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
      const move = USE_NN_AI
        ? selectBestAttackBaked(mapRef.current, currentActor, roundRef.current)
        : selectBestAttack(
            mapRef.current,
            currentActor,
            personalities[currentActor],
          );
      if (!move) {
        advanceTurn(mapRef.current, currentTurnIdx);
        return;
      }
      // Phase 1: source only.
      setAiAction({ sourceId: move.sourceId, targetId: null });
      wait(PHASE_1_MS, () => {
        runAttackFromPhase2(
          currentActor,
          move.sourceId,
          move.targetId,
          wait,
          playOneMove
        );
      });
    };

    wait(AI_DECIDE_MS, playOneMove);

    return () => {
      cancelled = true;
      for (const t of timeouts) window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAITurn, currentActor, currentTurnIdx]);

  /** Reset everything for a fresh game: new map, turn order, personalities, banks. */
  const regenerate = (): void => {
    cancelPlayerAttack();
    setAttackInProgress(false);
    setMap(generateMap());
    setTurnOrder(makeTurnOrder(Math.random));
    setCurrentTurnIdx(0);
    setSelectedTerritoryId(null);
    setBankedDice(new Array(NUM_PLAYERS).fill(0));
    setPersonalities(
      Array.from({ length: NUM_PLAYERS }, () => makePersonality(Math.random))
    );
    setAiAction(null);
    setLastBattle(null);
    setRound(0);
  };

  /** Player clicks "end turn" — reinforce and advance, ignored while an attack is mid-animation. */
  const endTurn = (): void => {
    if (!isPlayerTurn || attackInProgress) return;
    setSelectedTerritoryId(null);
    advanceTurn(map, currentTurnIdx);
  };

  /**
   * Player clicked a territory. If no source is selected, pick one of theirs
   * with >= 2 dice. If a source is selected, try to attack (enemy + adjacent)
   * or switch source (another of theirs). Click-on-self deselects.
   */
  const handleTerritoryClick = (territoryId: number): void => {
    if (!isPlayerTurn) return;
    if (attackInProgress) return;
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
      const source = selectedTerritoryId;
      setSelectedTerritoryId(null);
      setAttackInProgress(true);
      runAttackFromPhase2(
        USER_PLAYER_ID,
        source,
        territoryId,
        schedulePlayerWait,
        () => setAttackInProgress(false)
      );
      return;
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
        <span style={{ color: PLAYER_COLORS[currentActor].hex }}>
          thinking…
        </span>
      );
    }
    return "your move";
  })();

  return (
    <div className="wotd-container">
      <div className="wotd-header">
        <h2 className="wotd-title">war of the dice</h2>
        <button
          className={`wotd-regen${isRegenSpinning ? " spinning" : ""}`}
          onClick={() => {
            setIsRegenSpinning(true);
            regenerate();
          }}
          onAnimationEnd={() => setIsRegenSpinning(false)}
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
                      style={{
                        backgroundColor: PLAYER_COLORS[s.playerId].hex,
                      }}
                    />
                    <span className="wotd-score-dice">{s.largest}</span>
                    <span className="wotd-score-bank">
                      ({bankedDice[s.playerId]})
                    </span>
                  </div>
                );
              })}
          </div>
          <button
            className="wotd-end-turn"
            disabled={!isPlayerTurn || attackInProgress}
            onClick={endTurn}
          >
            end turn
          </button>
          <div className="wotd-status">{statusText}</div>
        </aside>
        <div className="wotd-map-column">
          <div className="wotd-map-wrapper">
            <MapView
              map={map}
              highlightedTerritoryIds={highlightedIds}
              onTerritoryClick={handleTerritoryClick}
              onBackgroundClick={() => setSelectedTerritoryId(null)}
            />
          </div>
          <div className="wotd-battle-row">
            <div className="wotd-battle-pane left">
              {lastBattle && (
                <div key={`l-${lastBattle.key}`}>
                  <BattleSide
                    color={PLAYER_COLORS[lastBattle.attackerId].hex}
                    rolls={lastBattle.attackerRolls}
                    sum={lastBattle.attackerSum}
                    won={lastBattle.attackerWon}
                    side="left"
                    totalDelayMs={
                      Math.max(
                        lastBattle.attackerRolls.length,
                        lastBattle.defenderRolls.length
                      ) * STACK_STAGGER_MS
                    }
                  />
                </div>
              )}
            </div>
            <div className="wotd-battle-pane right">
              {lastBattle && (
                <div key={`r-${lastBattle.key}`}>
                  <BattleSide
                    color={PLAYER_COLORS[lastBattle.defenderId].hex}
                    rolls={lastBattle.defenderRolls}
                    sum={lastBattle.defenderSum}
                    won={!lastBattle.attackerWon}
                    side="right"
                    totalDelayMs={
                      Math.max(
                        lastBattle.attackerRolls.length,
                        lastBattle.defenderRolls.length
                      ) * STACK_STAGGER_MS
                    }
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

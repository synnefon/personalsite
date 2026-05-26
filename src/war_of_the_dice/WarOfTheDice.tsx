import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import MapView from "./MapView.tsx";
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
import {
  resetBakedTurnCache,
  selectBestAttackBaked,
} from "./model/bakedAI.ts";
import {
  ARCHETYPE_DESCRIPTIONS,
  ARCHETYPE_IDS,
  defaultColorArchetype,
  type ArchetypeId,
} from "./model/personalities.ts";
import { reinforcePlayer } from "./reinforcement.ts";
import type { GameMap } from "./types.ts";

import "../styles/warofthedice.css";

// Sentinel for "observer" mode — playerColorId === OBSERVER_ID means no
// human seat; all 7 colors play as AI and the game runs autonomously.
const OBSERVER_ID = -1;

type GamePhase = "setup" | "playing" | "gameOver";

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
 * Custom dropdown for archetype selection. Replaces native `<select>` so
 * that both the closed trigger AND each open option can carry our fast
 * CSS-hover tooltip (native `<option>` can't be styled).
 */
function ArchetypeSelect({
  value,
  onChange,
  disabled,
}: {
  value: ArchetypeId;
  onChange: (next: ArchetypeId) => void;
  disabled: boolean;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="wotd-arch-select" ref={ref}>
      <button
        type="button"
        className="wotd-arch-trigger wotd-tip"
        data-tip={ARCHETYPE_DESCRIPTIONS[value]}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="wotd-arch-trigger-label">{value}</span>
        <span className="wotd-arch-caret" aria-hidden>▾</span>
      </button>
      {open && !disabled && (
        <ul className="wotd-arch-popover" role="listbox">
          {ARCHETYPE_IDS.map((a) => (
            <li
              key={a}
              role="option"
              aria-selected={a === value}
              className={
                "wotd-arch-option wotd-tip" + (a === value ? " selected" : "")
              }
              data-tip={ARCHETYPE_DESCRIPTIONS[a]}
              onClick={() => {
                onChange(a);
                setOpen(false);
              }}
            >
              {a}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Pre-game setup view: shows the current map preview, per-color archetype
 * dropdowns, a player-color radio, and a "preview new map" button. The
 * archetype dropdown options and per-color defaults all come from
 * ARCHETYPES / defaultColorArchetype in `personalities.ts` — a single
 * source of truth.
 */
function SetupScreen({
  map,
  playerColorId,
  setPlayerColorId,
  colorArchetypes,
  setColorArchetypes,
  onStart,
}: {
  map: GameMap;
  playerColorId: number;
  setPlayerColorId: (id: number) => void;
  colorArchetypes: ReadonlyArray<ArchetypeId>;
  setColorArchetypes: (next: ArchetypeId[]) => void;
  onStart: () => void;
}): ReactElement {
  return (
    <div className="wotd-setup">
      <div className="wotd-setup-map">
        <MapView
          map={map}
          highlightedTerritoryIds={[]}
          onTerritoryClick={() => { }}
          onBackgroundClick={() => { }}
        />
      </div>
      <div className="wotd-setup-controls">
        <div className="wotd-setup-colors">
          <div className="wotd-setup-row wotd-setup-observer">
            <label className="wotd-setup-play-as">
              <input
                type="radio"
                name="wotd-player-color"
                checked={playerColorId === OBSERVER_ID}
                onChange={() => setPlayerColorId(OBSERVER_ID)}
              />
              observer (watch all AIs play)
            </label>
          </div>
          {PLAYER_COLORS.map((color, i) => {
            const isPlayer = i === playerColorId;
            return (
              <div key={i} className="wotd-setup-row">
                <span
                  className="wotd-swatch"
                  style={{ backgroundColor: color.hex }}
                />
                <span className="wotd-setup-color-name">{color.name}</span>
                <label className="wotd-setup-play-as">
                  <input
                    type="radio"
                    name="wotd-player-color"
                    checked={isPlayer}
                    onChange={() => setPlayerColorId(i)}
                  />
                  you
                </label>
                <ArchetypeSelect
                  value={colorArchetypes[i]}
                  disabled={isPlayer}
                  onChange={(next) => {
                    const updated = colorArchetypes.slice();
                    updated[i] = next;
                    setColorArchetypes(updated);
                  }}
                />
              </div>
            );
          })}
        </div>
        <button className="wotd-setup-start" type="button" onClick={onStart}>
          start game
        </button>
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
  const [aiAction, setAiAction] = useState<AIAction | null>(null);
  const [lastBattle, setLastBattle] = useState<BattleDisplay | null>(null);
  const [isRegenSpinning, setIsRegenSpinning] = useState<boolean>(false);
  const [attackInProgress, setAttackInProgress] = useState<boolean>(false);
  const [round, setRound] = useState<number>(0);
  const [gamePhase, setGamePhase] = useState<GamePhase>("setup");
  const [playerColorId, setPlayerColorId] = useState<number>(USER_PLAYER_ID);
  const [colorArchetypes, setColorArchetypes] = useState<ArchetypeId[]>(() =>
    Array.from({ length: NUM_PLAYERS }, (_, i) => defaultColorArchetype(i)),
  );
  const battleKeyRef = useRef(0);
  const playerTimeoutsRef = useRef<number[]>([]);
  const roundRef = useRef<number>(0);
  const playerColorIdRef = useRef<number>(USER_PLAYER_ID);
  const colorArchetypesRef = useRef<ArchetypeId[]>(colorArchetypes);
  // Per-defender sliding window of recent attackers (most-recent first,
  // capped at ATTACK_HISTORY_LIMIT). Only the Vengeful archetype reads it,
  // but every AI move flows through the same hook for uniformity.
  const ATTACK_HISTORY_LIMIT = 6;
  const attackHistoryRef = useRef<Map<number, number[]>>(new Map());
  useEffect(() => {
    roundRef.current = round;
  }, [round]);
  useEffect(() => {
    playerColorIdRef.current = playerColorId;
  }, [playerColorId]);
  useEffect(() => {
    colorArchetypesRef.current = colorArchetypes;
  }, [colorArchetypes]);

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
  const isPlayingPhase = gamePhase === "playing";
  const isPlayerTurn =
    isPlayingPhase && !isGameOver && currentActor === playerColorId;
  const isAITurn =
    isPlayingPhase && !isGameOver && currentActor !== playerColorId;

  // Transition to gameOver phase the moment a winner emerges.
  useEffect(() => {
    if (isGameOver && gamePhase === "playing") setGamePhase("gameOver");
  }, [isGameOver, gamePhase]);

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

  // Log per-color v2 archetype assignments at game start.
  useEffect(() => {
    if (gamePhase !== "playing") return;
    const rows: Record<string, string> = {};
    for (let i = 0; i < NUM_PLAYERS; i++) {
      if (i === playerColorId) continue;
      rows[PLAYER_COLORS[i].name] = colorArchetypes[i];
    }
    /* eslint-disable no-console */
    console.table(rows);
    /* eslint-enable no-console */
  }, [gamePhase, colorArchetypes, playerColorId]);

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
      // Successful captures update the defender's recent-attacker list so
      // the Vengeful archetype can retaliate on its next turn.
      if (result.outcome.attackerWon) {
        const prior = attackHistoryRef.current.get(defenderId) ?? [];
        const next = [actorId, ...prior.filter((a) => a !== actorId)].slice(
          0,
          ATTACK_HISTORY_LIMIT,
        );
        attackHistoryRef.current.set(defenderId, next);
      }
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
    // Fresh per-turn V(board) memo for the baked AI. Stale entries from
    // the prior actor's turn would silently return wrong values.
    resetBakedTurnCache();
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
      const arch = colorArchetypesRef.current[currentActor];
      const recentAttackers = new Set(
        attackHistoryRef.current.get(currentActor) ?? [],
      );
      const move = selectBestAttackBaked(
        mapRef.current,
        currentActor,
        roundRef.current,
        arch,
        recentAttackers,
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

  /** Open the setup screen for a new game (without changing the map yet). */
  const openSetup = (): void => {
    cancelPlayerAttack();
    setAttackInProgress(false);
    setSelectedTerritoryId(null);
    setAiAction(null);
    setGamePhase("setup");
  };

  /**
   * Apply the setup choices and start a new game with whatever map is
   * currently previewed. Reroll the preview via the setup screen's
   * "preview new map" button before starting if you want a different one.
   */
  const startGame = (): void => {
    cancelPlayerAttack();
    setAttackInProgress(false);
    setTurnOrder(makeTurnOrder(Math.random));
    setCurrentTurnIdx(0);
    setSelectedTerritoryId(null);
    setBankedDice(new Array(NUM_PLAYERS).fill(0));
    setAiAction(null);
    setLastBattle(null);
    setRound(0);
    attackHistoryRef.current.clear();
    setGamePhase("playing");
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
      if (clicked.ownerId === playerColorId && clicked.dice >= 2) {
        setSelectedTerritoryId(territoryId);
      }
      return;
    }

    if (selectedTerritoryId === territoryId) {
      setSelectedTerritoryId(null);
      return;
    }

    if (clicked.ownerId === playerColorId) {
      setSelectedTerritoryId(clicked.dice >= 2 ? territoryId : null);
      return;
    }

    if (canAttack(map, selectedTerritoryId, territoryId)) {
      const source = selectedTerritoryId;
      setSelectedTerritoryId(null);
      setAttackInProgress(true);
      runAttackFromPhase2(
        playerColorId,
        source,
        territoryId,
        schedulePlayerWait,
        () => setAttackInProgress(false),
      );
      return;
    }
    setSelectedTerritoryId(null);
  };

  const isObserver = playerColorId === OBSERVER_ID;
  const statusText: ReactElement | string = (() => {
    if (isGameOver) {
      if (isObserver && winnerId !== null) {
        return (
          <span style={{ color: PLAYER_COLORS[winnerId].hex }}>
            {PLAYER_COLORS[winnerId].name} wins
          </span>
        );
      }
      if (winnerId === playerColorId) return "you win!";
      if (winnerId !== null) return "you lose";
      return "game over";
    }
    if (isAITurn) {
      return (
        <span style={{ color: PLAYER_COLORS[currentActor].hex }}>
          {isObserver
            ? `${PLAYER_COLORS[currentActor].name}'s turn`
            : "thinking…"}
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
            setMap(generateMap());
            if (gamePhase !== "setup") openSetup();
          }}
          onAnimationEnd={() => setIsRegenSpinning(false)}
          title={
            gamePhase === "setup"
              ? "preview a different map"
              : "new game (re-rolls map)"
          }
        >
          ↻
        </button>
      </div>
      {gamePhase === "setup" && (
        <SetupScreen
          map={map}
          playerColorId={playerColorId}
          setPlayerColorId={setPlayerColorId}
          colorArchetypes={colorArchetypes}
          setColorArchetypes={setColorArchetypes}
          onStart={startGame}
        />
      )}
      {gamePhase !== "setup" && (
        <div className="wotd-body">
          <aside className="wotd-sidebar">
            <div className="wotd-scores">
              {turnOrder
                .map((id) => stats[id])
                .filter((s) => s.territories > 0)
                .map((s) => {
                  const classes = [
                    "wotd-score",
                    s.playerId === playerColorId ? "you" : "",
                    s.playerId === currentActor && !isGameOver ? "active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const isHuman = s.playerId === playerColorId;
                  const archetype = colorArchetypes[s.playerId];
                  const tooltip = isHuman
                    ? undefined
                    : ARCHETYPE_DESCRIPTIONS[archetype];
                  return (
                    <div
                      key={s.playerId}
                      className={
                        tooltip ? `${classes} wotd-tip` : classes
                      }
                      data-tip={tooltip}
                    >
                      <span
                        className="wotd-swatch"
                        style={{
                          backgroundColor: PLAYER_COLORS[s.playerId].hex,
                        }}
                      />
                      <span className="wotd-score-arch">
                        {isHuman ? "you" : archetype}
                      </span>
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
      )}
    </div>
  );
}

export type HexCoord = { q: number; r: number };

export type Hex = HexCoord & {
  territoryId: number;
};

export type Territory = {
  id: number;
  ownerId: number;
  hexKeys: string[];
  dice: number;
};

export type GameMap = {
  hexes: Map<string, Hex>;
  territories: Territory[];
  adjacency: Map<number, Set<number>>;
};

/** A single legal-attack candidate: source territory + target territory. */
export type AttackMove = { sourceId: number; targetId: number };

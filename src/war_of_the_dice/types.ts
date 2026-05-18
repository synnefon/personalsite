export type HexCoord = { q: number; r: number };

export type Hex = HexCoord & {
  territoryId: number;
};

export type Territory = {
  id: number;
  ownerId: number;
  hexKeys: string[];
};

export type GameMap = {
  hexes: Map<string, Hex>;
  territories: Territory[];
  adjacency: Map<number, Set<number>>;
};

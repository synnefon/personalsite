/** A single ball in the simulation. Position/velocity are in CSS pixels. */
export type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  stuck: boolean;
  appeared: boolean;
};

/** A free ball plus the stuck cluster, indexed for cheap collision and drawing. */
export type Sim = {
  /** Moving balls; tested against the cluster every frame. */
  free: Ball[];
  /** Stuck balls bucketed by grid cell. */
  grid: Map<number, Ball[]>;
  /** Cell size in CSS px. >= any free+stuck radius sum, so a 3x3 search is exhaustive. */
  cellSize: number;
  /** Offscreen layer holding the rendered cluster, blitted each frame. */
  cluster: HTMLCanvasElement;
  clusterCtx: CanvasRenderingContext2D;
  keepGenerating: boolean;
  /** Current radius for newly-spawned and existing free balls (set by the slider). */
  freeRadius: number;
  /** The red seed ball, kept as a handle so it can be dragged. */
  source: Ball;
  /** Axis-aligned bounds of the stuck cluster, for cheap collision rejection. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

/** 5 种花砖颜色，墙的布局按 colors[(列 − 行) mod 5] 摆放（见 engine 的 wallColor）。 */
export const COLORS = ["blue", "yellow", "red", "black", "white"] as const;
export type Color = (typeof COLORS)[number];

/** 颜色在 COLORS 里的下标，也是墙布局公式里的 c − r 偏移。 */
export const COLOR_INDEX: Record<Color, number> = {
  blue: 0,
  yellow: 1,
  red: 2,
  black: 3,
  white: 4,
};

export const COLOR_NAMES: Record<Color, string> = {
  blue: "蓝",
  yellow: "黄",
  red: "红",
  black: "黑",
  white: "白",
};

export interface Config {
  readonly minPlayers: number;
  readonly maxPlayers: number;
  /** 每种颜色的砖块数。 */
  readonly tilesPerColor: number;
  /** 地板行从左到右的扣分，取前缀和。 */
  readonly floorPenalties: readonly number[];
  /** 终局奖励：完整横排 / 完整竖列 / 集齐一色各给多少分。 */
  readonly endBonus: { readonly row: number; readonly column: number; readonly color: number };
  /** 灰色面变体：上墙时玩家自选列。未实现，仅保留配置项。 */
  readonly greyWallVariant: boolean;
  /** 地板行已满时拿到起始玩家标记：默认仍成为下轮先手，但不额外扣分。 */
  readonly markerWhenFloorFull: boolean;
  /** 回合计时；超时自动替当前玩家选一个合法动作。 */
  readonly turnTimeoutSec: number;
}

/** 一条图案行：目前放的颜色（null 表示空行）和已放的块数。 */
export interface PatternLine {
  color: Color | null;
  count: number;
}

export interface Player {
  readonly id: string;
  readonly name: string;
  score: number;
  /** 5 条图案行，第 r 行容量 r+1。 */
  patternLines: PatternLine[];
  /** 5×5 墙，颜色由坐标推出（wallColor）。 */
  wall: boolean[][];
  /** 地板行，最多 7 格；"marker" 表示起始玩家标记。 */
  floor: (Color | "marker")[];
}

export type LineIndex = 0 | 1 | 2 | 3 | 4;

export type Source = { readonly kind: "factory"; readonly index: number } | { readonly kind: "center" };
export type Target = { readonly kind: "line"; readonly index: LineIndex } | { readonly kind: "floor" };

export type GameCommand = {
  readonly type: "TAKE";
  readonly source: Source;
  readonly color: Color;
  readonly target: Target;
};

/** 终局奖励明细。 */
export interface FinalScore {
  readonly player: string;
  readonly score: number;
  readonly rows: number;
  readonly columns: number;
  readonly colors: number;
  readonly bonus: number;
}

export interface FinalResult {
  readonly scores: FinalScore[];
  readonly winners: string[];
}

/** 每个动作产生的事件，前端按顺序逐条播放。 */
export type GameEvent =
  | {
      readonly type: "TilesTaken";
      readonly player: string;
      readonly source: Source;
      readonly color: Color;
      readonly count: number;
      /** 从工厂拿走后移到中心区的其余砖。 */
      readonly toCenter: Color[];
      /** 同时拿走了起始玩家标记。 */
      readonly tookMarker: boolean;
    }
  | {
      readonly type: "TilesPlaced";
      readonly player: string;
      readonly color: Color;
      readonly lineIndex: number | null;
      readonly lineCount: number;
      readonly floorCount: number;
    }
  | {
      readonly type: "WallTiled";
      readonly player: string;
      readonly row: number;
      readonly col: number;
      readonly color: Color;
      /** 横向 / 纵向相连长度（含新砖）。 */
      readonly h: number;
      readonly v: number;
      readonly gained: number;
    }
  | { readonly type: "FloorPenalty"; readonly player: string; readonly penalty: number; readonly scoreBefore: number; readonly scoreAfter: number }
  | { readonly type: "RoundStarted"; readonly round: number; readonly firstPlayer: string }
  | { readonly type: "GameEnded"; readonly result: FinalResult }
  | { readonly type: "TurnTimedOut"; readonly player: string };

export interface GameState {
  readonly config: Config;
  /** drafting：拿砖阶段；finished：对局结束。贴墙阶段在最后一次拿砖后由服务端自动结算，不单独暴露。 */
  phase: "drafting" | "finished";
  players: Player[];
  /** 当前玩家在 players 里的下标。 */
  currentPlayer: number;
  /** 第几轮，从 1 开始。 */
  round: number;
  /** 第几个回合（每个行动 +1），用作回合计时的键。 */
  turn: number;
  factories: Color[][];
  center: Color[];
  /** 起始玩家标记是否还在中心区。 */
  firstMarkerInCenter: boolean;
  /** 下轮先手（本轮第一个从中心区拿砖的人；开局为随机起始玩家）。 */
  markerHolder: number;
  events: GameEvent[];
  finalResult?: FinalResult;
  /** 每个动作 +1；前端据此判断是不是新事件。 */
  version: number;
  /** 以下只在服务端：布袋和盒盖（含顺序）、随机数状态、动作序列。发给客户端前删掉。 */
  bag: Color[];
  lid: Color[];
  seed?: number;
  rngState?: number;
  log?: { player: string; command: GameCommand | { type: "TIMEOUT" } }[];
  /** 仅客户端视角存在：布袋 + 盒盖剩余砖数。 */
  remainingTiles?: number;
}

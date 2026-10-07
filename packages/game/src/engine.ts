import { createRng, type Rng } from "./rng.js";
import {
  COLOR_INDEX,
  COLORS,
  type Color,
  type Config,
  type FinalResult,
  type FinalScore,
  type GameCommand,
  type GameEvent,
  type GameState,
  type LineIndex,
  type Player,
  type Source,
  type Target,
} from "./types.js";

/** 规格书「配置项汇总」里的默认值。 */
export function defaultConfig(_playerCount: number, overrides: Partial<Config> = {}): Config {
  return {
    minPlayers: 2,
    maxPlayers: 4,
    tilesPerColor: 20,
    floorPenalties: [-1, -1, -2, -2, -2, -3, -3],
    endBonus: { row: 2, column: 7, color: 10 },
    greyWallVariant: false,
    markerWhenFloorFull: true,
    turnTimeoutSec: 60,
    ...overrides,
  };
}

const LINE_INDICES: readonly LineIndex[] = [0, 1, 2, 3, 4];
const WALL_SIZE = 5;
const FLOOR_CAPACITY = 7;

/** 墙第 r 行第 c 列该放什么颜色：colors[(c − r) mod 5]。 */
export function wallColor(row: number, col: number): Color {
  return COLORS[(((col - row) % WALL_SIZE) + WALL_SIZE) % WALL_SIZE]!;
}

/** 图案行 r 放颜色 color 时对应的墙列号。 */
export function wallColFor(lineIndex: LineIndex, color: Color): number {
  return (lineIndex + COLOR_INDEX[color]) % WALL_SIZE;
}

/**
 * 一块砖放到墙 (r, c) 的得分：横向、纵向各数相连长度，孤零零一块得 1 分，
 * 否则 (h>1?h:0)+(v>1?v:0)。顺序无关，但必须逐块按这个公式算。
 */
export function measurePlacement(wall: boolean[][], r: number, c: number): { h: number; v: number; score: number } {
  let h = 1;
  let v = 1;
  for (let x = c - 1; x >= 0 && wall[r]![x]; x--) h += 1;
  for (let x = c + 1; x < WALL_SIZE && wall[r]![x]; x++) h += 1;
  for (let y = r - 1; y >= 0 && wall[y]![c]; y--) v += 1;
  for (let y = r + 1; y < WALL_SIZE && wall[y]![c]; y++) v += 1;
  const score = h === 1 && v === 1 ? 1 : (h > 1 ? h : 0) + (v > 1 ? v : 0);
  return { h, v, score };
}

/** 地板行占 count 格时的扣分：floorPenalties 的前缀和。 */
export function floorPenalty(penalties: readonly number[], count: number): number {
  let total = 0;
  const n = Math.min(count, penalties.length);
  for (let i = 0; i < n; i += 1) total += penalties[i]!;
  return total;
}

/** 把 color 放进图案行 lineIndex 是否合法；不合法时返回原因。 */
export function lineError(state: GameState, player: Player, lineIndex: LineIndex, color: Color): string | null {
  const line = player.patternLines[lineIndex]!;
  if (line.count >= lineIndex + 1) return "这条图案行已经满了。";
  if (line.color !== null && line.color !== color) return "这条图案行已经放了别的颜色。";
  if (player.wall[lineIndex]![wallColFor(lineIndex, color)]) return "这一排墙上已经有这种颜色的砖了。";
  return null;
}

/** 当前玩家的全部合法 TAKE 行动（前端高亮和超时自动行动都用它）。 */
export function legalActions(state: GameState, playerId: string): GameCommand[] {
  if (state.phase !== "drafting") return [];
  if (state.players[state.currentPlayer]?.id !== playerId) return [];
  const player = state.players[state.currentPlayer]!;

  const sources: Source[] = [];
  state.factories.forEach((factory, index) => {
    if (factory.length > 0) sources.push({ kind: "factory", index });
  });
  if (state.center.length > 0) sources.push({ kind: "center" });

  const actions: GameCommand[] = [];
  for (const source of sources) {
    const pool = source.kind === "factory" ? state.factories[source.index]! : state.center;
    for (const color of new Set(pool)) {
      // 地板行永远合法。
      actions.push({ type: "TAKE", source, color, target: { kind: "floor" } });
      for (const lineIndex of LINE_INDICES) {
        if (lineError(state, player, lineIndex, color) === null) {
          actions.push({ type: "TAKE", source, color, target: { kind: "line", index: lineIndex } });
        }
      }
    }
  }
  return actions;
}

/** 一个行动里拿到的砖数，以及若放图案行会溢出几块。 */
function tileCount(state: GameState, source: Source, color: Color): number {
  const pool = source.kind === "factory" ? state.factories[source.index]! : state.center;
  return pool.filter((tile) => tile === color).length;
}

/** 超时/断线时自动替当前玩家选一个合法动作：优先放得下、溢出最少的图案行。 */
function autoAction(state: GameState, playerId: string): GameCommand {
  const player = state.players[state.currentPlayer]!;
  const actions = legalActions(state, playerId);
  if (actions.length === 0) throw new Error("没有可执行的行动。");
  let best = actions[0]!;
  let bestOverflow = Number.POSITIVE_INFINITY;
  for (const action of actions) {
    const count = tileCount(state, action.source, action.color);
    const overflow =
      action.target.kind === "line"
        ? Math.max(0, count - (action.target.index + 1 - player.patternLines[action.target.index]!.count))
        : count;
    if (overflow < bestOverflow) {
      bestOverflow = overflow;
      best = action;
    }
  }
  return best;
}

/** 地板行最多 7 格，多余的砖直接进盒盖。 */
function addToFloor(state: GameState, player: Player, tiles: Color[]): void {
  const space = FLOOR_CAPACITY - player.floor.length;
  const ontoFloor = tiles.slice(0, Math.max(0, space));
  const overflow = tiles.slice(Math.max(0, space));
  player.floor.push(...ontoFloor);
  state.lid.push(...overflow);
}

export interface NewPlayer {
  readonly id: string;
  readonly name: string;
}

/**
 * 开局：按人数算工厂数（2×人数+1）、每厂 4 块；洗布袋；随机起始玩家（起始标记放中心区）。
 */
export function createGame(
  players: readonly NewPlayer[],
  seed = Math.floor(Math.random() * 2 ** 32),
  overrides: Partial<Config> = {},
): GameState {
  const config = defaultConfig(players.length, overrides);
  if (players.length < config.minPlayers || players.length > config.maxPlayers) {
    throw new Error(`需要 ${config.minPlayers}–${config.maxPlayers} 位玩家才能开始。`);
  }
  const rng = createRng(seed);
  const bag = rng.shuffle(COLORS.flatMap((color) => new Array<Color>(config.tilesPerColor).fill(color)));
  const factoryCount = 2 * players.length + 1;
  const factories: Color[][] = [];
  for (let i = 0; i < factoryCount; i += 1) {
    const factory: Color[] = [];
    for (let k = 0; k < 4 && bag.length > 0; k += 1) factory.push(bag.pop()!);
    factories.push(factory);
  }
  const start = rng.int(players.length);
  const state: GameState = {
    config,
    phase: "drafting",
    players: players.map((player) => ({
      id: player.id,
      name: player.name,
      score: 0,
      patternLines: LINE_INDICES.map(() => ({ color: null, count: 0 })),
      wall: Array.from({ length: WALL_SIZE }, () => new Array<boolean>(WALL_SIZE).fill(false)),
      floor: [],
    })),
    currentPlayer: start,
    round: 1,
    turn: 1,
    factories,
    center: [],
    firstMarkerInCenter: true,
    markerHolder: start,
    events: [],
    version: 0,
    bag,
    lid: [],
  };
  state.rngState = rng.state;
  return state;
}

/** 贴墙阶段：逐行、逐块上墙计分，然后结算地板扣分，最后判断是否终局。 */
function resolveTiling(state: GameState, events: GameEvent[]): void {
  for (const player of state.players) {
    for (const lineIndex of LINE_INDICES) {
      const line = player.patternLines[lineIndex]!;
      if (line.count < lineIndex + 1) continue; // 未填满，原样保留到下轮
      const color = line.color!;
      const col = wallColFor(lineIndex, color);
      const { h, v, score } = measurePlacement(player.wall, lineIndex, col);
      player.wall[lineIndex]![col] = true;
      events.push({ type: "WallTiled", player: player.id, row: lineIndex, col, color, h, v, gained: score });
      player.score += score;
      // 最右一块上墙，其余进盒盖。
      state.lid.push(...new Array<Color>(line.count - 1).fill(color));
      line.color = null;
      line.count = 0;
    }

    // 地板扣分（起始标记算一块普通砖）。penalty 是负数。
    const penalty = floorPenalty(state.config.floorPenalties, player.floor.length);
    const scoreBefore = player.score;
    const scoreAfter = Math.max(0, scoreBefore + penalty);
    player.score = scoreAfter;
    if (penalty !== 0) {
      events.push({ type: "FloorPenalty", player: player.id, penalty, scoreBefore, scoreAfter });
    }
    // 地板砖进盒盖；起始标记回到持有者（不进盒盖）。
    state.lid.push(...player.floor.filter((tile) => tile !== "marker"));
    player.floor = [];
  }

  const anyCompleteRow = state.players.some((player) => player.wall.some((row) => row.every(Boolean)));
  if (anyCompleteRow) finishGame(state, events);
}

function countColumns(wall: boolean[][]): number {
  let count = 0;
  for (let c = 0; c < WALL_SIZE; c += 1) {
    if (wall.every((row) => row[c])) count += 1;
  }
  return count;
}

function countCompleteColors(wall: boolean[][]): number {
  let count = 0;
  for (const color of COLORS) {
    const offset = COLOR_INDEX[color];
    if (wall.every((row, r) => row[(r + offset) % WALL_SIZE])) count += 1;
  }
  return count;
}

/** 终局：给每位玩家加完整横排/竖列/集色奖励，最高分者胜；同分比完整横排数；仍同则并列。 */
function finishGame(state: GameState, events: GameEvent[]): void {
  const { endBonus } = state.config;
  const scores: FinalScore[] = state.players.map((player) => {
    const rows = player.wall.filter((row) => row.every(Boolean)).length;
    const columns = countColumns(player.wall);
    const colors = countCompleteColors(player.wall);
    const bonus = rows * endBonus.row + columns * endBonus.column + colors * endBonus.color;
    return { player: player.id, score: player.score + bonus, rows, columns, colors, bonus };
  });
  for (const score of scores) {
    state.players.find((player) => player.id === score.player)!.score = score.score;
  }
  const maxScore = Math.max(...scores.map((score) => score.score));
  const top = scores.filter((score) => score.score === maxScore);
  const maxRows = Math.max(...top.map((score) => score.rows));
  const result: FinalResult = {
    scores,
    winners: top.filter((score) => score.rows === maxRows).map((score) => score.player),
  };
  state.phase = "finished";
  state.finalResult = result;
  events.push({ type: "GameEnded", result });
}

/** 补砖开新轮：起始标记放回中心区、持标记者先手、每个工厂从布袋补到 4 块。 */
function startNextRound(state: GameState, rng: Rng, events: GameEvent[]): void {
  state.round += 1;
  state.firstMarkerInCenter = true;
  state.currentPlayer = state.markerHolder;
  for (const factory of state.factories) {
    while (factory.length < 4) {
      if (state.bag.length === 0) {
        if (state.lid.length === 0) break; // 布袋和盒盖都空，用现有砖开轮
        state.bag = rng.shuffle(state.lid);
        state.lid = [];
      }
      factory.push(state.bag.pop()!);
    }
  }
  events.push({ type: "RoundStarted", round: state.round, firstPlayer: state.players[state.markerHolder]!.id });
}

function advanceTurn(state: GameState): void {
  state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
}

function currentPlayerId(state: GameState): string {
  return state.players[state.currentPlayer]!.id;
}

/** 规则引擎主入口：校验并执行一个 TAKE 行动，返回新状态和事件。不修改传入的 state。 */
export function apply(state: GameState, playerId: string, command: GameCommand, rng: Rng): { state: GameState; events: GameEvent[] } {
  if (state.phase !== "drafting") throw new Error("对局已经结束。");
  if (currentPlayerId(state) !== playerId) throw new Error("还没轮到你。");
  if (command?.type !== "TAKE") throw new Error("未知的行动。");

  const next = structuredClone(state);
  const playerIndex = next.players.findIndex((player) => player.id === playerId);
  const player = next.players[playerIndex]!;
  const events: GameEvent[] = [];

  // 校验拿砖来源里有这种颜色。
  const count = tileCount(next, command.source, command.color);
  if (count === 0) {
    throw new Error(command.source.kind === "factory" ? "这个工厂里没有这种颜色的砖。" : "中心区没有这种颜色的砖。");
  }
  if (command.target.kind === "line") {
    const error = lineError(next, player, command.target.index, command.color);
    if (error) throw new Error(error);
  }

  // 拿砖。
  let toCenter: Color[] = [];
  let tookMarker = false;
  if (command.source.kind === "factory") {
    const factory = next.factories[command.source.index]!;
    toCenter = factory.filter((tile) => tile !== command.color);
    next.factories[command.source.index] = []; // 拿走后工厂清空，其余砖移到中心区
    next.center.push(...toCenter);
  } else {
    next.center = next.center.filter((tile) => tile !== command.color);
    if (next.firstMarkerInCenter) {
      tookMarker = true;
      next.firstMarkerInCenter = false;
      next.markerHolder = playerIndex;
      if (player.floor.length < FLOOR_CAPACITY) player.floor.push("marker");
    }
  }
  events.push({ type: "TilesTaken", player: playerId, source: command.source, color: command.color, count, toCenter, tookMarker });

  // 放砖。
  let lineCount = 0;
  let floorCount = 0;
  if (command.target.kind === "line") {
    const line = player.patternLines[command.target.index]!;
    const space = command.target.index + 1 - line.count;
    const ontoLine = Math.min(count, space);
    line.color = command.color;
    line.count += ontoLine;
    lineCount = line.count;
    const overflow = count - ontoLine;
    if (overflow > 0) {
      addToFloor(next, player, new Array<Color>(overflow).fill(command.color));
      floorCount = overflow;
    }
  } else {
    addToFloor(next, player, new Array<Color>(count).fill(command.color));
    floorCount = count;
  }
  events.push({
    type: "TilesPlaced",
    player: playerId,
    color: command.color,
    lineIndex: command.target.kind === "line" ? command.target.index : null,
    lineCount,
    floorCount,
  });

  // 拿砖阶段结束判定：所有工厂和中心区都空。
  const draftingDone = next.factories.every((factory) => factory.length === 0) && next.center.length === 0;
  if (draftingDone) {
    resolveTiling(next, events);
    if (next.phase !== "finished") startNextRound(next, rng, events);
  } else {
    advanceTurn(next);
  }

  next.turn += 1;
  next.version += 1;
  next.events = events;
  return { state: next, events };
}

/** 服务端用：用对局里保存的随机数状态执行行动，并记进动作序列。 */
export function applyCommand(state: GameState, playerId: string, command: GameCommand): GameState {
  const rng = createRng(state.rngState ?? state.seed ?? 0);
  const { state: next } = apply(state, playerId, command, rng);
  next.rngState = rng.state;
  next.log = [...(state.log ?? []), { player: playerId, command }];
  return next;
}

/** 回合超时（含断线玩家）：自动替当前玩家选一个合法动作。 */
export function timeoutTurn(state: GameState): GameState {
  if (state.phase !== "drafting") return state;
  const playerId = currentPlayerId(state);
  const rng = createRng(state.rngState ?? state.seed ?? 0);
  const command = autoAction(state, playerId);
  const { state: next } = apply(state, playerId, command, rng);
  next.events = [{ type: "TurnTimedOut", player: playerId }, ...next.events];
  next.rngState = rng.state;
  next.log = [...(state.log ?? []), { player: playerId, command: { type: "TIMEOUT" } }];
  return next;
}

/**
 * 发给客户端的视角：Azul 除布袋/盒盖的顺序外全部公开。删掉种子、随机数状态、动作序列，
 * 布袋盒盖只保留剩余数量（remainingTiles）。
 */
export function redactGameForViewer(state: GameState, _viewerId: string): GameState {
  const { bag, lid, seed: _seed, rngState: _rngState, log: _log, ...rest } = state;
  return { ...rest, bag: [], lid: [], remainingTiles: bag.length + lid.length };
}

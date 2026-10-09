import { legalActions, measurePlacement, wallColFor } from "./engine.js";
import type { Color, GameCommand, GameState, LineIndex, Player } from "./types.js";

/**
 * 人机（「普通」难度）：一步贪心，只看桌上公开的东西。
 *
 * 每个合法动作估一个分：
 * - 放进图案行、这一行因此填满：这块砖本轮结束上墙能得的分（按「本轮已经填满的行也算已上墙」估相连），
 *   再加终局奖励的进度（这一横排、竖列、颜色上墙越多，再上一块越值钱）；
 * - 放进图案行但没填满：按「填了几成」折算上面那个分，砖越多越接近；
 * - 进地板的砖（放不下溢出的、直接扔地板的、起始玩家标记）：按地板扣分表扣；
 * - 新开一条大的图案行而本轮剩下的同色砖不够填满，打个折（这条行会卡到下一轮）。
 * 取分最高的动作。
 */

const WALL_SIZE = 5;
/** 填了一部分的图案行，按完成比例折算后再打这个折扣（下一轮才上墙、还可能被卡住）。 */
const PARTIAL = 0.7;
/** 终局奖励（横排 2、竖列 7、一色 10）的进度按平方计：越接近完成，再上一块越值钱。乘这个系数是因为不一定能完成。 */
const BONUS_WEIGHT = 0.6;
/** 拿起始玩家标记（下一轮先手）本身的好处。 */
const FIRST_PLAYER_VALUE = 0.8;

/** 本轮结束时的墙：已上墙的 + 已经填满、本轮结束会上墙的图案行。 */
function projectedWall(player: Player): boolean[][] {
  const wall = player.wall.map((row) => [...row]);
  player.patternLines.forEach((line, row) => {
    if (line.color !== null && line.count === row + 1) wall[row]![wallColFor(row as LineIndex, line.color)] = true;
  });
  return wall;
}

/** 再往 (row, col) 上一块，终局奖励进度的增量。 */
function bonusGain(state: GameState, wall: boolean[][], row: number, col: number, color: Color): number {
  const { row: rowBonus, column: columnBonus, color: colorBonus } = state.config.endBonus;
  const inRow = wall[row]!.filter(Boolean).length;
  const inColumn = wall.filter((cells) => cells[col]).length;
  let inColor = 0;
  for (let r = 0; r < WALL_SIZE; r += 1) if (wall[r]![wallColFor(r as LineIndex, color)]) inColor += 1;
  const step = (before: number, bonus: number) => bonus * (((before + 1) / WALL_SIZE) ** 2 - (before / WALL_SIZE) ** 2);
  return BONUS_WEIGHT * (step(inRow, rowBonus) + step(inColumn, columnBonus) + step(inColor, colorBonus));
}

/** 地板从 before 块变成 after 块多扣的分（正数）。 */
function floorCost(state: GameState, before: number, after: number): number {
  const penalties = state.config.floorPenalties;
  let cost = 0;
  for (let index = before; index < Math.min(after, penalties.length); index += 1) cost -= penalties[index]!;
  return cost;
}

/** 本轮桌上（工厂 + 中心）还有几块这种颜色。 */
function onTable(state: GameState, color: Color): number {
  return state.factories.reduce((total, factory) => total + factory.filter((tile) => tile === color).length, 0)
    + state.center.filter((tile) => tile === color).length;
}

function actionValue(state: GameState, player: Player, action: GameCommand, wall: boolean[][]): number {
  const pool = action.source.kind === "factory" ? state.factories[action.source.index]! : state.center;
  const count = pool.filter((tile) => tile === action.color).length;
  const takesMarker = action.source.kind === "center" && state.firstMarkerInCenter;
  let value = takesMarker ? FIRST_PLAYER_VALUE : 0;
  let toFloor = count + (takesMarker ? 1 : 0);

  if (action.target.kind === "line") {
    const row = action.target.index;
    const line = player.patternLines[row]!;
    const capacity = row + 1;
    const placed = Math.min(count, capacity - line.count);
    toFloor -= placed;
    const col = wallColFor(row, action.color);
    const worth = measurePlacement(wall, row, col).score + bonusGain(state, wall, row, col, action.color);
    const filled = line.count + placed;
    if (filled === capacity) {
      value += worth;
    } else {
      value += worth * (filled / capacity) * PARTIAL;
      // 本轮剩下的同色砖（拿完这次以后）不够填满这一行：会卡到下一轮
      const remaining = onTable(state, action.color) - count;
      if (remaining < capacity - filled) value -= 0.3 * (capacity - filled);
    }
  }
  value -= floorCost(state, player.floor.length, player.floor.length + toFloor);
  return value;
}

/** 轮到 playerId 时人机的下一步；没轮到它返回 null。 */
export function botCommand(state: GameState, playerId: string): GameCommand | null {
  const actions = legalActions(state, playerId);
  if (actions.length === 0) return null;
  const player = state.players[state.currentPlayer]!;
  const wall = projectedWall(player);
  let best = actions[0]!;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (const action of actions) {
    const value = actionValue(state, player, action, wall);
    if (value > bestValue) {
      bestValue = value;
      best = action;
    }
  }
  return best;
}

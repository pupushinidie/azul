/**
 * 花砖物语和教程有关的部分（共用的 tutorial/ 文件夹之外，每款游戏自己写的）：
 * 游戏 id、「提示」怎么说、「第一次遇到」小贴士什么时候出。
 */
import { botCommand, COLOR_NAMES, measurePlacement, wallColFor, type GameState } from "@azul/game";

/** 本机记录（gm-tutorial-<id>、gm-tips-<id>）用的游戏 id。 */
export const GAME_ID = "azul";

export interface Hint {
  readonly say: string;
  readonly note?: string;
  /** 高亮哪个元素（data-tutorial）；null 不指。 */
  readonly anchor: string | null;
}

/** 地板从 before 块变成 after 块多扣几分（正数）。 */
function floorCost(game: GameState, before: number, after: number): number {
  let cost = 0;
  for (let index = before; index < Math.min(after, game.config.floorPenalties.length); index += 1) cost -= game.config.floorPenalties[index]!;
  return cost;
}

/** 「提示」：让人机从你的位置算一步（界面拿到的本来就是你能看到的那份），配一句原因。 */
export function hintFor(game: GameState, playerId: string): Hint {
  if (game.phase !== "drafting") return { say: "这局已经结束了。", anchor: null };
  const current = game.players[game.currentPlayer]!;
  if (current.id !== playerId) return { say: `等 ${current.name} 走完再问我。`, anchor: null };
  const command = botCommand(game, playerId);
  if (!command) return { say: "现在没有能走的。", anchor: null };

  const pool = command.source.kind === "factory" ? game.factories[command.source.index]! : game.center;
  const count = pool.filter((tile) => tile === command.color).length;
  const from = command.source.kind === "factory" ? "亮着的工厂" : "中心区";
  const anchor = command.source.kind === "factory" ? `factory:${command.source.index}` : "center";
  const takesMarker = command.source.kind === "center" && game.firstMarkerInCenter;
  const tiles = ` ${count} 块${COLOR_NAMES[command.color]}砖`;
  const reasons: string[] = [];
  let toFloor = command.target.kind === "floor" ? count : 0;

  if (command.target.kind === "line") {
    const row = command.target.index;
    const line = current.patternLines[row]!;
    const placed = Math.min(count, row + 1 - line.count);
    toFloor = count - placed;
    if (line.count + placed === row + 1) {
      const gain = measurePlacement(current.wall, row, wallColFor(row, command.color)).score;
      reasons.push(`第 ${row + 1} 行就放满了，这轮结束铺上墙至少 +${gain} 分。`);
    } else {
      reasons.push(`第 ${row + 1} 行先攒着，还差 ${row + 1 - line.count - placed} 块。`);
    }
  } else {
    reasons.push("别的放法更亏，直接放进地板损失最小。");
  }
  const lost = floorCost(game, current.floor.length, current.floor.length + toFloor + (takesMarker ? 1 : 0));
  if (takesMarker) reasons.push("顺便拿起始标记：下一轮先手。");
  if (lost > 0) reasons.push(`地板会扣 ${lost} 分。`);

  const where = command.target.kind === "line" ? `放进第 ${command.target.index + 1} 条图案行` : "放进地板行";
  return { say: `我会拿${from}里的${tiles}，${where}。`, note: reasons.slice(0, 2).join(""), anchor };
}

/** 「第一次遇到」小贴士的内容。 */
export const TIPS = {
  marker: { title: "你拿到了起始标记", text: "这轮第一个从中心区拿砖的人拿走它：占地板一格要扣分，但下一轮你先手。" },
  overflow: { title: "放不下的砖掉进了地板", text: "地板每格按下面的数字扣分（越往右扣得越多），满 7 格后再多的直接收走。" },
  "wall-scored": { title: "铺墙计分", text: "新砖横着、竖着和相连的砖各数一串加起来；四周都空只得 1 分。" },
  "floor-penalty": { title: "地板扣分了", text: "每轮结束按地板上的格数扣分，分数最低扣到 0。" },
  "near-end": { title: "有人快铺满一整横行了", text: "只要有人铺满一整横行，那一轮结束时游戏就结束，再加终局奖励。" },
} as const;

/** 这一步该出哪些小贴士（按优先顺序；只出第一条没看过的）。 */
export function detectTips(game: GameState, selfId: string): string[] {
  const ids: string[] = [];
  for (const event of game.events) {
    if (event.type === "TilesTaken" && event.player === selfId && event.tookMarker) ids.push("marker");
    if (event.type === "TilesPlaced" && event.player === selfId && event.lineIndex !== null && event.floorCount > 0) ids.push("overflow");
    if (event.type === "WallTiled" && event.player === selfId) ids.push("wall-scored");
    if (event.type === "FloorPenalty" && event.player === selfId) ids.push("floor-penalty");
    if (event.type === "RoundStarted" && game.players.some((player) => player.wall.some((row) => row.filter(Boolean).length === 4))) ids.push("near-end");
  }
  return ids;
}

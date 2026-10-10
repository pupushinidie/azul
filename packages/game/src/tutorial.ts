/**
 * 新手教程的剧本（花砖物语）。
 *
 * 教程在浏览器里直接跑规则引擎，不连服务器。开局是摆好的一局「后半段」：两人局，这一轮已经拿过几手，
 * 墙上已经有砖，所以一轮之内就能讲完拿砖、中心区和起始标记、放不下掉地板、铺墙计分、地板扣分，
 * 并且咕噜一号会在这一轮铺满一整横行，让游戏结束、算终局奖励。对手按剧本走，这一局不会用到随机数
 * （下一轮才会补砖），所以剧情一定这样发生。剧本走完开一局新的练习局，对手交给人机。
 *
 * 每一步写三件事：咕噜嘎说什么（say / note）、高亮哪个元素（anchor，对应网页里的 data-tutorial="…"）、
 * 等玩家做什么（do 步骤的 expect）。这款游戏要「先点砖、再点放哪」，所以 do 步骤带 then：
 * 界面上选中了砖（selection）时，高亮挪到要放的那条图案行。
 */
import { createGame, legalActions } from "./engine.js";
import { COLORS, type Color, type GameCommand, type GameState, type LineIndex, type PatternLine } from "./types.js";

/** 咕噜嘎的表情。 */
export type TutorialFace = "base" | "happy" | "surprised" | "think";

interface StepBase {
  readonly id: string;
  /** 侧栏「新手教程」进度里这一课叫什么；没有就不单独列。 */
  readonly lesson?: string;
  /** 主句（24px），一句话说清这一步。 */
  readonly say: string;
  /** 补充说明（12px）。 */
  readonly note?: string;
  /** 触屏设备上换成这句说明。 */
  readonly noteTouch?: string;
  /**
   * 高亮哪个元素：网页里 data-tutorial 的值。
   * 固定的有 supply、center、players、hint；一类里的某一个带参数：
   * final:<玩家>（结算框里那一行）、factory:<下标>、board:<玩家>、lines:<玩家>、line:<玩家>:<行>、wall:<玩家>、wall-row:<玩家>:<行>、
   * wall:<玩家>:<行>:<列>、floor:<玩家>。
   */
  readonly anchor?: string;
  readonly face?: TutorialFace;
}

/** 「先选再放」的后续高亮：界面上的选择变成 selection 时，高亮换成 anchor。 */
export interface TutorialFollowUp {
  /** 网页 GameBoard 报出来的当前选择，例如 picked:factory:1:yellow、picked:center:red。 */
  readonly selection: string;
  readonly anchor: string;
}

export type TutorialStep =
  /** 讲解：玩家点「下一步」继续。finale 是最后一步（接练习局或结束）。 */
  | (StepBase & { readonly kind: "info"; readonly finale?: boolean })
  /** 等玩家做这一步；做别的会被拦下。 */
  | (StepBase & { readonly kind: "do"; readonly expect: GameCommand; readonly then?: readonly TutorialFollowUp[] })
  /** 对手按剧本自动走这几步，牌桌不压暗。 */
  | (StepBase & { readonly kind: "watch"; readonly moves: readonly GameCommand[] });

export const TUTORIAL_SELF = "p1";
export const TUTORIAL_RIVALS = [{ id: "p2", name: "咕噜一号" }] as const;
const RIVAL = TUTORIAL_RIVALS[0].id;

/** 这一步之前不弹结算框（剧本里先讲铺墙计分，再看结算框里的终局奖励）。 */
export const TUTORIAL_FINAL_STEP = "bonus";

const take = (source: GameCommand["source"], color: Color, target: GameCommand["target"]): GameCommand => ({ type: "TAKE", source, color, target });
const line = (index: LineIndex) => ({ kind: "line", index }) as const;

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    kind: "info", id: "goal", lesson: "目标", anchor: `board:${TUTORIAL_SELF}`,
    say: "这是你的玩家板：把花砖铺上右边的墙来得分。",
    note: "这局已经打到后半段，咕噜嘎带你走完最后一轮。游戏结束时分数最高的人赢。",
  },
  {
    kind: "info", id: "supply", lesson: "工厂", anchor: "supply",
    say: "上面一个个圆盘是工厂，右边是中心区。",
    note: "每轮开始时每个工厂摆 4 块砖。轮到你时，从一个工厂或中心区拿走一种颜色的全部砖。",
  },
  {
    kind: "do", id: "take-factory", lesson: "拿砖", anchor: "factory:1",
    expect: take({ kind: "factory", index: 1 }, "yellow", line(1)),
    then: [{ selection: "picked:factory:1:yellow", anchor: `line:${TUTORIAL_SELF}:1` }],
    say: "点亮着的工厂里的黄砖，再点第 2 条图案行。",
    note: "这个工厂的 2 块黄砖会一起拿走，正好放满第 2 条图案行。",
  },
  {
    kind: "info", id: "to-center", anchor: "center",
    say: "工厂里剩下的砖都挪进了中心区。",
    note: "中心区的砖之后也能拿，同样一次拿走一种颜色的全部。",
  },
  {
    kind: "info", id: "lines", lesson: "图案行", anchor: `lines:${TUTORIAL_SELF}`, face: "think",
    say: "图案行从右往左填，第 1 行放 1 块，第 5 行放 5 块。",
    note: "一行只能放一种颜色；墙上这一横行已经有这种颜色了，就不能再放。",
  },
  {
    kind: "watch", id: "rival1",
    say: "轮到咕噜一号，看它拿什么。",
    moves: [take({ kind: "factory", index: 3 }, "white", line(1))],
  },
  {
    kind: "do", id: "take-center", lesson: "中心区", anchor: "center",
    expect: take({ kind: "center" }, "red", line(3)),
    then: [{ selection: "picked:center:red", anchor: `line:${TUTORIAL_SELF}:3` }],
    say: "这次从中心区拿：点红砖，再点第 4 条图案行。",
    note: "中心区的 3 块红砖一起拿走。",
  },
  {
    kind: "info", id: "marker", lesson: "起始标记", anchor: `floor:${TUTORIAL_SELF}`, face: "surprised",
    say: "这轮第一个从中心区拿砖的人，要把起始标记一起拿走。",
    note: "它放进你的地板行、要扣分；但下一轮由你先手。",
  },
  {
    kind: "watch", id: "rival2",
    say: "咕噜一号从中心区拿了蓝砖。",
    moves: [take({ kind: "center" }, "blue", line(2))],
  },
  {
    kind: "do", id: "overflow", lesson: "地板行", anchor: "factory:2",
    expect: take({ kind: "factory", index: 2 }, "black", line(2)),
    then: [{ selection: "picked:factory:2:black", anchor: `line:${TUTORIAL_SELF}:2` }],
    say: "拿 4 块黑砖，放进第 3 条图案行。",
    note: "这一行已经有 1 块黑砖，只剩 2 个空位。",
  },
  {
    kind: "info", id: "floor", anchor: `floor:${TUTORIAL_SELF}`, face: "think",
    say: "放不下的 2 块掉进了地板行。",
    note: "地板每格扣下面写的分：现在 3 块，这轮结束扣 1+1+2=4 分。也可以把整批砖直接放进地板。",
  },
  {
    kind: "watch", id: "rival3",
    say: "咕噜一号拿走最后一块砖，这一轮的砖拿完了。",
    moves: [take({ kind: "center" }, "white", line(0))],
  },
  {
    kind: "info", id: "tiling", lesson: "铺墙计分", anchor: `wall:${TUTORIAL_SELF}`,
    say: "砖拿完后，放满的图案行各把一块砖铺上墙。",
    note: "这一行剩下的砖收走；没放满的行原样留到下一轮。",
  },
  {
    kind: "info", id: "adjacent", anchor: `wall:${TUTORIAL_SELF}:1:2`, face: "happy",
    say: "这块黄砖横着连成 3 块、竖着连成 5 块：得 3+5=8 分。",
    note: "第 3 行那块黑砖旁边没有相连的砖，只得 1 分。所以砖要挨着铺。",
  },
  {
    kind: "info", id: "penalty", anchor: `floor:${TUTORIAL_SELF}`,
    say: "地板上 3 块扣了 4 分，地板也清空了。",
    note: "分数最低扣到 0。起始标记下一轮开始时放回中心区。",
  },
  {
    kind: "info", id: "end", lesson: "游戏结束", anchor: `wall-row:${RIVAL}:0`, face: "surprised",
    say: "咕噜一号铺满了一整横行，游戏结束！",
    note: "只要有人铺满一整横行，那一轮结束时游戏就结束。",
  },
  {
    kind: "info", id: TUTORIAL_FINAL_STEP, lesson: "终局奖励", anchor: `final:${TUTORIAL_SELF}`, face: "happy",
    say: "最后加终局奖励，你赢了！",
    note: "每条整横行 +2，整竖列 +7，一种颜色 5 块都上墙 +10。你铺满了第 3 列，+7。",
  },
  {
    kind: "info", id: "finale", finale: true, face: "happy",
    say: "你已经会玩了！和咕噜一号从头打一局吧。",
    note: "拿不准就点「提示」。真实对局里连续两次超时会转成人机托管，点「取消托管」就能收回。",
  },
];

/** 一行图案行（color 为 null 时空着）。 */
const pl = (color: Color | null = null, count = 0): PatternLine => ({ color, count });

/** 按 [行, 列] 列表造一面墙。 */
function wallOf(cells: readonly (readonly [number, number])[]): boolean[][] {
  const wall = Array.from({ length: 5 }, () => new Array<boolean>(5).fill(false));
  for (const [row, col] of cells) wall[row]![col] = true;
  return wall;
}

function players(selfName: string) {
  return [{ id: TUTORIAL_SELF, name: selfName }, ...TUTORIAL_RIVALS.map((rival) => ({ ...rival }))];
}

/**
 * 教程开局：两人局第 4 轮，这一轮已经拿过几手（第 1、5 个工厂空了，中心区有 2 块红砖，起始标记还在中心区）。
 * 你墙上第 3 列只差第 2 行的黄砖；咕噜一号第 1 横行只差白砖。
 */
export function createTutorialGame(selfName: string, seed = 20261010): GameState {
  const game = createGame(players(selfName), seed);
  const [self, rival] = game.players as [GameState["players"][number], GameState["players"][number]];
  game.round = 4;
  game.turn = 31;
  game.currentPlayer = 0;
  game.markerHolder = 1;
  game.firstMarkerInCenter = true;
  game.factories = [
    [],
    ["yellow", "yellow", "blue", "white"],
    ["black", "black", "black", "black"],
    ["red", "white", "white", "blue"],
    [],
  ];
  game.center = ["red", "red"];

  self.score = 26;
  self.wall = wallOf([[0, 0], [0, 1], [0, 2], [1, 1], [1, 3], [2, 2], [2, 3], [3, 2], [4, 2]]);
  self.patternLines = [pl(), pl(), pl("black", 1), pl(), pl()];
  self.floor = [];

  rival.score = 20;
  rival.wall = wallOf([[0, 0], [0, 1], [0, 2], [0, 3], [1, 1], [1, 2], [2, 1]]);
  rival.patternLines = [pl(), pl(), pl(), pl(), pl("yellow", 2)];
  rival.floor = [];

  // 布袋：每种颜色 20 块，减去桌上、图案行和墙上的，盒盖空着（这一局不会再补砖）
  const used = new Map<Color, number>(COLORS.map((color) => [color, 0]));
  const count = (color: Color, n = 1) => used.set(color, used.get(color)! + n);
  for (const tile of [...game.factories.flat(), ...game.center]) count(tile);
  for (const player of game.players) {
    player.patternLines.forEach((patternLine) => patternLine.color && count(patternLine.color, patternLine.count));
    player.wall.forEach((cells, row) => cells.forEach((filled, col) => filled && count(COLORS[(((col - row) % 5) + 5) % 5]!)));
  }
  game.bag = COLORS.flatMap((color) => new Array<Color>(game.config.tilesPerColor - used.get(color)!).fill(color));
  game.lid = [];
  return game;
}

/** 练习局：新开一局两人局，随机先手。 */
export function createPracticeGame(selfName: string, seed: number): GameState {
  return createGame(players(selfName), seed);
}

/** 两条命令是不是同一步。 */
export function sameCommand(a: GameCommand, b: GameCommand): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 这个锚点在这个局面里，界面上应该看得见吗（给剧本单测用，对应 GameBoard 的显示条件）。
 * viewer 是看界面的人（教程里就是你）。line:… 只在轮到你时能点，这里也只检查它存在、轮到你。
 */
export function anchorVisible(state: GameState, anchor: string, viewer: string): boolean {
  const myTurn = state.phase === "drafting" && state.players[state.currentPlayer]?.id === viewer;
  const [kind, arg, a, b] = anchor.split(":") as [string, string | undefined, string | undefined, string | undefined];
  const player = state.players.find((candidate) => candidate.id === arg);
  const inRange = (value: string | undefined) => value !== undefined && /^[0-4]$/.test(value);
  switch (kind) {
    case "supply":
    case "players":
      return true;
    case "center":
      return state.center.length > 0 || state.firstMarkerInCenter;
    case "final":
      // 结算框里某位玩家的那一行
      return state.phase === "finished" && player !== undefined;
    case "hint":
      return myTurn;
    case "factory": {
      const factory = state.factories[Number(arg)];
      return factory !== undefined && factory.length > 0;
    }
    case "board":
    case "lines":
    case "floor":
      return player !== undefined;
    case "wall-row":
      return player !== undefined && inRange(a);
    case "wall":
      return player !== undefined && (a === undefined || (inRange(a) && inRange(b)));
    case "line": {
      if (!player || !inRange(a)) return false;
      if (player.id !== viewer) return true;
      // 你自己的图案行：轮到你、这一行放得下才会亮
      return myTurn && legalActions(state, viewer).some((action) => action.target.kind === "line" && action.target.index === Number(a));
    }
    default:
      return false;
  }
}

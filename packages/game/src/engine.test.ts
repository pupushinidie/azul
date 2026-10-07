import { describe, expect, test } from "vitest";
import {
  applyCommand,
  createGame,
  createRng,
  floorPenalty,
  legalActions,
  lineError,
  measurePlacement,
  wallColor,
  wallColFor,
  type GameCommand,
  type GameState,
  type LineIndex,
} from "./index.js";

const PENALTIES = [-1, -1, -2, -2, -2, -3, -3] as const;

function wall(): boolean[][] {
  return Array.from({ length: 5 }, () => new Array<boolean>(5).fill(false));
}

function makeGame(n = 2): GameState {
  return createGame(
    Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `玩家${i + 1}` })),
    12345,
  );
}

function take(state: GameState, command: GameCommand): GameState {
  const playerId = state.players[state.currentPlayer]!.id;
  return applyCommand(state, playerId, command);
}

function factoryTake(index: number, color: string, target: GameCommand["target"]): GameCommand {
  return { type: "TAKE", source: { kind: "factory", index }, color: color as never, target };
}

describe("墙上计分（用例 1–3）", () => {
  test("空墙 (0,0) → +1", () => {
    const { score, h, v } = measurePlacement(wall(), 0, 0);
    expect(score).toBe(1);
    expect(h).toBe(1);
    expect(v).toBe(1);
  });

  test("墙有 (0,1)(0,2)，(0,0) 上墙 → 横向 3", () => {
    const w = wall();
    w[0]![1] = true;
    w[0]![2] = true;
    const { score, h } = measurePlacement(w, 0, 0);
    expect(h).toBe(3);
    expect(score).toBe(3);
  });

  test("墙有 (0,1)(1,0)，(0,0) 上墙 → 横 2 纵 2", () => {
    const w = wall();
    w[0]![1] = true;
    w[1]![0] = true;
    const { score, h, v } = measurePlacement(w, 0, 0);
    expect(h).toBe(2);
    expect(v).toBe(2);
    expect(score).toBe(4);
  });

  test("墙颜色布局与规格书表格一致", () => {
    // 行 1 = 蓝黄红黑白，行 2 = 白蓝黄红黑（向左循环）
    expect([0, 1, 2, 3, 4].map((c) => wallColor(0, c))).toEqual(["blue", "yellow", "red", "black", "white"]);
    expect([0, 1, 2, 3, 4].map((c) => wallColor(1, c))).toEqual(["white", "blue", "yellow", "red", "black"]);
    expect([0, 1, 2, 3, 4].map((c) => wallColor(4, c))).toEqual(["yellow", "red", "black", "white", "blue"]);
  });
});

describe("拿砖与放砖", () => {
  test("用例 4：工厂 [红红蓝黄] 拿红 → 得 2 红，蓝黄进中心", () => {
    const state = makeGame(2);
    state.factories = [["red", "red", "blue", "yellow"], [], [], [], []];
    state.center = [];
    state.currentPlayer = 0;

    const next = take(state, factoryTake(0, "red", { kind: "floor" }));

    expect(next.players[0]!.floor).toEqual(["red", "red"]);
    expect(next.factories[0]).toEqual([]);
    expect(next.center).toEqual(["blue", "yellow"]);
  });

  test("用例 5：拿到 4 红放第 2 行（容量 2 空）→ 2 进行 2 进地板", () => {
    const state = makeGame(2);
    state.factories = [["red", "red", "red", "red"], ["blue"], [], [], []];
    state.center = [];
    state.currentPlayer = 0;

    const next = take(state, factoryTake(0, "red", { kind: "line", index: 1 }));

    expect(next.players[0]!.patternLines[1]).toEqual({ color: "red", count: 2 });
    expect(next.players[0]!.floor).toEqual(["red", "red"]);
  });

  test("用例 6：第 3 行已有 1 蓝，放红非法", () => {
    const state = makeGame(2);
    state.factories = [["red", "red"], [], [], [], []];
    state.center = [];
    state.currentPlayer = 0;
    state.players[0]!.patternLines[2] = { color: "blue", count: 1 };

    expect(() => take(state, factoryTake(0, "red", { kind: "line", index: 2 }))).toThrow("已经放了别的颜色");
  });

  test("用例 7：墙第 2 行已有红，红放第 2 行非法", () => {
    const state = makeGame(2);
    state.factories = [["red", "red"], [], [], [], []];
    state.center = [];
    state.currentPlayer = 0;
    state.players[0]!.wall[1]![wallColFor(1, "red")] = true;

    expect(() => take(state, factoryTake(0, "red", { kind: "line", index: 1 }))).toThrow("已经");
  });

  test("用例 16：第 1 行已满未上墙，同色再放非法", () => {
    const state = makeGame(2);
    state.factories = [["red", "red"], [], [], [], []];
    state.center = [];
    state.currentPlayer = 0;
    state.players[0]!.patternLines[0] = { color: "red", count: 1 };

    expect(() => take(state, factoryTake(0, "red", { kind: "line", index: 0 }))).toThrow("满了");
  });

  test("lineError 空行放砖合法", () => {
    const state = makeGame(2);
    expect(lineError(state, state.players[0]!, 0, "blue")).toBeNull();
  });
});

describe("中心区与起始玩家标记", () => {
  test("用例 8：本轮首拿中心 → 起始标记进地板最左空格", () => {
    const state = makeGame(2);
    state.factories = [["blue"], [], [], [], []];
    state.center = ["red", "red"];
    state.firstMarkerInCenter = true;
    state.currentPlayer = 0;

    const next = take(state, { type: "TAKE", source: { kind: "center" }, color: "red", target: { kind: "floor" } });

    expect(next.players[0]!.floor).toEqual(["marker", "red", "red"]);
    expect(next.firstMarkerInCenter).toBe(false);
    expect(next.markerHolder).toBe(0);
  });
});

describe("地板溢出与扣分", () => {
  test("用例 9：地板已 6 格再掉 3 块 → 1 占第 7 格 2 进盒盖", () => {
    const state = makeGame(2);
    state.factories = [["red", "red", "red"], ["blue"], [], [], []];
    state.center = [];
    state.currentPlayer = 0;
    state.players[0]!.floor = ["blue", "blue", "blue", "blue", "blue", "blue"];

    const next = take(state, factoryTake(0, "red", { kind: "floor" }));

    expect(next.players[0]!.floor).toHaveLength(7);
    expect(next.lid).toEqual(["red", "red"]);
  });

  test("用例 10：地板 3 格扣 −4，分数最低为 0", () => {
    expect(floorPenalty(PENALTIES, 3)).toBe(-4);

    const state = makeGame(2);
    state.factories = [["red"], [], [], [], []];
    state.center = [];
    state.firstMarkerInCenter = false;
    state.currentPlayer = 0;
    state.players[0]!.score = 2;
    state.players[0]!.floor = ["blue", "blue"]; // 拿 1 红后共 3 格

    const next = take(state, factoryTake(0, "red", { kind: "floor" }));

    expect(next.players[0]!.score).toBe(0);
  });
});

describe("补砖与开新轮", () => {
  test("用例 11：布袋只剩 2 块，补砖时盒盖倒回继续", () => {
    const state = makeGame(2);
    state.bag = ["blue", "yellow"];
    state.lid = new Array(20).fill("red") as never;
    state.factories = [["red"], [], [], [], []];
    state.center = [];
    state.firstMarkerInCenter = false;
    state.currentPlayer = 0;

    const next = take(state, factoryTake(0, "red", { kind: "floor" }));

    expect(next.round).toBe(2);
    // 布袋 2 块抽完 → 盒盖倒回继续抽，5 厂都能补满。
    expect(next.factories.every((f) => f.length === 4)).toBe(true);
  });

  test("用例 12：布袋和盒盖都空 → 用现有砖开轮，部分工厂为空", () => {
    const state = makeGame(2);
    state.bag = [];
    state.lid = [];
    state.factories = [["red"], [], [], [], []];
    state.center = [];
    state.firstMarkerInCenter = false;
    state.currentPlayer = 0;

    const next = take(state, factoryTake(0, "red", { kind: "floor" }));

    expect(next.round).toBe(2);
    expect(next.factories.some((f) => f.length < 4)).toBe(true);
  });
});

describe("终局", () => {
  test("用例 13：有人上墙后完成一横排 → 游戏结束", () => {
    const state = makeGame(2);
    state.factories = [["red"], [], [], [], []];
    state.center = [];
    state.firstMarkerInCenter = false;
    state.currentPlayer = 0;
    // 玩家 0 第 1 行放蓝，墙第 1 行除蓝格外都已填满
    state.players[0]!.patternLines[0] = { color: "blue", count: 1 };
    state.players[0]!.wall[0] = [false, true, true, true, true];

    const next = take(state, factoryTake(0, "red", { kind: "floor" }));

    expect(next.phase).toBe("finished");
    expect(next.players[0]!.wall[0]).toEqual([true, true, true, true, true]);
    expect(next.finalResult).toBeDefined();
  });

  test("用例 14：1 横排 + 1 竖列 + 1 色集齐 → 奖励 +19", () => {
    const state = makeGame(2);
    state.factories = [["red"], [], [], [], []];
    state.center = [];
    state.firstMarkerInCenter = false;
    state.currentPlayer = 0;
    state.players[0]!.wall = [
      [true, true, true, true, true],
      [true, true, false, false, false],
      [true, false, true, false, false],
      [true, false, false, true, false],
      [true, false, false, false, true],
    ];
    state.players[1]!.wall = [
      [true, true, true, true, true],
      [false, false, false, false, false],
      [false, false, false, false, false],
      [false, false, false, false, false],
      [false, false, false, false, false],
    ];
    state.players[0]!.score = 0;
    state.players[1]!.score = 0;

    const next = take(state, factoryTake(0, "red", { kind: "floor" }));

    const p0 = next.finalResult!.scores.find((s) => s.player === "p1")!;
    expect(p0.rows).toBe(1);
    expect(p0.columns).toBe(1);
    expect(p0.colors).toBe(1);
    expect(p0.bonus).toBe(19);
  });

  test("用例 15：两人同分，横排 2 比 1 判胜", () => {
    const state = makeGame(2);
    state.factories = [["red"], [], [], [], []];
    state.center = [];
    state.firstMarkerInCenter = false;
    state.currentPlayer = 0;
    state.players[0]!.wall = [
      [true, true, true, true, true],
      [true, true, true, true, true],
      [false, false, false, false, false],
      [false, false, false, false, false],
      [false, false, false, false, false],
    ];
    state.players[1]!.wall = [
      [true, true, true, true, true],
      [false, false, false, false, false],
      [false, false, false, false, false],
      [false, false, false, false, false],
      [false, false, false, false, false],
    ];
    state.players[0]!.score = 0; // 终局 0 + 2×2 = 4
    state.players[1]!.score = 2; // 终局 2 + 2×1 = 4

    const next = take(state, factoryTake(0, "red", { kind: "floor" }));

    expect(next.phase).toBe("finished");
    expect(next.finalResult!.winners).toEqual(["p1"]);
  });
});

describe("随机整局模拟", () => {
  test("各人数下随机对局都能正常结束", () => {
    for (const n of [2, 3, 4]) {
      for (let i = 0; i < 30; i += 1) {
        const seed = 1000 * n + i;
        let state = createGame(
          Array.from({ length: n }, (_, k) => ({ id: `p${k + 1}`, name: `玩家${k + 1}` })),
          seed,
        );
        const rng = createRng(seed * 7 + 1);
        let guard = 0;
        while (state.phase !== "finished" && guard < 3000) {
          const pid = state.players[state.currentPlayer]!.id;
          const actions = legalActions(state, pid);
          expect(actions.length).toBeGreaterThan(0);
          state = applyCommand(state, pid, actions[rng.int(actions.length)]!);
          guard += 1;
        }
        expect(state.phase).toBe("finished");
        for (const player of state.players) expect(player.score).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

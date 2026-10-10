import { describe, expect, it } from "vitest";
import { botCommand } from "./bot.js";
import { apply, legalActions, redactGameForViewer } from "./engine.js";
import { createRng } from "./rng.js";
import {
  anchorVisible,
  createPracticeGame,
  createTutorialGame,
  sameCommand,
  TUTORIAL_FINAL_STEP,
  TUTORIAL_SELF,
  TUTORIAL_STEPS,
} from "./tutorial.js";
import { COLORS, type GameState } from "./types.js";

const actor = (game: GameState) => game.players[game.currentPlayer]!.id;
const seat = (game: GameState, id: string) => game.players.find((player) => player.id === id)!;

/** 按剧本走到第 upTo 步之前（不含），返回那时的局面。 */
function playScript(upTo = TUTORIAL_STEPS.length): GameState {
  const rng = createRng(1);
  let game = createTutorialGame("小蒲");
  for (const step of TUTORIAL_STEPS.slice(0, upTo)) {
    if (step.kind === "do") game = apply(game, TUTORIAL_SELF, step.expect, rng).state;
    if (step.kind === "watch") for (const move of step.moves) game = apply(game, actor(game), move, rng).state;
  }
  return game;
}

const stepIndex = (id: string) => TUTORIAL_STEPS.findIndex((step) => step.id === id);

/** 每种颜色 20 块：布袋 + 盒盖 + 工厂 + 中心 + 图案行 + 地板 + 墙。 */
function tileCounts(game: GameState): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(COLORS.map((color) => [color, 0]));
  for (const tile of [...game.bag, ...game.lid, ...game.factories.flat(), ...game.center]) counts[tile]! += 1;
  for (const player of game.players) {
    for (const line of player.patternLines) if (line.color) counts[line.color]! += line.count;
    for (const tile of player.floor) if (tile !== "marker") counts[tile]! += 1;
    player.wall.forEach((cells, row) => cells.forEach((filled, col) => {
      if (filled) counts[COLORS[(((col - row) % 5) + 5) % 5]!]! += 1;
    }));
  }
  return counts;
}

describe("新手教程剧本", () => {
  it("开局摆法：每种颜色正好 20 块，轮到你，起始标记在中心区", () => {
    const game = createTutorialGame("小蒲");
    expect(Object.values(tileCounts(game))).toEqual([20, 20, 20, 20, 20]);
    expect(actor(game)).toBe(TUTORIAL_SELF);
    expect(game.firstMarkerInCenter).toBe(true);
    expect(game.factories).toHaveLength(5);
  });

  it("从头走到尾：每一步要你做的都合法、轮到的是对的人，高亮的东西在界面上看得见", () => {
    let game = createTutorialGame("小蒲");
    const rng = createRng(1);
    for (const step of TUTORIAL_STEPS) {
      if (step.anchor) expect(anchorVisible(game, step.anchor, TUTORIAL_SELF), `「${step.id}」高亮的 ${step.anchor} 看不见`).toBe(true);
      if (step.kind === "do") {
        expect(actor(game), `「${step.id}」不是轮到你`).toBe(TUTORIAL_SELF);
        expect(legalActions(game, TUTORIAL_SELF).some((action) => sameCommand(action, step.expect)), `「${step.id}」不合法`).toBe(true);
        for (const follow of step.then ?? []) expect(anchorVisible(game, follow.anchor, TUTORIAL_SELF), `「${step.id}」后续高亮 ${follow.anchor} 看不见`).toBe(true);
        game = apply(game, TUTORIAL_SELF, step.expect, rng).state;
      }
      if (step.kind === "watch") {
        for (const move of step.moves) {
          expect(actor(game), `「${step.id}」里轮到了你`).not.toBe(TUTORIAL_SELF);
          game = apply(game, actor(game), move, rng).state;
        }
      }
    }
    expect(game.phase).toBe("finished");
  });

  it("关键的几幕一定发生：剩砖进中心、拿到起始标记、2 块掉地板、8 分那块砖、咕噜一号铺满横行、终局 +7", () => {
    const afterFactory = playScript(stepIndex("take-factory") + 1);
    expect(seat(afterFactory, TUTORIAL_SELF).patternLines[1]).toEqual({ color: "yellow", count: 2 });
    expect([...afterFactory.center].sort()).toEqual(["blue", "red", "red", "white"]);

    const afterCenter = playScript(stepIndex("take-center") + 1);
    expect(seat(afterCenter, TUTORIAL_SELF).floor).toEqual(["marker"]);
    expect(seat(afterCenter, TUTORIAL_SELF).patternLines[3]).toEqual({ color: "red", count: 3 });
    expect(afterCenter.firstMarkerInCenter).toBe(false);

    const afterOverflow = playScript(stepIndex("overflow") + 1);
    expect(seat(afterOverflow, TUTORIAL_SELF).floor).toEqual(["marker", "black", "black"]);
    expect(seat(afterOverflow, TUTORIAL_SELF).patternLines[2]).toEqual({ color: "black", count: 3 });

    // 咕噜一号拿走最后一块砖：铺墙、扣地板、游戏结束
    const end = playScript(stepIndex("rival3") + 1);
    expect(end.phase).toBe("finished");
    const tiled = end.events.filter((event) => event.type === "WallTiled" && event.player === TUTORIAL_SELF);
    expect(tiled).toMatchObject([
      { row: 1, col: 2, color: "yellow", h: 3, v: 5, gained: 8 },
      { row: 2, col: 0, color: "black", h: 1, v: 1, gained: 1 },
    ]);
    expect(end.events).toContainEqual({ type: "FloorPenalty", player: TUTORIAL_SELF, penalty: -4, scoreBefore: 35, scoreAfter: 31 });
    expect(seat(end, TUTORIAL_SELF).floor).toEqual([]);
    expect(seat(end, "p2").wall[0]).toEqual([true, true, true, true, true]);
    // 你：26 + 8 + 1 − 4 = 31，铺满第 3 列 +7 = 38；咕噜一号：20 + 5 + 5 = 30，整横行 +2 = 32
    expect(end.finalResult!.scores).toEqual([
      { player: TUTORIAL_SELF, score: 38, rows: 0, columns: 1, colors: 0, bonus: 7 },
      { player: "p2", score: 32, rows: 1, columns: 0, colors: 0, bonus: 2 },
    ]);
    expect(end.finalResult!.winners).toEqual([TUTORIAL_SELF]);
    expect(Object.values(tileCounts(end))).toEqual([20, 20, 20, 20, 20]);
  });

  it("剧本本身：步骤 id 不重复，最后一步是唯一的收尾，说明文字不空、不太长，结算框那一步在游戏结束之后", () => {
    const ids = TUTORIAL_STEPS.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
    const finales = TUTORIAL_STEPS.filter((step) => step.kind === "info" && step.finale);
    expect(finales).toHaveLength(1);
    expect(TUTORIAL_STEPS.at(-1)).toBe(finales[0]);
    for (const step of TUTORIAL_STEPS) {
      expect(step.say.trim().length).toBeGreaterThan(0);
      expect(step.say.length, step.id).toBeLessThanOrEqual(32);
      // 补充最多两句
      expect((step.note ?? "").split("。").filter((part) => part.trim()).length, step.id).toBeLessThanOrEqual(2);
    }
    expect(stepIndex(TUTORIAL_FINAL_STEP)).toBeGreaterThan(stepIndex("rival3"));
  });

  it("剧本走完开练习局：两家都交给人机，200 局都能正常打完", () => {
    const stuck: string[] = [];
    for (let seed = 1; seed <= 200; seed += 1) {
      const rng = createRng(seed);
      let game = createPracticeGame("小蒲", seed);
      let moves = 0;
      while (game.phase === "drafting" && moves < 400) {
        const id = actor(game);
        const command = botCommand(redactGameForViewer(game, id), id);
        if (!command) break;
        game = apply(game, id, command, rng).state;
        moves += 1;
      }
      if (game.phase !== "finished" || !game.finalResult) stuck.push(`第 ${seed} 局（${moves} 步）`);
    }
    expect(stuck).toEqual([]);
  }, 60_000);
});

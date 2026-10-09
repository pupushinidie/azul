import { describe, expect, it } from "vitest";
import { botCommand } from "./bot.js";
import { applyCommand, createGame, legalActions, redactGameForViewer } from "./engine.js";
import type { GameState } from "./types.js";

function newGame(count: number, seed: number): GameState {
  return createGame(Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, name: `玩家${index + 1}` })), seed);
}

/** p1 行动、桌上只有给定工厂和中心区的局面。 */
function position(factories: GameState["factories"], center: GameState["center"] = []): GameState {
  const game = newGame(2, 1);
  game.currentPlayer = 0;
  game.factories = factories;
  game.center = center;
  game.firstMarkerInCenter = false;
  return game;
}

describe("人机", () => {
  it("没轮到它时不行动", () => {
    const game = newGame(2, 3);
    const idle = game.players.find((_, index) => index !== game.currentPlayer)!;
    expect(botCommand(game, idle.id)).toBeNull();
  });

  it("全由人机打的 200 局都正常打完，每一步都是合法动作", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      let game = newGame(2 + (seed % 3), seed);
      let steps = 0;
      while (game.phase === "drafting") {
        steps += 1;
        expect(steps).toBeLessThan(1000);
        const playerId = game.players[game.currentPlayer]!.id;
        const command = botCommand(redactGameForViewer(game, playerId), playerId)!;
        expect(legalActions(game, playerId)).toContainEqual(command);
        game = applyCommand(game, playerId, command);
      }
      expect(game.finalResult?.winners.length).toBeGreaterThan(0);
    }
  }, 60_000);

  it("能正好填满一条图案行就填满，不往地板扔", () => {
    // 工厂里 3 块红：第 3 行（容量 3）正好放下
    const game = position([["red", "red", "red", "blue"]]);
    expect(botCommand(game, "p1")).toMatchObject({ color: "red", target: { kind: "line", index: 2 } });
  });

  it("贴着已有的砖上墙：同样能填满一行，选得分多的那一行", () => {
    const game = position([["blue", "yellow"]]);
    // 第 1 排墙已经有蓝（第 0 列），黄放第 1 排在第 1 列，紧挨着得 2 分；放别的行只得 1 分
    game.players[0]!.wall[0]![0] = true;
    expect(botCommand(game, "p1")).toMatchObject({ color: "yellow", target: { kind: "line", index: 0 } });
  });
});

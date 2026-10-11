import { useEffect, useRef } from "react";
import type { GameEvent, GameState } from "@azul/game";
import { sfx, synth, type SfxName } from "./gm-sound.js";

/**
 * 花砖物语的动作音效：对比前后两次对局快照（version 和这一步的 events），把刚发生的动作配上声音。
 * 自己的动作响亮，别人的减半（观战时都算别人的）。第一次拿到快照（进房间、重连、观战刚进来）不出声；
 * version 一下跳了好几步（重连补发）也不出声，只提示轮到你。
 *
 * - 拿砖 TilesTaken：几块瓷砖碰在一起的「嗒嗒」（块数 = 拿了几块），拿走起始标记再加一声木头标记
 * - 放进图案行 TilesPlaced：一声更沉的「嗒」；正好放满这一行加一声「叮」
 * - 掉进地板：招牌「砖掉地上」（一声闷响 + 往下滑），自己的才响亮
 * - 回合末贴墙 WallTiled：招牌「上墙」——每块砖一声，音一块比一块高，最后按自己这轮得分响得分声
 * - 地板扣分 FloorPenalty：bust
 * - 新一轮 RoundStarted：roundStart + 布袋倒砖补满工厂的哗啦声
 * - 超时 TurnTimedOut：自己的响 timeout
 * - 轮到你 yourTurn、自己走完交出回合 turnPassed、终局 gameOver(赢/输)
 */

/** 记一笔响了什么（只在开发时，给自测脚本看）。 */
function log(name: string) {
  if (import.meta.env.DEV) {
    const w = window as unknown as { __sfxLog?: string[] };
    (w.__sfxLog ??= []).push(name);
  }
}

function play<K extends SfxName>(name: K, ...args: Parameters<(typeof sfx)[K]>) {
  log(name);
  (sfx[name] as (...a: Parameters<(typeof sfx)[K]>) => void)(...args);
}

const later = (ms: number, fn: () => void) => window.setTimeout(fn, ms);

/** 招牌：砖掉在地板上——一声闷闷的磕碰，再往下一滑。 */
function floorDrop(mine: boolean, count: number) {
  log("floorDrop");
  const v = synth.level(mine);
  for (let i = 0; i < Math.min(count, 4); i += 1) {
    const at = i * 0.08;
    synth.noise({ at, duration: 0.05, volume: 0.32 * v, filter: "lowpass", freq: 700 * synth.jitter(0.15) });
    synth.tone(300 * synth.jitter(), { at, duration: 0.08, volume: 0.14 * v, type: "triangle" });
  }
  synth.tone(392, { at: 0.06, duration: 0.3, volume: 0.1 * v, type: "triangle", glideTo: 220 });
}

/** 一条图案行正好放满。 */
function lineFull(mine: boolean) {
  log("lineFull");
  synth.tone(1319, { at: 0.12, duration: 0.16, volume: 0.1 * synth.level(mine), type: "triangle" });
}

/** 招牌：回合末一块块贴上墙，音一块比一块高。 */
function wallTile(mine: boolean, step: number) {
  log("wallTile");
  sfx.tile(mine, 1, 0.9 + step * 0.08);
  synth.tone(523 * Math.pow(1.122, step), { at: 0.01, duration: 0.14, volume: 0.07 * synth.level(mine), type: "triangle" });
}

/** 新一轮：布袋里的砖哗啦倒进工厂。 */
function bagPour() {
  log("bagPour");
  for (let i = 0; i < 10; i += 1) {
    const at = 0.25 + i * 0.045 + Math.random() * 0.02;
    synth.noise({ at, duration: 0.025, volume: 0.12, freq: 3000 * synth.jitter(0.25), q: 2 });
    synth.tone(1100 * synth.jitter(0.2), { at, duration: 0.04, volume: 0.04, type: "triangle" });
  }
}

export function useGameSfx(game: GameState, selfId: string) {
  const previous = useRef<GameState | null>(null);
  useEffect(() => {
    const prev = previous.current;
    previous.current = game;
    if (!prev || prev === game || prev.version === game.version) return;
    const nextIsMe = game.phase === "drafting" && game.players[game.currentPlayer]?.id === selfId && selfId !== "";
    // 新的一局（再来一局）或一下跳了好几步：动作不响，只提示轮到你
    if (game.version < prev.version || game.version - prev.version > 2) {
      if (nextIsMe) later(400, () => play("yourTurn"));
      return;
    }
    const mineOf = (id: string) => id !== "" && id === selfId;
    const events: readonly GameEvent[] = game.events;
    let t = 0;
    let actor: string | null = null;
    let timedOut = false;
    let tiled = 0;
    let myGain = 0;
    let anyGain = 0;
    let myPenalty = false;
    let otherPenalty = false;
    let roundStarted = false;
    let ended: GameEvent | null = null;
    for (const event of events) {
      switch (event.type) {
        case "TurnTimedOut":
          timedOut = mineOf(event.player);
          break;
        case "TilesTaken": {
          actor = event.player;
          const mine = mineOf(event.player);
          play("tile", mine, Math.min(event.count, 4), 1.25);
          if (event.tookMarker) later(120, () => play("place", mine));
          t = 260;
          break;
        }
        case "TilesPlaced": {
          const mine = mineOf(event.player);
          if (event.lineIndex !== null) {
            later(t, () => play("tile", mine, 1, 0.85));
            if (event.lineCount === event.lineIndex + 1) later(t, () => lineFull(mine));
          }
          if (event.floorCount > 0) later(t + (event.lineIndex !== null ? 150 : 0), () => floorDrop(mine, event.floorCount));
          t += 300;
          break;
        }
        case "WallTiled": {
          const mine = mineOf(event.player);
          const step = tiled;
          tiled += 1;
          // 回合末先停一下，再一块块上墙；每块之间 140ms，最多排 10 块（再多就挤在一起）
          later(t + 250 + Math.min(step, 10) * 140, () => wallTile(mine, Math.min(step, 8)));
          if (mine) myGain += event.gained;
          anyGain += event.gained;
          break;
        }
        case "FloorPenalty":
          if (mineOf(event.player)) myPenalty = true;
          else otherPenalty = true;
          break;
        case "RoundStarted":
          roundStarted = true;
          break;
        case "GameEnded":
          ended = event;
          break;
      }
    }
    if (tiled > 0) t += 250 + Math.min(tiled, 10) * 140 + 120;
    if (myGain > 0) later(t, () => play("score", true, myGain >= 5));
    else if (anyGain > 0) later(t, () => play("score", false, false));
    if (tiled > 0 && (myGain > 0 || anyGain > 0)) t += 350;
    if (myPenalty) later(t, () => play("bust", true));
    else if (otherPenalty) later(t, () => play("bust", false));
    if (myPenalty || otherPenalty) t += 400;
    if (timedOut) later(t, () => play("timeout"));

    if (ended && ended.type === "GameEnded") {
      const won = selfId !== "" && ended.result.winners.includes(selfId);
      later(t + 600, () => play("gameOver", won));
      return;
    }
    if (roundStarted) {
      const at = t + 300;
      later(at, () => play("roundStart"));
      later(at, bagPour);
      t = at + 700;
    }
    if (nextIsMe) later(Math.max(t, 450), () => play("yourTurn"));
    else if (actor !== null && mineOf(actor)) later(Math.max(t, 450), () => play("turnPassed"));
  }, [game, selfId]);
}

export { play as playSfx };

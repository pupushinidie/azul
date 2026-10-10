/**
 * 花砖物语的新手教程：在浏览器里按剧本走一局（packages/game/src/tutorial.ts），
 * 牌桌就是真正对局的 GameBoard，咕噜嘎的对话框叠在上面；剧本走完开一局练习局，对手交给人机。
 * 不连服务器，不占房间；首页、等候房间都能进来（从等候房间进来时，房主开局会自动回到牌桌，见 App.tsx）。
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  apply,
  botCommand,
  createPracticeGame,
  createRng,
  createTutorialGame,
  DEFAULT_ROOM_ACCESS,
  redactGameForViewer,
  sameCommand,
  TUTORIAL_FINAL_STEP,
  TUTORIAL_RIVALS,
  TUTORIAL_SELF,
  TUTORIAL_STEPS,
  type GameCommand,
  type GameState,
  type LobbyMember,
  type LobbyRoomSnapshot,
  type Rng,
  type TutorialStep,
} from "@azul/game";
import GameBoard from "./GameBoard.js";
import { Coach, isTouchDevice, StepPips, type CoachView } from "./tutorial/Coach.js";
import { writeTutorial } from "./tutorial/storage.js";
import { useTutorial } from "./tutorial/useTutorial.js";
import { GAME_ID } from "./tutorialGame.js";

const SELF_MEMBER = "tutorial-self";
const TUTORIAL_CODE = "GULU01";
const FINAL_AT = TUTORIAL_STEPS.findIndex((step) => step.id === TUTORIAL_FINAL_STEP);

const randomSeed = () => Math.floor(Math.random() * 2 ** 32);

export default function TutorialMode({ name, brand, themeToggle, waitingRoom, onExit }: {
  /** 首页填过的昵称；没填叫「新玩家」。 */
  name: string;
  brand: ReactNode;
  themeToggle: ReactNode;
  /** 从等候房间点进来的：那个房间的房间码。 */
  waitingRoom?: string | undefined;
  onExit: () => void;
}) {
  const selfName = name.trim().length >= 2 ? name.trim() : "新玩家";
  // 剧本这一局不会补砖（用不到随机数）；练习局补砖洗牌用普通随机数
  const rng = useRef<Rng | null>(null);
  if (!rng.current) rng.current = createRng(randomSeed());
  // GameBoard 报上来的「先点砖、再点放哪」的当前选择，用来把高亮挪到要放的图案行
  const [selection, setSelection] = useState("none");

  const tutorial = useTutorial<GameState, GameCommand, TutorialStep>({
    steps: TUTORIAL_STEPS,
    self: TUTORIAL_SELF,
    start: () => createTutorialGame(selfName),
    restart: () => {
      const seed = randomSeed();
      rng.current = createRng(seed);
      return createPracticeGame(selfName, seed);
    },
    apply: (state, playerId, command) => apply(state, playerId, command, rng.current!).state,
    same: sameCommand,
    actor: (state) => (state.phase === "drafting" ? state.players[state.currentPlayer]!.id : null),
    bot: (state, playerId) => botCommand(redactGameForViewer(state, playerId), playerId),
    // 一轮结束（铺墙计分、补砖）后多等一会儿，让人看清楚
    botDelay: (state) => (state.events.some((event) => event.type === "RoundStarted") ? 2600 : 1300),
    watchDelay: () => 1800,
  });
  const { game, step, index, practice, flash } = tutorial;
  // 每开一局练习局，牌桌重新挂载（动作记录从头记）
  const [table, setTable] = useState(0);
  const newPractice = () => {
    setTable((value) => value + 1);
    tutorial.newPractice();
  };

  // 走到最后一步就算学完（之后首页不再邀请）
  useEffect(() => {
    if (practice || (step?.kind === "info" && step.finale)) writeTutorial(GAME_ID, "done");
  }, [practice, step?.id]);

  function leave() {
    writeTutorial(GAME_ID, "skipped");
    onExit();
  }

  const members = useMemo<LobbyMember[]>(() => [
    { id: SELF_MEMBER, playerId: TUTORIAL_SELF, name: selfName, isHost: false, connected: true },
    ...TUTORIAL_RIVALS.map((rival) => ({ id: `tutorial-${rival.id}`, playerId: rival.id, name: rival.name, isHost: false, connected: true, bot: true })),
  ], [selfName]);
  const room = useMemo<LobbyRoomSnapshot>(() => ({
    code: TUTORIAL_CODE,
    spectators: [],
    access: DEFAULT_ROOM_ACCESS,
    capacity: 2,
    status: "playing",
    members,
    chat: [],
    voice: [],
    game: redactGameForViewer(game, TUTORIAL_SELF),
  }), [game, members]);

  let view: CoachView | null = null;
  if (step) {
    const note = isTouchDevice() && step.noteTouch ? step.noteTouch : step.note;
    const finale = step.kind === "info" && step.finale === true;
    // 先点砖再点放哪：选中了砖，高亮就挪到要放的图案行
    let anchor = step.anchor ?? null;
    if (step.kind === "do" && step.then) {
      for (const follow of step.then) if (follow.selection === selection) anchor = follow.anchor;
    }
    view = {
      key: `${step.id}:${anchor ?? ""}`,
      say: step.say,
      ...(note ? { note } : {}),
      ...(flash ? { flash } : {}),
      anchor,
      focus: step.kind !== "watch",
      face: flash ? "surprised" : step.face ?? "base",
      footer: (
        <>
          <StepPips index={index} total={TUTORIAL_STEPS.length} />
          {!finale && <button className="tut-link" type="button" onClick={leave}>跳过教程</button>}
        </>
      ),
      actions: step.kind !== "info" ? null : finale ? (
        <>
          <button className="quiet-button" type="button" onClick={onExit}>结束教程</button>
          <button className="primary-button tut-main" type="button" onClick={newPractice}>开一局练习</button>
        </>
      ) : (
        <button className="primary-button tut-main" type="button" onClick={tutorial.next}>下一步 ▶</button>
      ),
    };
  }

  // 剧本进行中和练习局的侧栏挤法不一样（见 azul.css 的 .tut-script / .tut-practice）
  return (
    <div className={practice ? "tut-practice" : "tut-script"} style={{ display: "contents" }}>
      <GameBoard
        key={table}
        room={room}
        busy={false}
        error=""
        notice=""
        brand={brand}
        connection={
          <>
            <span className="connection-status online"><span className="connection-dot" />{practice ? "练习局" : "新手教程"}</span>
            <button className="quiet-button" type="button" onClick={practice ? onExit : leave}>退出教程</button>
          </>
        }
        themeToggle={themeToggle}
        chat={<Checklist index={index} practice={practice} waitingRoom={waitingRoom} />}
        onCommand={tutorial.onCommand}
        onRematch={() => undefined}
        onAuto={() => undefined}
        onDissolve={() => undefined}
        watchId={TUTORIAL_SELF}
        onWatch={() => undefined}
        onLeave={onExit}
        selfMemberId={SELF_MEMBER}
        mode={practice ? "practice" : "tutorial"}
        finalHidden={!practice && index < FINAL_AT}
        onSelection={setSelection}
        {...(practice ? {
          finalActions: (
            <>
              <button className="quiet-button" type="button" onClick={onExit}>结束教程</button>
              <button className="primary-button" type="button" onClick={newPractice}>再练一局</button>
            </>
          ),
        } : {})}
      />
      {view && <Coach view={view} />}
    </div>
  );
}

/** 侧栏（真实对局里是聊天）：剧本进行中列出这次学哪几样；练习局只留一句话。 */
function Checklist({ index, practice, waitingRoom }: { index: number; practice: boolean; waitingRoom: string | undefined }) {
  const lessons = TUTORIAL_STEPS.map((step, at) => ({ step, at })).filter(({ step }) => step.lesson);
  const done = lessons.filter(({ at }) => at < index).length;
  return (
    <section className="az-panel tut-checklist" aria-label="新手教程进度">
      {practice ? (
        <>
          <h3>练习局 <small>教程学完了</small></h3>
          <p>拿不准就点提示条上的「提示」（键盘 H），我告诉你我会怎么走。</p>
        </>
      ) : (
        <>
          <h3>新手教程 <small>{done}/{lessons.length}</small></h3>
          <ul>
            {lessons.map(({ step, at }) => {
              const state = at < index ? "done" : at === index ? "now" : "";
              return (
                <li key={step.id} className={state}>
                  <i aria-hidden="true">{state === "done" ? "✓" : state === "now" ? "▶" : "·"}</i>
                  {step.lesson}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {waitingRoom && <p>你还在房间 {waitingRoom} 里，房主一开局就自动回到牌桌。</p>}
    </section>
  );
}

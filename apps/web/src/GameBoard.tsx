import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  COLOR_NAMES,
  wallColor,
  wallColFor,
  type Color,
  type GameCommand,
  type GameEvent,
  type GameState,
  type LineIndex,
  type LobbyMember,
  type LobbyRoomSnapshot,
  type Player,
  type Source,
} from "@azul/game";
import { iconArt, tileArt } from "./art.js";
import GameRules from "./GameRules.js";
import { GameRoomMenu } from "./RoomExtras.js";
import { socket } from "./socket.js";
import { Coach, TipToast } from "./tutorial/Coach.js";
import { useFirstTimeTips } from "./tutorial/tips.js";
import { detectTips, GAME_ID, hintFor, TIPS, type Hint } from "./tutorialGame.js";

interface GameBoardProps {
  readonly room: LobbyRoomSnapshot;
  readonly busy: boolean;
  readonly error: string;
  readonly notice: string;
  readonly brand: ReactNode;
  readonly connection: ReactNode;
  /** 顶栏的白天 / 夜间切换按钮。 */
  readonly themeToggle: ReactNode;
  readonly chat: ReactNode;
  readonly onCommand: (command: GameCommand) => void;
  readonly onRematch: (accept: boolean) => void;
  /** 打开 / 取消自己的托管。 */
  readonly onAuto: (enabled: boolean) => void;
  readonly onDissolve: () => void;
  /** 观战时从这位玩家的座位看。 */
  readonly watchId: string;
  readonly onWatch: (playerId: string) => void;
  /** 观战的人离开。 */
  readonly onLeave: () => void;
  /** 自己在 room.members 里的 id；默认是 socket.id，教程里传固定值。 */
  readonly selfMemberId?: string;
  /**
   * online：真实对局（默认）；
   * tutorial：新手教程的剧本进行中（咕噜嘎在讲，不出提示和小贴士）；
   * practice：教程后的练习局（随时能看提示）。
   */
  readonly mode?: "online" | "tutorial" | "practice";
  /** 结算框里替代「再来一局」的按钮（练习局用）。 */
  readonly finalActions?: ReactNode;
  /** 先不弹结算框（教程里先讲完铺墙计分）。 */
  readonly finalHidden?: boolean;
  /** 界面上「先点砖、再点放哪」的当前选择（教程按它移动高亮），例如 picked:factory:1:yellow、picked:center:red。 */
  readonly onSelection?: (selection: string) => void;
}

/** 地板行 7 格各自的扣分。 */
const FLOOR_PENALTIES = [-1, -1, -2, -2, -2, -3, -3] as const;

const LINE_INDICES: readonly LineIndex[] = [0, 1, 2, 3, 4];
const SEAT_COLORS = ["#e8833a", "#3fb6c9", "#d65db1", "#9ccf4a"];

type Mode = { kind: "none" } | { kind: "picked"; source: Source; color: Color };

function useCountdown(room: LobbyRoomSnapshot): number | null {
  const [now, setNow] = useState(Date.now());
  const [anchor, setAnchor] = useState({ at: Date.now(), ms: room.turnRemainingMs });
  useEffect(() => setAnchor({ at: Date.now(), ms: room.turnRemainingMs }), [room]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);
  if (anchor.ms === undefined) return null;
  return Math.max(0, Math.ceil((anchor.ms - (now - anchor.at)) / 1000));
}

/** 一个颜色的砖此刻还能放进哪些图案行（地板行永远可以放）。 */
function validLines(player: Player, color: Color): LineIndex[] {
  const lines: LineIndex[] = [];
  for (const index of LINE_INDICES) {
    const line = player.patternLines[index]!;
    if (line.count >= index + 1) continue;
    if (line.color !== null && line.color !== color) continue;
    if (player.wall[index]![wallColFor(index, color)]) continue;
    lines.push(index);
  }
  return lines;
}

function describeEvent(event: GameEvent, name: (id: string) => string): string | null {
  switch (event.type) {
    case "TilesTaken": {
      const from = event.source.kind === "factory" ? `第 ${event.source.index + 1} 个工厂` : "中心区";
      const markerNote = event.tookMarker ? "，并拿走起始标记" : "";
      return `${name(event.player)} 从${from}拿走 ${event.count} 块${COLOR_NAMES[event.color]}砖${markerNote}`;
    }
    case "TilesPlaced": {
      // lineCount 是这条图案行放完后的总块数，不是这次放了几块
      if (event.lineIndex === null) return `${name(event.player)} 把 ${event.floorCount} 块${COLOR_NAMES[event.color]}砖放进地板行`;
      const overflow = event.floorCount > 0 ? `，多出的 ${event.floorCount} 块掉进地板` : "";
      return `${name(event.player)} 放进第 ${event.lineIndex + 1} 条图案行（现在 ${event.lineCount}/${event.lineIndex + 1}）${overflow}`;
    }
    case "WallTiled":
      return `${name(event.player)} 在第 ${event.row + 1} 行墙上落下${COLOR_NAMES[event.color]}砖，+${event.gained} 分`;
    case "FloorPenalty":
      return `${name(event.player)} 地板扣 ${-event.penalty} 分（${event.scoreBefore} → ${event.scoreAfter}）`;
    case "RoundStarted":
      return `第 ${event.round} 轮开始，${name(event.firstPlayer)} 先手`;
    case "GameEnded":
      return "游戏结束";
    case "TurnTimedOut":
      return `${name(event.player)} 超时，自动行动`;
    default:
      return null;
  }
}

function GameBoard({ room, busy, error, notice, brand, connection, themeToggle, chat, onCommand, onRematch, onAuto, onDissolve, watchId, onLeave, selfMemberId, mode: boardMode = "online", finalActions, finalHidden = false, onSelection }: GameBoardProps) {
  const game = room.game!;
  const member = room.members.find((candidate) => candidate.id === (selfMemberId ?? socket.id));
  // 观战的人没有座位：牌桌按 watchId 那位玩家的座位摆（me 就是他），但什么都不能点，也不叫「你」。
  const spectating = !member;
  const myId = member?.playerId ?? watchId;
  const selfId = spectating ? "" : myId;
  const isHost = member?.isHost ?? false;
  const me = game.players.find((player) => player.id === myId);
  const current = game.players[game.currentPlayer];
  const myTurn = !spectating && game.phase === "drafting" && current?.id === myId;
  const secondsLeft = useCountdown(room);
  // 「对局已开始」这类提示只留到第一步动作，之后不再一直挂在棋盘上
  const firstVersion = useRef(game.version);
  const shownNotice = game.version === firstVersion.current ? notice : "";

  const seatColor = (playerId: string) => SEAT_COLORS[Math.max(0, game.players.findIndex((player) => player.id === playerId)) % SEAT_COLORS.length]!;
  const nameOf = (playerId: string) => (playerId === selfId ? "你" : game.players.find((player) => player.id === playerId)?.name ?? "?");
  const memberOf = (playerId: string) => room.members.find((candidate) => candidate.playerId === playerId);
  // 托管中：人机替我行动，提示条上给一个「取消托管」
  const autoPlaying = member?.auto === true;

  const [mode, setMode] = useState<Mode>({ kind: "none" });
  useEffect(() => setMode({ kind: "none" }), [game.version]);
  const selection = mode.kind === "picked"
    ? `picked:${mode.source.kind === "factory" ? `factory:${mode.source.index}` : "center"}:${mode.color}`
    : "none";
  useEffect(() => onSelection?.(selection), [selection]);

  // 「提示」：只有自己和人机时（练习局，或一个人加人机开的房间）；让人机从你的位置算一步
  const botsOnly = room.members.every((candidate) => candidate.id === member?.id || candidate.bot);
  const canHint = !spectating && !autoPlaying && myTurn && (boardMode === "practice" || (boardMode === "online" && botsOnly));
  const [hint, setHint] = useState<{ version: number; hint: Hint } | null>(null);
  const shownHint = hint && hint.version === game.version && canHint ? hint.hint : null;
  const toggleHint = () => setHint((current) => (current && current.version === game.version ? null : { version: game.version, hint: hintFor(game, myId) }));
  useEffect(() => {
    if (!canHint) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (event.key.toLowerCase() === "h") toggleHint();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canHint, game.version]);
  const tips = useFirstTimeTips(GAME_ID, game.version, () => detectTips(game, myId), TIPS, boardMode === "online" && !spectating);

  // 动作记录：只在本页面累计，重连后从头记
  const [log, setLog] = useState<{ key: string; text: string }[]>([]);
  const loggedVersion = useRef(game.version);
  useEffect(() => {
    if (game.version === loggedVersion.current) return;
    loggedVersion.current = game.version;
    const lines = game.events
      .map((event, index) => ({ key: `${game.version}-${index}`, text: describeEvent(event, nameOf) }))
      .filter((line): line is { key: string; text: string } => line.text !== null);
    // 最新的一步排在最上面；同一步里的几条按发生顺序
    setLog((previous) => [...lines, ...previous].slice(0, 40));
  }, [game.version]);

  const canAct = myTurn && !busy;
  const myValidLines = mode.kind === "picked" && me ? validLines(me, mode.color) : [];

  function pick(source: Source, color: Color) {
    if (!canAct) return;
    setMode({ kind: "picked", source, color });
  }
  function place(target: GameCommand["target"]) {
    if (!canAct || mode.kind !== "picked") return;
    const { source, color } = mode;
    setMode({ kind: "none" });
    onCommand({ type: "TAKE", source, color, target });
  }

  let prompt = "";
  if (game.phase === "finished") prompt = "游戏结束";
  else if (autoPlaying) prompt = myTurn ? "托管中：人机正在替你走" : "托管中：轮到你时人机替你走";
  else if (!myTurn) prompt = `等待 ${current?.name ?? ""} 行动`;
  else if (mode.kind === "picked") prompt = `拿了${COLOR_NAMES[mode.color]}砖：点一条图案行或地板行放下`;
  else prompt = "轮到你了：点一个工厂或中心区里的一种颜色";

  return (
    <div className="az-screen">
      <header className="az-topbar">
        {brand}
        <div className="az-turn">
          <span>第 {game.round} 轮</span>
          {game.phase === "drafting" && current && (
            <span className={myTurn ? "az-turn-who mine" : "az-turn-who"}>
              <i style={{ background: seatColor(current.id) }} />
              {myTurn ? "轮到你" : `轮到 ${current.name}`}
              {secondsLeft !== null && <b className={secondsLeft <= 10 ? "az-timer low" : "az-timer"}>{secondsLeft}s</b>}
            </span>
          )}
        </div>
        <div className="az-topbar-right">
          {themeToggle}
          <GameRules />
          <GameRoomMenu room={room} />
          {/* 所有人的板子都摆在桌上，观战不用换座位，只要一个离开按钮。 */}
          {spectating && <button className="quiet-button" type="button" onClick={onLeave}>离开观战</button>}
          {isHost && <button className="quiet-button danger" type="button" onClick={onDissolve}>解散</button>}
          {connection}
        </div>
      </header>

      <section className="az-supply" aria-label="工厂与中心区" data-tutorial="supply">
        <div className="az-factories">
          {game.factories.map((factory, index) => (
            <div className={factory.length === 0 ? "az-factory empty" : "az-factory"} key={index} aria-label={`第 ${index + 1} 个工厂`} data-tutorial={`factory:${index}`}>
              {[0, 1, 2, 3].map((slot) => {
                const color = factory[slot];
                return color ? (
                  <button
                    key={slot}
                    type="button"
                    className={mode.kind === "picked" && mode.source.kind === "factory" && mode.source.index === index && mode.color === color ? "az-tile picked" : "az-tile"}
                    style={{ backgroundImage: `url(${tileArt[color]})` }}
                    disabled={!canAct}
                    onClick={() => pick({ kind: "factory", index }, color)}
                    aria-label={`${COLOR_NAMES[color]}砖`}
                  />
                ) : (
                  <span key={slot} className="az-slot" />
                );
              })}
            </div>
          ))}
        </div>
        <div className={game.center.length === 0 && !game.firstMarkerInCenter ? "az-center empty" : "az-center"} aria-label="中心区" data-tutorial="center">
          <span className="az-center-label">中心区</span>
          <div className="az-center-tiles">
            {game.firstMarkerInCenter && (
              <span
                className="az-marker"
                style={{ backgroundImage: `url(${iconArt.marker})` }}
                aria-label="起始玩家标记"
                title="起始玩家标记：拿走中心区的人要一并拿走"
              />
            )}
            {game.center.map((color, index) => (
              <button
                key={index}
                type="button"
                className={mode.kind === "picked" && mode.source.kind === "center" && mode.color === color ? "az-tile picked" : "az-tile"}
                style={{ backgroundImage: `url(${tileArt[color]})` }}
                disabled={!canAct}
                onClick={() => pick({ kind: "center" }, color)}
                aria-label={`${COLOR_NAMES[color]}砖`}
              />
            ))}
          </div>
          {game.remainingTiles !== undefined && <span className="az-bag-note">布袋 + 盒盖剩 {game.remainingTiles} 块</span>}
        </div>
      </section>

      <section className={myTurn ? "az-boards mine" : "az-boards"} aria-live="polite">
        <div className="az-prompt">
          <span>{prompt}</span>
          {canHint && (
            <span className="az-prompt-buttons">
              <button className={shownHint ? "quiet-button az-hint on" : "quiet-button az-hint"} type="button" data-tutorial="hint" onClick={toggleHint}>提示</button>
            </span>
          )}
          {mode.kind === "picked" && (
            <span className="az-prompt-buttons">
              <button className="quiet-button" type="button" onClick={() => setMode({ kind: "none" })}>取消</button>
            </span>
          )}
          {autoPlaying && game.phase === "drafting" && (
            <span className="az-prompt-buttons">
              <button className="quiet-button az-auto-cancel" type="button" onClick={() => onAuto(false)} data-tutorial="cancel-auto">取消托管</button>
            </span>
          )}
        </div>
        {(error || shownNotice) && <p className={error ? "az-feedback error" : "az-feedback"} role={error ? "alert" : "status"}>{error || shownNotice}</p>}

        <div className="az-board-grid">
          {game.players.map((player) => (
            <PlayerBoard
              key={player.id}
              player={player}
              me={player.id === selfId}
              bot={memberOf(player.id)?.bot === true}
              active={game.phase === "drafting" && game.currentPlayer === game.players.findIndex((p) => p.id === player.id)}
              markerHolder={game.markerHolder === game.players.findIndex((p) => p.id === player.id)}
              seatColor={seatColor(player.id)}
              interactive={myTurn && player.id === myId}
              mode={mode}
              validLines={player.id === myId ? myValidLines : []}
              onPickTarget={place}
            />
          ))}
        </div>
      </section>

      <aside className="az-side">
        <Players game={game} myId={selfId} seatColor={seatColor} memberOf={memberOf} />
        <section className="az-panel az-log">
          <h3>动作记录</h3>
          {log.length === 0 ? <p className="az-muted">还没有动作。</p> : (
            <ul>{log.map((line) => <li key={line.key}>{line.text}</li>)}</ul>
          )}
        </section>
        <div className="az-chat">{chat}</div>
      </aside>

      {game.phase === "finished" && !finalHidden && <FinalDialog game={game} room={room} myId={selfId} spectating={spectating} onRematch={onRematch} onLeave={onLeave} actions={finalActions} />}
      {shownHint && (
        <Coach
          bubble
          view={{
            key: `hint-${game.version}`,
            say: shownHint.say,
            ...(shownHint.note ? { note: shownHint.note } : {}),
            anchor: shownHint.anchor,
            focus: false,
            face: "think",
            actions: <button className="quiet-button" type="button" onClick={() => setHint(null)}>知道了</button>,
          }}
        />
      )}
      {tips.tip && <TipToast tip={tips.tip} onClose={tips.dismiss} onNever={tips.never} />}
    </div>
  );
}

// ---------- 玩家棋盘 ----------

function PlayerBoard({
  player, me, active, markerHolder, bot, seatColor, interactive, mode, validLines, onPickTarget,
}: {
  player: Player;
  me: boolean;
  active: boolean;
  markerHolder: boolean;
  /** 这个座位是人机。 */
  bot: boolean;
  seatColor: string;
  interactive: boolean;
  mode: Mode;
  validLines: LineIndex[];
  onPickTarget: (target: GameCommand["target"]) => void;
}) {
  const lineTargets = new Set(validLines);
  return (
    <div className={["az-board", me ? "me" : "", active ? "active" : ""].join(" ")} data-tutorial={`board:${player.id}`}>
      <div className="az-board-head">
        <i className="az-seat" style={{ background: seatColor }} />
        <strong>{player.name}{me && <small className="az-you">你</small>}{bot && <small className="az-bot">人机</small>}</strong>
        {markerHolder && <span className="az-marker-holder" title="下轮先手"><i style={{ backgroundImage: `url(${iconArt.marker})` }} />先手</span>}
        <span className="az-score">{player.score}</span>
      </div>

      <div className="az-board-body">
        <div className="az-pattern-lines" data-tutorial={`lines:${player.id}`}>
          {LINE_INDICES.map((index) => {
            const line = player.patternLines[index]!;
            const capacity = index + 1;
            const clickable = interactive && mode.kind === "picked" && lineTargets.has(index);
            return (
              <button
                key={index}
                type="button"
                className={["az-line", clickable ? "target" : "", interactive && mode.kind === "picked" ? "clickable" : ""].join(" ")}
                disabled={!clickable}
                onClick={() => onPickTarget({ kind: "line", index })}
                aria-label={`第 ${index + 1} 条图案行（容量 ${capacity}）`}
                data-tutorial={`line:${player.id}:${index}`}
              >
                {Array.from({ length: capacity }, (_, slot) => {
                  // 砖从靠墙的右端往左填
                  const color = slot >= capacity - line.count ? line.color : null;
                  return color ? (
                    <span key={slot} className="az-tile" style={{ backgroundImage: `url(${tileArt[color]})` }} />
                  ) : (
                    <span key={slot} className="az-slot" />
                  );
                })}
              </button>
            );
          })}
        </div>

        <div className="az-wall" aria-label="墙" data-tutorial={`wall:${player.id}`}>
          {Array.from({ length: 5 }, (_, row) => (
            <div className="az-wall-row" key={row} data-tutorial={`wall-row:${player.id}:${row}`}>
              {Array.from({ length: 5 }, (_, col) => {
                const filled = player.wall[row]![col];
                const targetColor = wallColor(row, col);
                return filled ? (
                  <span key={col} className="az-tile" style={{ backgroundImage: `url(${tileArt[targetColor]})` }} data-tutorial={`wall:${player.id}:${row}:${col}`} />
                ) : (
                  <span key={col} className="az-wall-cell" title={`${COLOR_NAMES[targetColor]}砖的位置`} data-tutorial={`wall:${player.id}:${row}:${col}`}>
                    <i style={{ backgroundImage: `url(${tileArt[targetColor]})` }} />
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        className={["az-floor", interactive && mode.kind === "picked" ? "target" : ""].join(" ")}
        disabled={!(interactive && mode.kind === "picked")}
        onClick={() => onPickTarget({ kind: "floor" })}
        aria-label="地板行"
        data-tutorial={`floor:${player.id}`}
        title="地板行（最多 7 格，要扣分）"
      >
        <span className="az-floor-label">地板</span>
        {FLOOR_PENALTIES.map((penalty, index) => {
          const tile = player.floor[index];
          return (
            <span className="az-floor-cell" key={index}>
              {tile === undefined ? <span className="az-slot" /> : (
                <span
                  className={tile === "marker" ? "az-marker" : "az-tile"}
                  style={{ backgroundImage: tile === "marker" ? `url(${iconArt.marker})` : `url(${tileArt[tile]})` }}
                />
              )}
              <small>{penalty}</small>
            </span>
          );
        })}
      </button>
    </div>
  );
}

// ---------- 玩家列表 ----------

function Players({ game, myId, seatColor, memberOf }: { game: GameState; myId: string; seatColor: (id: string) => string; memberOf: (id: string) => LobbyMember | undefined }) {
  const standings = [...game.players].sort((a, b) => b.score - a.score);
  return (
    <section className="az-panel az-players" data-tutorial="players">
      <h3>玩家 <small>按分数</small></h3>
      {standings.map((player) => {
        const active = game.phase === "drafting" && game.currentPlayer === game.players.findIndex((p) => p.id === player.id);
        const seated = memberOf(player.id);
        const offline = !seated?.connected;
        return (
          <div className={["az-player", active ? "active" : "", player.id === myId ? "me" : "", offline ? "offline" : ""].join(" ")} key={player.id}>
            <i className="az-seat" style={{ background: seatColor(player.id) }} />
            <strong>{player.name}{player.id === myId && <small className="az-you">你</small>}</strong>
            {seated?.bot && <small className="az-bot">人机</small>}
            {/* 离线的人也由人机代打 */}
            {!seated?.bot && (seated?.auto || offline) && <small className="az-auto">托管</small>}
            {offline && <small className="az-offline">离线</small>}
            <span className="az-score">{player.score}</span>
          </div>
        );
      })}
    </section>
  );
}

// ---------- 终局 ----------

function FinalDialog({ game, room, myId, spectating, onRematch, onLeave, actions }: {
  game: GameState;
  room: LobbyRoomSnapshot;
  myId: string;
  spectating: boolean;
  onRematch: (accept: boolean) => void;
  onLeave: () => void;
  /** 练习局：替代「再来一局」的按钮。 */
  actions?: ReactNode;
}) {
  const result = game.finalResult!;
  const accepted = room.rematch?.acceptedIds.includes(socket.id ?? "") ?? false;
  const standings = [...game.players].sort((a, b) => (result.scores.find((s) => s.player === b.id)?.score ?? b.score) - (result.scores.find((s) => s.player === a.id)?.score ?? a.score));
  return (
    <div className="gm-modal-backdrop" role="presentation">
      <section className="gm-panel az-result az-final" role="dialog" aria-modal="true" aria-labelledby="az-final-title">
        <h2 id="az-final-title">游戏结束</h2>
        <ol className="az-standings">
          {standings.map((player) => {
            const score = result.scores.find((s) => s.player === player.id);
            const winner = result.winners.includes(player.id);
            return (
              <li key={player.id} className={winner ? "winner" : ""} data-tutorial={`final:${player.id}`}>
                <span className="az-standing-name">{winner ? "🏆 " : ""}{player.name}{player.id === myId ? "（你）" : ""}</span>
                {score && (
                  <span className="az-score-detail">
                    <b>{score.score} 分</b>
                    <small>
                      {score.bonus > 0
                        ? `终局奖励 +${score.bonus}：横排 ${score.rows} 条 · 竖列 ${score.columns} 条 · 集齐 ${score.colors} 色`
                        : "没有终局奖励"}
                    </small>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        {spectating ? (
          <div className="az-rematch">
            <span>{room.rematch ? `等玩家决定要不要再来一局（${room.rematch.acceptedIds.length}/${room.members.length} 人同意）` : "对局结束"}</span>
            <div className="gm-panel-actions">
              <button className="quiet-button" type="button" onClick={onLeave}>离开观战</button>
            </div>
          </div>
        ) : actions ? (
          <div className="az-rematch">
            <span>练习局结束</span>
            <div className="gm-panel-actions">{actions}</div>
          </div>
        ) : room.rematch && (
          <div className="az-rematch">
            <span>再来一局？还剩 {Math.ceil(room.rematch.remainingMs / 1000)} 秒（{room.rematch.acceptedIds.length}/{room.members.length} 人同意）</span>
            <div className="gm-panel-actions">
              <button className="quiet-button" type="button" onClick={() => onRematch(false)}>离开</button>
              <button className="primary-button" type="button" disabled={accepted} onClick={() => onRematch(true)}>{accepted ? "等待其他人" : "再来一局"}</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default GameBoard;

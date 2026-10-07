import { useState } from "react";

/** 规则说明：用自己的话写，不照搬原版规则书。 */
function GameRules() {
  const [open, setOpen] = useState(false);

  return (
    <section className={open ? "game-rules open" : "game-rules"}>
      <button
        className="game-rules-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="game-rules-panel"
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">✦</span> 游戏规则
        <i aria-hidden="true">{open ? "收起 ▴" : "展开 ▾"}</i>
      </button>

      {open && (
        <div className="game-rules-panel" id="game-rules-panel">
          <div className="game-rules-block">
            <h3>目标</h3>
            <p>
              把五颜六色的花砖搬回自己的 5×5 墙面，按行、按列、按颜色拼出连续的图案。
              先拼满一整行墙面的人触发终局，最后分数最高者获胜（同分比完整横排数，仍同则并列）。
            </p>
          </div>

          <div className="game-rules-block">
            <h3>轮到你时</h3>
            <p>
              从任一<b>工厂圆盘</b>或中央<b>中心区</b>里，拿走<b>同一种颜色的所有砖</b>，
              再决定放去哪：
            </p>
            <ul>
              <li><b>图案行</b>：任选一行（第 1 行 1 格、第 2 行 2 格……），一行里只能放同一种颜色；放不下的溢出到地板行。</li>
              <li><b>地板行</b>：把砖直接丢进地板（要扣分，见下）。</li>
            </ul>
            <p>
              从工厂拿砖时，该工厂剩下的其他颜色砖都移到中心区；从中心区拿砖的人要一并拿走<b>起始玩家标记</b>（放进自己地板，成为下轮先手）。
            </p>
          </div>

          <div className="game-rules-block">
            <h3>贴墙与计分</h3>
            <ul>
              <li>一条图案行被填满后，最右边一块在<b>贴墙阶段</b>移到对应墙格，其余砖进盒盖。</li>
              <li>墙上落一块砖得 1 分，横着连着几块就加几分，竖着连着几块也加几分（孤立一块得 1 分）。</li>
              <li>地板行按顺序扣分：−1、−1、−2、−2、−2、−3、−3，分数最低扣到 0。</li>
              <li>所有工厂和中心区都空时这一轮结束：贴墙、扣地板分，然后盒盖倒回布袋开新轮。</li>
            </ul>
          </div>

          <div className="game-rules-block">
            <h3>终局奖励</h3>
            <ul>
              <li>每一条完整的<b>横排</b> +2 分。</li>
              <li>每一列完整的<b>竖列</b> +7 分。</li>
              <li>墙上集齐<b>同一种颜色 5 块</b> +10 分。</li>
            </ul>
          </div>

          <div className="game-rules-block">
            <h3>其他</h3>
            <ul>
              <li>每回合限时 60 秒，超时自动替你选一个损失最小的放法。掉线后用原昵称和房间码可以回到自己的座位。</li>
              <li>布袋和盒盖的顺序在服务器上，谁也看不到下一轮会补出什么。</li>
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

export default GameRules;

"""生成选图画廊：out/gallery.json + out/gallery.html。可以反复运行，生成过程中随时刷新。
本地查看：python -m http.server 8766 --directory art/out，然后打开 http://localhost:8766/gallery.html"""
from __future__ import annotations

import json
import shutil
import time

import pixellab

ART = pixellab.ART
OUT = ART / "out"


def files(prefix: str, folder: str = "style/ground") -> list[str]:
    return sorted(p.relative_to(OUT).as_posix() for p in (OUT / folder).glob(f"{prefix}-c[0-9].png"))


def image_item(item_id: str, title: str, note: str, sources: list[tuple[str, str, str]], recommended: str | None, **extra) -> dict:
    """sources: (候选编号, 图片路径, 说明)"""
    return {
        "id": item_id, "title": title, "note": note, "kind": "image", **extra,
        "candidates": [{"id": cid, "src": src, "label": label, **({"recommended": True} if cid == recommended else {})} for cid, src, label in sources],
    }


def round1() -> dict:
    camel_note = ("每只骆驼 8 个朝向，转地图时按视角自动换。每行从左到右：正面、右前、右、右后、背面、左后、左、左前"
                  "（左边三张用右边的水平翻转，保证左右一致）。\n选定后按这个画风出 5 只赛驼和 2 只疯骆驼，再给每个朝向做走路动画。")
    camels = [
        ("A", "style/strips/camelA-red.png", "红棕色整只上色（模型画成了双峰）"),
        ("A2", "style/strips/camelA2-red.png", "想要「漆成深红的木头玩具」，出来还是写实毛色、双峰"),
        ("B", "style/strips/camelB-red.png", "沙色单峰骆驼 + 队色鞍毯和流苏：颜色靠鞍毯区分"),
        ("C", "style/strips/camelC-red.png", "Q 版大头（棕色、双峰）"),
    ]
    tiles = [(f"{p.split('/')[-1][:-4]}", p, "") for p in files("tile") + files("tile2")]
    labels = {"tile-c3": "现在截图里用的这张：自带小砖纹，看不出一格一格", "tile2-c2": "单块石板、深色描边，格子之间分得清"}
    tiles = [(cid, src, labels.get(cid, "")) for cid, src, _ in tiles]
    boos = [(p.split('/')[-1][:-4], p, "") for p in files("boo") + files("boo2")]
    return {
        "round": "r1",
        "title": "沙丘赛驼 · 第一轮：定画风",
        "updated": time.strftime("%m-%d %H:%M"),
        "spent": pixellab.spent_usd(),
        "intro": ("规则引擎、服务器、2.5D 赛道都已经能玩了（截图是本地真实对局）。这一轮先定画风，定了再批量出全套。\n"
                  "每项点「选这张」，或者「都不满意，重画」并写备注。最后把页面底部那段文字复制给我。\n"
                  "最后两项是规格书没写清楚的规则，我先按「推荐」做了，你确认或改。"),
        "preview": [{"src": "style/shots/board-placeholder.png",
                     "caption": "现在的样子：骆驼暂时用一只红鞍毯样张加滤镜变色（所以颜色怪），赛道格是 tile-c3。拖动旋转、上下拖调角度、滚轮缩放。"},
                    {"src": "style/walk/walkB-east.gif",
                     "caption": "走路动画样张（B 画风朝右，8 帧）。骆驼在赛道上移动时播放，8 个朝向各做一套。"}],
        "items": [
            image_item("camel", "骆驼画风", camel_note, camels, "B", wide=True, scale=2),
            {"id": "crazy", "title": "疯骆驼（黑、白）长什么样", "kind": "choice",
             "note": "疯骆驼逆着跑、不参与排名，最好一眼看出和赛驼不一样。",
             "candidates": [
                 {"id": "1", "label": "一只黑毛、一只白毛的骆驼，不披鞍毯，样子邋遢一点", "recommended": True},
                 {"id": "2", "label": "和赛驼一样的沙色骆驼，只是披黑 / 白鞍毯"},
             ]},
            image_item("tile", "赛道格", "16 格每格一张，格号叠在左上角。", tiles, "tile2-c2"),
            image_item("sand", "赛道外的沙地", "整块地面重复铺。", [(p.split('/')[-1][:-4], p, "") for p in files("sand")], "sand-c2", scale=2),
            image_item("brick", "金字塔砖面", "金字塔是立体的（四个面），这张贴在面上重复铺。第一次的提示词画成了门洞，这两张是重画的。",
                       [(p.split('/')[-1][:-4], p, "") for p in files("brick2")], "brick2-c2"),
            image_item("cheer", "观众板 · 欢呼面（+1 格）", "立在格子上的一小群观众，骆驼停上来时会跳起来。", [(p.split('/')[-1][:-4], p, "") for p in files("cheer")], "cheer-c3"),
            image_item("boo", "观众板 · 嘘面（−1 格）", "这 6 张都不太像在喝倒彩（boo2-c1 竖的其实是大拇指）。\n我的建议：先定欢呼那张，再用 PixelLab 的局部修改把它改成「同一群人竖倒拇指、皱眉」，两面风格一致。同意就选「都不满意，重画」。", boos, None),
            {"id": "rule-flip", "title": "规则：观众板能不能原地翻面", "kind": "choice",
             "note": "规格书写的是「把它移到另一个合法格子并重新选朝向」，没说能不能留在原格只翻面。原样放回（同格同面）无论哪种都不允许，否则等于跳过回合。",
             "candidates": [
                 {"id": "可以", "label": "可以：同一格换个朝向也算一次行动（现在的做法）", "recommended": True},
                 {"id": "不可以", "label": "不可以：必须移到另一格"},
             ]},
            {"id": "rule-clamp", "title": "规则：终局下注扣钱、不够付时怎么算", "kind": "choice",
             "note": "规格书只规定了赛段结算「金币 = max(0, 原金币 + 本次净额)」。终局两个牌堆没说。\n例：0 金的玩家在冠军牌堆先押错一张（−1）、后押对一张（+5）。逐张算得 5；按牌堆算净额得 4。",
             "candidates": [
                 {"id": "按牌堆", "label": "冠军、垫底牌堆各算一次净额，不够付到 0（和赛段结算一致，现在的做法）", "recommended": True},
                 {"id": "逐张", "label": "逐张翻开逐张结算，像实体游戏一样，没钱时那张白扣"},
                 {"id": "合起来", "label": "两个牌堆合起来算一次净额"},
             ]},
        ],
    }


def round2() -> dict:
    """第二轮：场景升级后的整体效果 + 装饰、远景、疯骆驼、界面小图。推荐项就是现在牌桌上用的。"""
    props = "r2/props"

    def pick(item_id: str, title: str, note: str, recommended: str, scale: int = 3, **extra) -> dict:
        sources = [(p.split("/")[-1][:-4], p, "") for p in files(item_id, props)]
        return image_item(item_id, title, note, sources, recommended, scale=scale, **extra)

    return {
        "round": "r2",
        "title": "沙丘赛驼 · 第二轮：场景质感",
        "updated": time.strftime("%m-%d %H:%M"),
        "spent": pixellab.spent_usd(),
        "intro": ("场景改成了立体沙盘：有厚度的沙地和岩层侧面、凸起的石板赛道、带底座和金顶的金字塔、终点拱门、"
                  "一圈装饰（挡住赛道时自动半透明）、影子、扬沙、漂浮沙粒、跟着视角转的夕阳远景。\n"
                  "上面是改前 / 改后的真实截图，现在牌桌上用的就是每项标「推荐」的那张。想换哪张就点「选这张」，"
                  "都不满意就点「重画」写备注。最后把底部文字复制给我。"),
        "preview": [
            {"src": "style/shots/board-placeholder.png", "caption": "改前"},
            {"src": "r2/shots/after-default.png", "caption": "改后（默认视角）"},
            {"src": "r2/shots/after-rotated.png", "caption": "改后（右转 90°：挡在前面的棕榈自动变半透明）"},
            {"src": "r2/strips/walk-red.gif", "caption": "赛驼走路（5 种颜色共用这套动画）"},
            {"src": "r2/strips/walk-black.gif", "caption": "黑疯骆驼走路"},
            {"src": "r2/strips/walk-white.gif", "caption": "白疯骆驼走路"},
        ],
        "items": [
            image_item("team", "5 只赛驼", "用你选的 B 当底，只把鞍毯、笼头、流苏换成队色：形状和动画完全一样，像实体游戏里一模一样的骆驼棋子。"
                       "想要每只长得不一样就点「重画」。", [("换色", "r2/strips/team.png", "同一只骆驼换鞍毯颜色（现在的做法）")], "换色", wide=True, scale=3),
            image_item("crazy-black", "疯骆驼 · 黑", "模型画成了双峰（赛驼是单峰），正好一眼分出是疯骆驼。从左到右：正面、右前、右、右后、背面、左后、左、左前。",
                       [(n, f"r2/strips/crazy-black-{n}.png", "") for n in ("s11", "s23")], "s11", wide=True, scale=2),
            image_item("crazy-white", "疯骆驼 · 白", "", [(n, f"r2/strips/crazy-white-{n}.png", "") for n in ("s11", "s23")], "s11", wide=True, scale=2),
            image_item("backdrop", "远景", "转视角时远景跟着横向滚动，所以要能首尾无缝接上：把原图左右对调后重画了中间的接缝（三张是重画时的三个种子）。",
                       [(f"roll-c{i}", f"r2/seam/roll-c{i}-full.png", "") for i in (1, 2, 3)], "roll-c2", wide=True, scale=2),
            pick("strata", "沙盘侧面岩层", "", "strata-c2", scale=2),
            pick("palm", "棕榈", "", "palm-c1"),
            pick("tent", "帐篷", "", "tent-c2"),
            pick("stand", "看台", "", "stand-c2"),
            pick("obelisk", "方尖碑", "", "obelisk-c1"),
            pick("arch", "终点拱门", "竖在第 16 格和第 1 格之间，不跟镜头转（侧面看是薄的）。", "arch-c1"),
            pick("flag", "终点旗子", "", "flag-c1"),
            pick("brazier", "金字塔门口的火盆", "", "brazier-c1"),
            pick("rocks", "岩石", "", "rocks-c1"),
            pick("shrub", "灌木", "", "shrub-c2"),
            pick("coin", "金币图标", "", "coin-c1", scale=4),
            pick("pyramid-ticket", "金字塔票图标", "", "pyramid-ticket-c1", scale=4),
            pick("ticket", "赛段下注票", "票面上的骆驼剪影按队色换色，票值压在下面。", "ticket-c3"),
            pick("card-back", "终局卡背", "手里的终局卡和牌堆里别人押的牌都用它，外面一圈是队色。", "card-back-c2"),
            pick("partner", "合伙图标", "", "partner-c2", scale=4),
            pick("hero", "首页插画", "放在首页介绍文字下面。", "hero-c2", scale=2, wide=True),
        ],
    }


def round3() -> dict:
    """第三轮：终点拱门按他的意见（黑白的线太生硬）重画。"""
    sources = [
        ("arch-check-c1", "r3/arch-check-c1.png", "米色 + 浅橙方格旗布，保留终点方格的意思"),
        ("arch-check-c2", "r3/arch-check-c2.png", "条纹旗布，柱子偏暗"),
        ("arch-stripe-c1", "r3/arch-stripe-c1.png", "红黄条纹 + 流苏"),
        ("arch-stripe-c2", "r3/arch-stripe-c2.png", "深红挂布 + 金边（他选的，现在用的）"),
        ("arch-warm-c1", "r3/arch-warm-c1.png", "原来那张，黑白方格换成深赭和米色"),
    ]
    return {
        "round": "r3",
        "title": "沙丘赛驼 · 第三轮：终点拱门重画",
        "updated": time.strftime("%m-%d %H:%M"),
        "spent": pixellab.spent_usd(),
        "intro": ("你说终点拱门「黑白的线太生硬」。我理解成黑白方格太刺眼：拱门横幅重画成暖色，"
                  "地面上的终点线也从纯黑白改成了米色 + 深赭。上面是现在的样子（用的 arch-check-c1）。\n"
                  "如果你指的只是其中一处，或者想要别的样子，在备注里说。"),
        "preview": [{"src": "r3/shots/arch-stripe-c2.png", "caption": "现在的终点：你选的 arch-stripe-c2 + 米色深赭的终点线"}],
        "items": [image_item("arch", "终点拱门", "", sources, "arch-stripe-c2", scale=3)],
    }


ROUNDS = {"r1": round1, "r2": round2, "r3": round3}


if __name__ == "__main__":
    import sys

    OUT.mkdir(parents=True, exist_ok=True)
    build_round = ROUNDS[sys.argv[1] if len(sys.argv) > 1 else "r3"]
    (OUT / "gallery.json").write_text(json.dumps(build_round(), ensure_ascii=False, indent=1))
    shutil.copyfile(ART / "gallery.html", OUT / "gallery.html")
    print("gallery ok, spent", round(pixellab.spent_usd(), 4))

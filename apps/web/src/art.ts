import type { Color } from "@azul/game";

/**
 * 像素美术的地址。图片放在 public/art 下（PixelLab 生成，art/generate_azul.py 导出）。
 * 图片地址固定；换图后不会被浏览器缓存挡住，靠服务器给这些文件加 Cache-Control: no-cache。
 */
const ROOT = `${import.meta.env.BASE_URL}art/`;

/** 五种花砖的贴图地址。 */
export const tileArt: Record<Color, string> = {
  blue: `${ROOT}tiles/blue.png`,
  yellow: `${ROOT}tiles/yellow.png`,
  red: `${ROOT}tiles/red.png`,
  black: `${ROOT}tiles/black.png`,
  white: `${ROOT}tiles/white.png`,
};

/** 界面小图。 */
export const iconArt = {
  marker: `${ROOT}ui/marker.png`,
  hero: `${ROOT}ui/hero.png`,
};

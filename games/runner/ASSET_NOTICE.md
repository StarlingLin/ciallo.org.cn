# 当前素材记录

## 站点所有者提供的素材

- `muramasa-run.webp`：来自 `spritesheet.webp`，只保留第二行的 8 帧向右跑步动画，并缩放为 1152×156；
- `tatari-561.webp`、`tatari-602.webp`、`tatari-0-561.webp`、`tatari-0-602.webp`：四种随机祟神障碍物，统一缩放到 184 像素高；
- `death-shy.jpg`：普通死亡时替代原 explosion 的画面；
- `score-0721.gif`：正好在 721 分死亡时显示的动态表情；
- `darkness-bgm.ogg`：由 `10+闇に潜む影.wav` 压缩得到的循环背景音乐，OGG/Opus 约 40 kbit/s，SHA-256 为 `00E2844C86AAF37F67B7FF30D9227E123247D837EA0E5717BE751422871FCF0F`。

以上素材由站点所有者提供，其著作权或再分发许可未在本项目中独立核验。公开使用时应由站点所有者确认使用范围。

## 连续森林背景

最终文件：

```text
assets/images/forest-loop-v1.webp
```

- 尺寸：2048×768；
- SHA-256：`A771EF5172B17324403A48D86F30764CBF591DA5CB0BF81CE6E159C2B1B1FB27`；
- 生成模式：内置图片生成，`style-transfer` 用途；
- 参考图：`山_山の中２C.png`、`山_山の中１C.png`、`山_山道C.png`；
- 用途：横向循环的 2D 跑酷森林背景。

完整生成提示词：

```text
Use case: style-transfer
Asset type: seamless 2D side-scrolling runner game background panorama
Input images: three reference images for forest palette, foliage shapes, atmosphere, and moonlit lighting only
Primary request: Create an original, simplified 2D anime-game forest panorama inspired by the references, designed as a horizontally scrolling runner background.
Composition/framing: very wide 8:3 banner composition; strict side-view environment rather than a forward-facing road perspective; distant blue mountain and tree silhouettes, midground forest trunks and foliage, and a clear nearly-flat dark trail/ground band along the bottom 18 percent for a running character and obstacles.
Seamless requirement: the far left and far right edges must tile continuously when repeated side by side; match tree density, terrain height, color, lighting, and texture across both edges; avoid a unique object crossing either seam.
Lighting/mood: cool blue-green twilight forest, gentle moonlight shafts, mysterious but readable; keep the lower running lane darker and less detailed so foreground sprites remain clear.
Style/medium: polished 2D visual-novel / side-scrolling game background, simplified painterly layers, restrained detail suitable for continuous motion.
Constraints: full bleed, no frame, no border, no characters, no monsters, no animals, no buildings, no road vanishing point, no text, no logo, no watermark, no UI. Preserve only the references' broad visual mood; do not copy a single reference composition literally.
```

工作区保留的无损生成源文件：

```text
work/generated/runner-forest-loop-source.png
```

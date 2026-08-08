# Runner 素材与玩法调整说明

所有常用素材路径、尺寸、速度和碰撞参数都集中在 `game.config.js`。更换同类素材时通常不需要修改 `game.js`。

## 丛雨跑步精灵图

当前使用：

```text
assets/images/muramasa-run.webp
```

原始桌宠图是 8 列 × 11 行，每格 192×208 像素。站点版本已经只保留第二行，并缩放为 8 列 × 1 行、每格 144×156 像素，循环使用第 0～7 帧：

```javascript
player: {
    frameWidth: 144,
    frameHeight: 156,
    frameY: 0,
    walkFrames: [0, 1, 2, 3, 4, 5, 6, 7],
    jumpFrame: 3,
    drawWidth: 78,
    drawHeight: 85
}
```

`drawWidth`、`drawHeight` 控制显示尺寸；`hitbox` 以像素为单位向内收缩碰撞范围。更换体型差异较大的角色时，应同时调整这两组参数。

## 四种祟神障碍物

当前随机使用：

```text
assets/images/tatari-561.webp
assets/images/tatari-602.webp
assets/images/tatari-0-561.webp
assets/images/tatari-0-602.webp
```

四张图片统一按 `obstacle.drawHeight` 指定的高度绘制，宽度按原始宽高比自动计算。每个 `variant` 都有独立的比例碰撞框，适配图片周围较大的透明区域。

新增或替换障碍物时，在 `obstacle.variants` 中填写：

```javascript
{
    id: "唯一名称",
    image: "assets/images/文件名.webp",
    aspectRatio: 原始宽度 / 原始高度,
    hitbox: { left: 0.17, top: 0.38, right: 0.16, bottom: 0.06 }
}
```

每次生成障碍物会随机选择一个变体。

## 随机出现距离

障碍物不再按固定时间出现，而是按实际移动距离生成。速度提高后，留给玩家的反应时间会自然缩短，行为更接近 Google 小恐龙：

```javascript
obstacle: {
    firstGap: 470,
    minGap: 270,
    maxGap: 630
}
```

`firstGap` 是开局第一个障碍物的距离；之后每次在 `minGap` 与 `maxGap` 之间重新随机。

## 连续森林背景

当前背景：

```text
assets/images/forest-loop-v1.webp
```

背景会按 `background.scrollFactor` 持续横向滚动，并自动重复铺满画布。更换背景时建议使用宽幅横图，左右两端的颜色、地形高度和树木密度尽量接近，以减轻循环接缝。

背景的生成方式、参考图和完整提示词记录在 `ASSET_NOTICE.md`。

## 死亡画面与 721 彩蛋

普通死亡时，角色位置会显示：

```text
assets/images/death-shy.jpg
```

当死亡瞬间的整数分数正好为 `721` 时，覆盖层改为显示：

```text
assets/images/score-0721.gif
恭喜你，正好在0721分死亡！
```

本地预览可用以下地址直接验收两个分支；这个测试参数只在 `127.0.0.1`、`localhost` 和 `::1` 生效，正式域名会忽略它：

```text
/games/runner/?testDeathScore=721
/games/runner/?testDeathScore=720
```

## 背景音乐与音效

把音频放入：

```text
assets/audio/
```

并在 `game.config.js` 填写相对路径：

```javascript
audio: {
    bgm: "assets/audio/darkness-bgm.ogg",
    jump: "assets/audio/jump.ogg",
    hit: "assets/audio/hit.ogg",
    milestone: "assets/audio/milestone.ogg",
    volume: 0.45,
    bgmVolume: 0.24
}
```

`bgm` 会循环播放；`bgmVolume` 单独控制背景音乐音量，避免盖过操作音效。浏览器禁止自动播放时，游戏会在首次操作后重试。其他路径保持为 `null` 时不会发起对应音频请求。

## 上线前检查

1. 保留 `LICENSE`、`UPSTREAM_NOTICE.md` 与 `ASSET_NOTICE.md`；
2. 确认新增图片和音频的授权范围；
3. 使用桌面键盘与手机触摸各测试一次；
4. 检查角色与四种障碍物的碰撞框；
5. 确认控制台没有 404 或脚本错误。

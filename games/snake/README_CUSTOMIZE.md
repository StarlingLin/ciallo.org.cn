# 柚子蛇换皮说明

## 添加或替换皮肤

皮肤定义位于 `game.config.js` 的 `skins` 数组：

```js
{
    id: "example",
    name: "显示名称",
    description: "选择界面的说明",
    head: "assets/images/skins/example.webp",
    bodyA: "#ff76b8",
    bodyB: "#ae67ff",
    glow: "rgba(255, 104, 190, 0.46)"
}
```

- `head` 是蛇头头像，可以使用 WebP、PNG 或可信 SVG；
- 推荐使用接近正方形的图片，选择卡片与蛇头会自动裁成圆形；
- `bodyA`、`bodyB` 控制蛇身交替颜色；
- `glow` 控制蛇身光晕；
- 图片显示范围与圆形碰撞体相互独立，换图不会改变判定范围。

玩家选中的皮肤会从 AI 首轮候选池排除。AI 会优先使用当前场上尚未出现的其他皮肤，全部用过后才允许重复。

当前六套皮肤依次为惠凪、杏珠、月望、莉莉子、美玖和那优花，头像位于 `assets/images/skins/cropped/`。

## 背景音乐

背景音乐路径为 `assets/audio/be-brand-new.ogg`。当前版本保留完整曲目，只使用 Opus 编码压缩；音量可在 `game.js` 中通过 `bgm.volume` 调整。BGM 与合成音效共用页面上的声音开关，暂停游戏时也会暂停播放。

## 调整刷新节奏

`game.config.js` 中：

- `bot.firstSpawnDelay`：第一条 AI 蛇出现前的秒数；
- `bot.spawnIntervalMin` / `spawnIntervalMax`：之后的随机刷新间隔；
- `bot.maximumAlive`：同时存活的 AI 上限。
- `bot.frenzyAfterSeconds`：进入狂暴模式前的秒数，默认 600 秒。
- `bot.frenzySpeedMultiplier`：狂暴模式下所有 AI 的额外速度倍率，默认 1.5。

本地快速测试可以访问：

```text
/games/snake/?fastBots=1
```

快速测试模式会缩短 AI 刷新间隔，不应作为正式难度参数使用。

维护 AI 导航时可以临时使用 `?fastBots=1&aiObserver=1`：玩家会停在地图中央且不参与碰撞，速度成长曲线会加速 20 倍，画布元素的 `data-ai-deaths` 会记录 AI 死亡原因，便于确认是否仍存在边界自杀。

## AI 性格

`personalities` 数组中的权重分别控制觅食、避险、追猎和随机游走。皮肤与性格独立随机，不会让某个角色永久对应固定难度。

- `turnRateMultiplier`：该性格的转向速度倍率；
- `initialSpeedMultiplier`：开局速度倍率；
- `maximumSpeedMultiplier`：成长结束后的最大速度倍率；
- `speedRampSeconds`：从初始倍率线性成长至最大倍率所需的对局时间。

当前贪吃型会在 5 分钟内由 `1.0` 倍成长到 `1.8` 倍，追猎型由 `1.4` 倍成长到 `2.3` 倍；谨慎型保持基础速度，但拥有 `1.35` 倍转向能力。

## 边界避让

AI 会根据当前速度预测前方位置，并在接近边缘前提高向内转向的优先级。`bot.edgeSoftDistance`、`edgeHardDistance` 和 `edgeLookAheadTime` 控制预警范围。代码还保留了只针对 AI 的边界安全兜底，避免高速阶段因单帧越界直接死亡；玩家仍会正常受到边界碰撞判定。

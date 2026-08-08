# 起爆器危机换皮与玩法配置

游戏入口为 `index.html`，样式、配置和逻辑分别位于 `game.css`、`game.config.js`、`game.js`。当前主题使用宁宁飞行精灵、粉色起爆器和裁去首尾静音的 `0721` 音效；删除素材路径或设为 `null` 后仍可使用 Canvas 与 Web Audio 后备效果。

## 可替换资源

所有路径都集中在 `game.config.js`：

```javascript
ship: {
    image: "assets/images/nene-player.webp",
    radius: 18,
    drawWidth: 64,
    drawHeight: 64,
    imageRotationOffset: 0
},

bullet: {
    image: "assets/images/bullet.webp"
},

asteroids: {
    images: [
        "assets/images/detonator.webp"
    ]
},

scene: {
    backgroundImage: "assets/images/background.webp"
}
```

路径保持 `null` 时使用内置矢量图形。图片应使用透明背景 WebP 或 PNG；背景可以使用普通 JPG/WebP。

## 玩家方向与碰撞

`radius` 是玩家圆形碰撞半径，和图片显示大小相互独立。默认认为玩家图片朝上；如果原图朝右、朝下或朝左，可以通过 `imageRotationOffset` 修正，例如：

```javascript
imageRotationOffset: Math.PI / 2
```

换成其他角色、魔法使或机甲素材时，只需要重新测量主体的有效碰撞半径，不必修改移动与射击逻辑。

## 起爆器与敌人

`images` 可以放任意数量的敌人图片，每个新生成的目标会随机选择一张。三个尺寸等级分别配置碰撞半径、显示大小、速度、分数和分裂目标：

```javascript
large:  { radius: 42, score: 20,  splitInto: "medium" },
medium: { radius: 26, score: 50,  splitInto: "small" },
small:  { radius: 14, score: 100, splitInto: null }
```

大目标被击中后分裂成中目标，中目标再分裂成小目标。替换为不同敌人时，可以只换图片；如果外形差异很大，再同步调整 `radius` 和 `drawSize`。

## 音频

可配置：

```javascript
audio: {
    bgm: "assets/audio/bgm.ogg",
    shoot: "assets/audio/shoot.ogg",
    hit: "assets/audio/hit.ogg",
    explode: "assets/audio/explode.ogg",
    lose: "assets/audio/lose.ogg",
    wave: "assets/audio/wave.ogg"
}
```

音频路径为 `null` 时使用内置合成提示音。外部音频只会在玩家首次点击或按键后播放，避免浏览器自动播放错误。短音效建议使用单声道 OGG/Opus，BGM 建议约 40～64 kbit/s。

## 操作与规则

- `←` / `A`：左转；
- `→` / `D`：右转；
- `↑` / `W`：推进；
- `Space`：射击；
- `P`：暂停；
- `R`：重新开始；
- `M`：静音。

游戏默认三点体力。宁宁受击后继续逃生时有短暂无敌时间；清空一波后下一波会增加一个大型起爆器。手机端可使用页面下方的左转、推进、右转和反击按钮。

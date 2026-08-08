# 七海打饺素材与玩法配置说明

游戏入口为 `index.html`，样式和逻辑分别位于 `game.css`、`game.js`。素材路径、裁切区域、绘制尺寸、碰撞区域、旋转速度、砖块头像和音频都集中在 `game.config.js`。

## 当前主题素材

```text
assets/images/nanami-paddle.webp
assets/images/dumpling-ball.webp
assets/images/riddle-joker-heads.webp
assets/audio/desk-thud.ogg
```

- 七海举着案板作为挡板；
- 饺子作为小球，发球后以 `rotationSpeed` 指定的速度持续旋转；
- 五个角色头像从一张横向图集中裁切后，以半透明虚像显示在砖块中央；
- 双耐久 `X` 砖块固定使用头像图的第一个角色在原晓；
- 击中任何砖块时播放一次用户指定的短促拍桌声。

完整素材来源、原始尺寸、压缩尺寸和哈希记录在 `ASSET_NOTICE.md`。

## 七海案板与碰撞箱

当前七海图完整绘制为 `240×160`，但物理碰撞只使用顶部案板：

```javascript
paddle: {
    width: 206,
    height: 28,
    bottom: 126,
    image: "assets/images/nanami-paddle.webp",
    drawWidth: 240,
    drawHeight: 160,
    drawOffsetY: 118
}
```

`width`、`height` 是案板碰撞框；`drawWidth`、`drawHeight` 是整张角色图的显示大小；`drawOffsetY` 把图片中的案板边缘与碰撞框精确对齐。当前 `bottom: 126` 将七海和案板整体下移了 26 像素，同时让角色图仍完整留在画布内。角色头部和身体不会挡球，漏过案板的饺子会继续落下并扣除机会。

如果替换成其他举着物品的角色，先测量图片中实际碰撞物的位置，再一起调整这五个参数。

## 旋转饺子

原图外围有透明留白，游戏只裁切有效内容：

```javascript
ball: {
    radius: 11,
    image: "assets/images/dumpling-ball.webp",
    sourceCrop: { x: 16, y: 32, width: 96, height: 62 },
    drawWidth: 34,
    drawHeight: 22,
    rotationSpeed: 7.2
}
```

`radius` 控制圆形物理碰撞，`drawWidth`、`drawHeight` 控制饺子视觉大小，`rotationSpeed` 单位为弧度/秒。饺子停在案板上等待发球时角度会复位，运动时才持续旋转。

## 角色虚像砖块

头像图已经压缩成 `640×128`，五个角色仍按从左到右的原始顺序排列。`crops` 是每个头像去除透明边缘后的裁切框：

```javascript
portraits: {
    image: "assets/images/riddle-joker-heads.webp",
    opacity: 0.42,
    maximumWidth: 34,
    maximumHeight: 24,
    crops: [ /* 五个裁切框 */ ]
}
```

砖块映射：

```javascript
P: { portraitIndex: 1, hitPoints: 1 },
V: { portraitIndex: 2, hitPoints: 1 },
B: { portraitIndex: 3, hitPoints: 1 },
G: { portraitIndex: 4, hitPoints: 1 },
X: { portraitIndex: 0, hitPoints: 2 }
```

因此四种普通砖块使用后四位角色，`X` 使用第一位在原晓。`X` 第一次被击中后保留虚像并增加裂纹，第二次才会消失。

## 音频

当前击砖声：

```javascript
audio: {
    brick: "assets/audio/desk-thud.ogg",
    volume: 0.55
}
```

其余音效路径留空时，会使用 Web Audio 生成很短的提示音。还可以继续添加：

```javascript
audio: {
    bgm: "assets/audio/bgm.ogg",
    launch: "assets/audio/launch.ogg",
    wall: "assets/audio/wall.ogg",
    paddle: "assets/audio/paddle.ogg",
    brick: "assets/audio/desk-thud.ogg",
    lose: "assets/audio/lose.ogg",
    clear: "assets/audio/clear.ogg",
    gameOver: "assets/audio/game-over.ogg"
}
```

建议将短音效转换为单声道 OGG/Opus；背景音乐使用约 40～64 kbit/s 的 OGG/Opus。BGM 只预读元数据，并在玩家首次交互后播放。

## 关卡

每个字符串代表一行，每个字符代表一种砖块：

```javascript
levels: [
    [
        "PPPPPPPPPP",
        "VVVVVVVVVV",
        "....XX...."
    ]
]
```

- `P`、`V`、`B`、`G`：四种普通角色砖块；
- `X`：使用在原晓虚像、需要击中两次的高分砖块；
- `.`：空位。

每行最多使用 `columns` 个字符。修改列数、间隔、高度和位置时，请同步调整 `bricks` 配置。

## 其他物理参数

- `paddle.speed`：键盘和屏幕方向按钮的移动速度；
- `ball.startingSpeed`：每次发球的初始速度；
- `ball.maximumSpeed`：最高速度；
- `ball.speedGainPerBrick`：每次击中砖块后的速度倍率；
- `game.startingLives`：初始机会数；
- `game.nextLevelDelayMs`：清关后自动进入下一关的等待时间。

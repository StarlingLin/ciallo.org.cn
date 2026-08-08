# 图片目录

当前主题使用两个透明 WebP：

- `nene-player.webp`：朝上的宁宁飞行精灵，256×256，运行时显示为 64×64；
- `detonator.webp`：粉色起爆器，192×192，按目标等级缩放显示。

两张图都通过 `game.config.js` 接入。删去路径或设为 `null` 时会回退到 Canvas 绘制。

可在此放置：

- `nene-player.webp`：玩家角色；
- `bullet.webp`：子弹或技能；
- `detonator.webp` 或其他敌人图片：随机敌人；
- `background.webp`：游戏背景。

放入文件后，在上两级的 `game.config.js` 中填写路径。显示尺寸和圆形碰撞半径可以分别调整。当前素材来源与处理记录见 `../../ASSET_NOTICE.md`。

# 上游来源说明

本游戏基于 `tinogarcia/runner-game` 改造。

- 上游地址：<https://github.com/tinogarcia/runner-game>
- 固定提交：`7e3e5c4334ee0c8e9c1c27796e596677b681e44b`
- 上游许可证：MIT
- 上游版权声明：`Copyright (c) 2024 tinogarcia`
- 本地取得日期：2026-07-31

改造内容包括目录重组、素材配置、丛雨精灵动画、四种随机障碍物、随机距离、连续滚动背景、721 分彩蛋、响应式显示、触摸控制、音频接口、碰撞检测和页面样式。根目录 `LICENSE` 保留了上游 MIT 许可证全文。

`player-spritesheet.png`、`obstacle.png` 和 `explosion.png` 是固定提交中的原始素材备份，目前不再被 `game.config.js` 引用。当前实际使用的角色、障碍物、死亡与彩蛋素材由站点所有者提供；背景为依据站点所有者提供的三张参考图新生成的本地资产。详见 `ASSET_NOTICE.md`。

MIT 许可证只覆盖上游代码及其声明范围，不自动代表后来加入的图片、动图或音频获得同样授权。

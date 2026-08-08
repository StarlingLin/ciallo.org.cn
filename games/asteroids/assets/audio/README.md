# 音频目录

当前主题使用 `0721.ogg` 作为宁宁受击与体力耗尽音效。它从用户提供的 MP3 中检测有效声音区间，裁去首尾空白后压缩为单声道 OGG/Opus；射击、命中目标和过关仍使用 Web Audio 合成提示音。

可在此放置：

- `bgm.ogg`；
- `shoot.ogg`；
- `hit.ogg`；
- `0721.ogg`（当前同时用于 `explode` 与 `lose`）；
- `wave.ogg`。

在上两级的 `game.config.js` 中填写对应路径即可启用。当前裁切区间与来源散列见 `../../ASSET_NOTICE.md`；新增音频时请同步记录来源和授权信息。

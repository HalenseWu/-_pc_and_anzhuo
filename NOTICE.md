# 第三方组件与许可

本项目代码以 MIT 许可发布；下列第三方组件、字体与模型遵循各自许可，使用与再分发时请遵守对应条款。

## 运行时与框架

| 组件 | 用途 | 许可 |
|---|---|---|
| [Electron](https://www.electronjs.org/) | 桌面运行时 | MIT |
| [React](https://react.dev/) | 界面 | MIT |
| [Capacitor](https://capacitorjs.com/) | 安卓桥接 | MIT |
| [zustand](https://github.com/pmndrs/zustand) | 状态管理 | MIT |
| [JSZip](https://stuk.github.io/jszip/) | EPUB / 备份包解压 | MIT / GPLv3（双许可，本项目按 MIT 使用） |
| [pdf.js](https://mozilla.github.io/pdf.js/) | PDF 渲染 | Apache-2.0 |
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | 本地语音合成运行时 | Apache-2.0 |
| [ONNX Runtime](https://onnxruntime.ai/) | 推理引擎（随 sherpa-onnx 分发） | MIT |

## 字体

| 字体 | 用途 | 许可 |
|---|---|---|
| [Noto Serif SC](https://fonts.google.com/noto/specimen/Noto+Serif+SC) | 宋体阅读字体 | SIL Open Font License 1.1 |
| [LXGW WenKai（霞鹜文楷）](https://github.com/lxgw/LxgwWenKai) | 楷体阅读字体 | SIL Open Font License 1.1 |

字体以 woff2 子集形式随前端构建产物分发，未修改字形。

## 语音模型（音色包，不随仓库分发）

| 模型 | 体积 | 许可 | 备注 |
|---|---|---|---|
| MeloTTS zh_en（int8） | 51 MB | MIT | 中英混排自然，合成较慢 |
| Piper zh_CN-huayan x_low | 19.7 MB | 见上游模型卡 | 体积最小，腔调偏重 |
| Matcha zh-baker（含 hifigan_v2 声码器） | 75.6 MB | 见上游模型卡 | 标准普通话，速度与音质平衡 |

模型由用户自行下载/导入，仓库与发行包中不包含模型权重。请在使用前阅读各模型主页的许可说明，商业使用尤需确认。

## 参考

- 启动页题诗：清·韩愈《古今贤文·劝学篇》句「书山有路勤为径，学海无涯苦作舟」（公有领域）。
- 应用名「无涯」取自该句。

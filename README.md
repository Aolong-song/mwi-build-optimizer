# MWI 配装效率优化器

用于 **MilkyWay Idle** 的本地战斗模拟与配装比较工具。导入多个角色的公开导出格式配装后，应用会在浏览器中批量模拟队伍、地图和难度组合，并按“钥匙碎片 / 小时”排序。

## 功能

- 每个角色保存多套配装并任意组合成三人队伍
- 批量模拟可掉落钥匙碎片的战斗地图与不同难度
- 基于模拟战斗结果估算钥匙碎片 / 小时、遭遇 / 小时与死亡 / 小时
- 支持本地导入、编辑、导出配装和 CSV / JSON 结果
- 可选 Windows Electron 桌面壳

## 快速开始

要求：Node.js 18 或更高版本、npm。

```bash
cd build_optimizer
npm ci
npm start
```

开发服务器默认在 `http://localhost:9100` 启动。

生成生产构建：

```bash
npm run build
```

生成 Windows 桌面版目录：

```bash
npm run package:win
```

## 使用方法

1. 在游戏模拟器中导出一份角色配装 JSON。
2. 在“Build 库”导入 JSON，并为每个角色保存所需的候选配装。
3. 在“队伍 & 地图”选择参与比较的配装、地图和难度。
4. 点击“开始对比”，按钥匙碎片 / 小时查看排名；可按需导出结果。

所有导入的配装和生成的结果默认仅保存在当前设备的浏览器 `localStorage` 或桌面版同级的 `data/` 目录中，不会发送到任何服务器。

## 隐私与发布范围

本仓库只包含源码、依赖锁文件及运行所需的公开游戏数据。不会提交：

- 用户导入的角色配装、账号信息和本地结果
- Electron 的 `data/` 目录、构建产物、依赖目录或调试日志
- 本机路径、凭据、令牌、截图和测试附件

请勿将自己的配装 JSON、桌面版 `data/` 目录或导出结果提交到 Git。

## 项目结构

```text
build_optimizer/
├── src/optimizer/       # 配装库、组合生成、批量调度与排名
├── simulator/           # 基于 MWICombatSimulatorTest 的战斗模拟数据与逻辑
├── electron/            # Windows 桌面壳
├── index.html
├── styles.css
└── package.json
```

更详细的指标定义、支持地图和烟测方式见 [build_optimizer/README.md](build_optimizer/README.md)。

## 已知限制

- 仅在 Chrome / Edge 上完成完整功能验证。
- 多人队伍的掉落率与掉落数量修正当前以第一个角色为基准，角色差异很大时结果可能有约 10% 偏差。
- 结果是基于当前内置游戏数据的模拟估算，不保证与后续游戏版本完全一致。

## 第三方来源

`build_optimizer/simulator/` 基于 [shykai/MWICombatSimulatorTest](https://github.com/shykai/MWICombatSimulatorTest/tree/feature-json) 的 `feature-json` 分支整理。发布或再分发前，请核实并遵循上游仓库的许可与署名要求。

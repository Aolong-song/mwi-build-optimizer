# build_optimizer — MWI 多配装效率优化器

> 单页 Web 应用。3 个用户各导入 1–5 套配装，按"钥匙碎片 / 小时"对 (userA_build, userB_build, userC_build, zone) 笛卡尔积批量打分。

## 快速开始

```bash
cd build_optimizer
npm install
npm start            # 默认 http://localhost:9100
npm run build        # 打包到 dist/
```

## Windows 桌面版

已提供无需安装 Node.js、无需执行 `npm run` 的 Windows 可执行程序：

1. 保留整个 `release/win-unpacked/` 文件夹，不要只复制其中的 exe。
2. 双击 `MWI 配装效率优化器.exe`，程序会自动打开优化器窗口。
3. 配装库等本地配置保存在 exe 同级的 `data/` 文件夹；备份或迁移时复制这个文件夹即可。
4. 桌面版会在本机 `127.0.0.1:9117` 提供界面和模拟 Worker 资源，不依赖 `file://` 路径；固定端口可确保 `data/` 中的配装库持续可读，并保证“开始对比”可以正常创建 Worker。

Build 库会直接显示等级、装备、技能数量、战斗补给数量和房屋数量；点击“详情”可查看完整的可视化配装摘要，不再直接展示 JSON 原文。

开发者重新生成桌面版时执行：

```bash
npm run package:win
```

## 工作流

1. **Build 库**：在 "Build 库" 标签粘贴 MWI Combat Simulator 格式 JSON（`doSoloExport` 输出），为 3 个用户各添加 1–5 套配装。
2. **队伍 & 地图**：勾选每位用户参与对比的配装。地图列表只会显示 11 个可用于刷钥匙碎片的地图（其它 zone 默认隐藏）。
3. 每位用户可勾选多套配装；每张地图也可同时勾选多个 T 级别。程序会展开每个 `(userA_build, userB_build, userC_build, zone, difficultyTier, combatConsumables)` 组合并发模拟。
4. **结果**：每完成一个组合就立即追加到结果页；同一地图（及其各 T 级别）会放在一起，便于比较该地图所掉钥匙的最佳队伍和补给。表格显示中文地图/碎片名、补给、模拟时长内的碎片总数（期望值）、Keys/hr、Encounters/hr、Deaths/hr。
5. **导出**：CSV 或 JSON 结果。

### 配装战斗补给

每套配装各自保存一套补给：四种食物三选三；幸运咖啡固定，再从七种属性咖啡中选二。Build 库卡片中的“吃喝”按钮会把选择写回该配装 JSON，因此只对使用该配装的角色生效；不会增加配装 × 地图以外的模拟组合数。仍可在“修改”窗口直接编辑原始 JSON。

### 修改配装与地图选择

- 配装卡片提供“修改”按钮，打开后显示**原始 JSON**，可直接编辑名称和 JSON；保存前会校验 MWI 导出格式。
- 配装摘要只显示战斗装备，按固定顺序展示：披风、主手/双手、副手、护甲、饰品；工具不会显示或影响战斗计算。
- 暂时取消地图时，已勾选的 T 级别会保留；重新勾选地图即可恢复。只有“清空”按钮会明确清除地图及其 T 级别。

### 战斗掉落数量 Buff

在“队伍 & 地图”中勾选“战斗掉落数量 Buff（+29.5%）”，会为队伍全部三名玩家注入上游模拟器的社区战斗掉落数量 Buff。实现使用上游等价配置 `comDrop=20`，其公式为 `0.2 + (20 - 1) × 0.005 = 0.295`。这是掉落**数量**加成，不是物品掉率加成；如果角色本身已有掉落数量词条，最终总量按引擎的 `(1 + 原掉落数量 + 0.295)` 计算。

### 房屋与公会神龛

- `houseRooms` 会直接从每份 MWI 导出 JSON 传入上游 Worker。战斗开始时会重建为永久房屋 Buff；例如真实配装的 17 间房屋在模拟结果中产生了 `rareFindMultiplier = 1.14`。其中射击场、军械库、餐厅、道场、健身房、图书馆、神秘书房还提供战斗等级/属性，能影响击杀和存活。
- 当前 9 种钥匙碎片都位于怪物的普通 `dropTable`，不在 `rareDropTable`；因此房屋的 `rare_find` 不会直接把钥匙碎片期望数乘以 1.14，但房屋的战斗属性仍会通过击杀效率影响 Keys/h。
- 当前 fork 的游戏数据、导出 JSON 格式和模拟器源码均没有“公会神龛”字段或 Buff 定义。因此神龛效果**不参与**当前模拟，不能从结果中推断它已生效。

## 核心模块

| 文件 | 职责 |
|------|------|
| `src/optimizer/main.js` | 入口，组装所有 UI 与调度 |
| `src/optimizer/buildStore.js` | localStorage 持久化 build 库 |
| `src/optimizer/teamCombos.js` | 笛卡尔积生成 |
| `src/optimizer/batchRunner.js` | Web Worker 池并发执行 `simulator/worker.js` |
| `src/optimizer/playerFactory.js` | 从 JSON 构造 Player 对象 |
| `src/optimizer/combatConsumables.js` | 统一的食物/咖啡选择与导入配装覆盖 |
| `src/optimizer/keyShardMetric.js` | 从 simResult 算钥匙碎片期望数 / 小时 |
| `src/optimizer/ranker.js` | 排序 + CSV / JSON 导出 |
| `simulator/` | fork 自 [shykai/MWICombatSimulatorTest](https://github.com/shykai/MWICombatSimulatorTest/tree/feature-json) |

## 指标定义

**钥匙碎片 / 小时**：只关心 `*_key_fragment` 物品（9 种：blue / brown / burning / dark / green / orange / purple / stone / white）。它们**直接由怪物掉落**，不需要先开 chest。计算公式：

```
for each monster death:
    for each *_key_fragment entry in that monster's dropTable:
        dropRate = (base + dropRatePerDifficultyTier * difficultyTier)
                 * (1 + 0.1 * difficultyTier)        # tier multiplier
                 * playerDropMultiplier
        dropRate = clamp(0..1, dropRate)
        if dropRate <= 0: skip                # T0 always 0 (negative base)
        expectedFragments += deaths * dropRate
                            * (min + max)/2
                            * (1 + debuffOnLevelGap)
                            * (1 + combatDropQuantity)
                            / numberOfPlayers
keysPerHour = totalFragments / simulatedHours
```

## 当前可选的掉落地图

11 个可用于刷钥匙碎片的地图（每个对应一个特定 key_fragment）：

| Zone | Boss / 怪物 | 钥匙碎片 |
|---|---|---|
| `/actions/combat/smelly_planet` | fly (regular) | Blue Key Fragment |
| `/actions/combat/aqua_planet` | marine_huntress (boss) | Blue Key Fragment |
| `/actions/combat/swamp_planet` | giant_shoebill (boss) | Green Key Fragment |
| `/actions/combat/jungle_planet` | luna_empress (boss) | Green Key Fragment |
| `/actions/combat/gobo_planet` | gobo_chieftain (boss) | Purple Key Fragment |
| `/actions/combat/planet_of_the_eyes` | the_watcher (boss) | White Key Fragment |
| `/actions/combat/sorcerers_tower` | chronofrost_sorcerer (boss) | Orange Key Fragment |
| `/actions/combat/bear_with_it` | red_panda (boss) | Brown Key Fragment |
| `/actions/combat/golem_cave` | crystal_colossus (boss) | Stone Key Fragment |
| `/actions/combat/twilight_zone` | dusk_revenant (boss) | Dark Key Fragment |
| `/actions/combat/infernal_abyss` | demonic_overlord (boss) | Burning Key Fragment |

以下 6 个原始数据中存在碎片掉落的 action 不会显示：`fly`、`rat`、`skunk`、`porcupine`、`slimy` 是臭臭星球的普通怪物，不是独立刷图目标；`chimerical_den` 是消耗完整钥匙进入的地下城，不产钥匙碎片。

> chest_key 路径（chimerical / enchanted / pirate / sinister chest 内的完整钥匙）独立成另一条 ladder，与钥匙碎片计算无关，故意不计入主指标。

## 中文名称

地图和钥匙碎片显示使用中文社区长期采用的简体中文名；映射位于 `src/optimizer/gameNames.js`，只影响展示，不改变上游 HRID 或计算。地图名称参考 [组队招募副本翻译](https://greasyfork.org/zh-TW/scripts/535683-%E9%93%B6%E6%B2%B3%E5%A5%B6%E7%89%9B-%E7%BB%84%E9%98%9F%E6%8B%9B%E5%8B%9F%E5%89%AF%E6%9C%AC%E4%BF%A1%E6%81%AF%E7%BF%BB%E8%AF%91)；早期普通地图与碎片名再由 [MWI 汉化脚本](https://greasyfork.org/de/scripts/490242-milky-way-idle%E6%B1%89%E5%8C%96/code) 和 [ICKeyTool 的碎片名清单](https://greasyfork.icu/zh-CN/scripts/549520-ickeytool/code?locale_override=1)交叉核对。

## 烟测

`_smoke_test.mjs` 启动 Puppeteer，注入单配装，触发一次 `/actions/combat/sorcerers_tower` T1 的 24 小时模拟，校验 Keys/hr > 0（典型 ~0.13）。

```bash
# dev server 必须先跑
npx webpack serve --mode development --port 9100 --no-open
# 另一个终端：
node _smoke_test.mjs > _smoke_run.log
```

使用三份真实配装验证全部 11 个可选地图（附件不会复制到仓库）：

```bash
node _smoke_test.mjs --all-zones --build-a user-a.json --build-b user-b.json --build-c user-c.json
```

取消路径烟测：

```bash
node _smoke_test.mjs --all-zones --cancel-after-ms 100
```

验证战斗掉落数量 Buff：

```bash
node _smoke_test.mjs --combat-drop-buff
```

验证导入房屋效果（传入有房屋等级的三份导出 JSON）：

```bash
node _smoke_test.mjs --assert-house-effects --build-a user-a.json --build-b user-b.json --build-c user-c.json
```

## 已知局限

- `dropRateMultiplier` / `combatDropQuantity` 用的是 `player1` 的值，未按 3 个玩家分别加权。多玩家平均差异 ~10%，对排名影响小。
- localStorage 单设备存储，跨设备需 export/import 整库。
- 浏览器兼容：仅 Chrome/Edge 全功能验证。
- 暂时不模拟 `debuffOnLevelGap` 跨等级惩罚——玩家 level 与 monster level 差异巨大的组合下结果偏乐观。

## 更新游戏数据

当 MWI 上线新版本时，只需同步 simulator/ 下对应的 JSON 文件：

```bash
git -C simulator pull  # 如果 simulator 是 submodule
# 或
cp ../MWICombatSimulatorTest_feature-json/combatsimulator/data/*.json simulator/combatsimulator/data/
```

# build_optimizer - 当前状态快照

> 最近一次更新:2026-09-02，M17 按角色独立补给与武器咖啡筛选已验证

## 一句话

3 用户 x 1-5 配装 x 多 zone 批量模拟,按 钥匙碎片 / 小时倒序推荐最优配装组合。战斗引擎直接复用 shykai/MWICombatSimulatorTest(feature-json 分支)的 fork,本模块只做数据管理 + 调度 + 排序。

## 已完成里程碑

| Milestone | 状态 | 验证 |
|---|---|---|
| M0 脚手架(package.json / webpack / index.html) | OK | 
px webpack serve --mode development --port 9100 起得来 |
| M1 Build 库 UI + localStorage 持久化(CRUD + 导入导出) | OK | 浏览器内手动测过 |
| M2 Team Picker + Zone 多选 UI（仅显示 11 个可刷 key_fragment 的地图） | OK | 已排除臭臭星球普通怪物与消耗钥匙的奇幻洞穴 |
| M3 batchRunner.js 单 case worker 调度 | OK | 单 case 跑通 |
| M4 keyShardMetric.js(monster 死亡 x dropRate 公式算 key_fragment 期望数) | OK | 公式与上游 simulator 一致 |
| M5 ranker.js 排序 + 高亮最佳 | OK | Keys/h 倒序 |
| M6 端到端 demo（5x5x5 配装 × 5 zone = 625 case 跑通 + 导出 CSV/JSON） | 部分 | 三个真实配装 × 17 zone 已通过，见 M10 |
| M7 main.py 接回归测试 + 旧模块标 deprecated | 未做 | 见 PLAN.md |
| M9 multi-zone 烟测 + 导出验证 | OK 已通过 | 4 zone x 1 build/user 跑通,CSV/JSON 都对 |
| M10 真实配装验证 + 取消运行 | 部分 | 1 build/user × 17 zone 通过；取消运行已验证；多配装压测待做 |
| M11 多选与结果可读性 | OK | 配装全选/清空、多 T 级别、中文地图/碎片与碎片总数均已自动化验证 |
| M12 掉落 Buff / 房屋审计 | OK（神龛不支持） | +29.5% 掉落数量 Buff、导出记录及房屋永久 Buff 已验证；当前数据无神龛模型 |
| M13 Windows 桌面版 | OK | 双击 exe 自动打开优化器；localStorage 固定保存至 exe 同级 `data/` |
| M14 桌面版 Worker 修复 + 配装摘要 | OK | HTTP 本地资源服务让 Worker 正常加载；exe 内 1 case 端到端计算成功，Build 卡片已解析展示 |
| M15 战斗补给与工具过滤 | OK | 食物四选三、幸运咖啡固定+属性咖啡七选二已进入 Worker；真实三人组合模拟成功并记录消耗 |
| M16 自动补给搜索与可用性修复 | OK | 84 种补给被纳入组合；真实 84 case 完成；JSON 编辑、按地图分组实时渲染、T 级别恢复已验证 |
| M17 每位队员独立补给 | OK | 按主手/双手战斗风格筛选咖啡；三位用户补给完整笛卡尔组合，真实短跑已验证 |

## M17 已验证

- 远程、近战、魔法单一风格角色各有 40 套候选补给（4 种食物组 × 10 种咖啡组）；混合风格 60 套；未识别武器安全回退为 84 套。
- 三名真实弩配装、巫师之塔 T1 的组合估算为 `40 × 40 × 40 = 64,000` case。启动 3 秒完成 8 个 case；每行分别显示三位用户不同的食物和咖啡，取消后正常停止。

## M16 已验证

- 配装卡片新增“修改”：弹窗保留原始 JSON 字符串，允许直接编辑并经 `validateBuildJson` 校验后保存。
- 食物四选三（4 组）× 属性咖啡七选二（21 组）× 幸运咖啡固定，共 **84** 种补给；它们被写入每一个模拟 case，而不再由用户手动固定。
- 使用三位真实配装、巫师之塔 T1、1 小时运行：84/84 case 成功，耗时 25.4 秒；结果在完成第一个 case 后实时出现，最终每个 case 的补给均不同且可见。
- 结果按地图分组、同一地图内按 T 级别和 Keys/h 对比；装备摘要顺序从披风、武器开始，且不会显示工具。取消后再选中巫师之塔，原先 T1/T2 选择均恢复。

## M15 已验证

- 配装详情仅显示会影响战斗的装备；采集工具等无 `equipmentDetail` 的物品既不展示，也不会传给战斗装备构造器。
- 三名真实用户的 1 小时巫师之塔 T1 模拟成功。每名角色均消耗幸运咖啡、超级攻击咖啡、超级远程咖啡各 12 杯；食物消耗按战斗中的实际生命/法力情况发生。
- CSV 增加 `foods`、`drinks` 列；JSON 的 `runOptions.combatConsumables` 记录所选 HRID 和中文名称，方便复核同一套吃喝增益。

## M12 已验证

- UI 的“战斗掉落数量 Buff（+29.5%）”传递到上游 Worker 的 `extra.comDrop=20`，上游公式实际返回 `combatDropQuantity = 0.29500000000000004`。
- 同一批样例 case 启用 Buff 后，结果、CSV 和 JSON 均记录开启状态；JSON `runOptions.combatDropQuantityBonus = 0.295`。
- 使用三位用户的真实导出 JSON 运行 5 个 case，全部成功；Player 1 的 `rareFindMultiplier = 1.14`，证明其 17 间非零房屋已被 Worker 重建并生效。
- 数据审计显示全部 9 种钥匙碎片都在怪物普通 `dropTable`，而非 `rareDropTable`：房屋的 `rare_find` 不直接增加钥匙碎片掉率；战斗房间仍通过等级/属性改变击杀效率与结果。
- 公会神龛：在 `simulator/combatsimulator/data/`、导出 JSON 顶层字段和模拟输入中均未找到 shrine/guild-shrine 定义。因此当前模拟器无法、也没有假装计算神龛效果。

## M11 已验证

- 每位用户支持多选配装，并提供“全选 / 清空”快捷按钮。
- 每张地图支持同时选择多个 T 级别；每个 `(map, tier)` 独立展开为一个 case，另有 T0–T5 批量开关。
- 地图、钥匙碎片以中文显示；底层 HRID 与计算逻辑不变。
- 结果表、CSV、JSON 追加 `totalKeysExpected`：模拟时长内的钥匙碎片期望总数。
- 浏览器烟测：User A 选择 2 套配装，海洋星球同时选择 T1/T2，加另外 3 个 T1 地图，共 `2 × 5 = 10` case，10/10 成功；导出含中文名和总数。

## M10 已验证

2026-09-01 使用用户提供的三份完整 MWI Combat Simulator JSON（每份 24 件装备、5 个技能）执行：

- 1 套配装/user × 17 个 key_fragment 地图 × T1 = **17 case**；全部成功，无 Worker 错误。
- 导出 CSV（1835 bytes）与 JSON（37863 bytes）非空，JSON `rankings` 长度为 17。
- 排名首两位：Aqua Planet T1 `0.2018 keys/h`、Gobo Planet T1 `0.2011 keys/h`。
- Infernal Abyss 与 Chimerical Den 能完成模拟但出现角色死亡，分别为 `5.63/h` 与 `2.08/h`；它们不是错误 case。
- 取消按钮：17 case 开始后 0.2 秒取消，进度条显示 `已取消 (0/17)`；Worker 被终止，未启动的 case 不会继续调度。

可复现命令（附件路径不入库）：

```
node _smoke_test.mjs --all-zones --build-a <userA.json> --build-b <userB.json> --build-c <userC.json>
node _smoke_test.mjs --all-zones --cancel-after-ms 100
```

## M9 当前已验证

烟测输出(最新一次,2026-09-01):

`
Summary: 总计 4 个组合(成功 4),最佳:0.1908 钥匙/h
row 0: aqua_planet    T1  Blue Key Fragment  0.1908 keys/h
row 1: sorcerers_tower T1  Orange Key Fragment 0.1297 keys/h
row 2: twilight_zone  T1  Dark Key Fragment   0.0926 keys/h
row 3: smelly_planet  T1  Blue Key Fragment   0.0394 keys/h
Missing zones: <none>
Errors: []
`

CSV / JSON 导出内容非空且排序一致(rank / keysPerHour / zone / key / 三用户 build 名等列齐全)。

## 本轮修复的 Bug

src/optimizer/playerFactory.js 第 18 行:

`
// 之前:
houseRooms: playerJson.houseRooms,
// 改为:
houseRooms: playerJson.houseRooms || {},
`

原因:Player.createFromDTO(simulator/combatsimulator/player.js:49)会执行 Object.entries(dto.houseRooms),若 houseRooms 是 undefined 就抛 Cannot convert undefined or null to object。原代码只在末尾给 player.houseRooms = playerJson.houseRooms || {} 兜底,DTO 层没兜,所以历史 sample build 一直靠自带 houseRooms: {} 字段蒙混过关;clean smoke test 一去掉这个字段就炸。

chievements 原本就有 || {} 兜底,所以 OK。

## M6 / M9 还差什么

- 5 build/user × 5 zone 实际为 **625 case**（不是 125）；3 build/user × 5 zone 为 **135 case**，3 build/user × 17 zone 为 **459 case**。目前真实配装已跑过 17 case。
- 并发调度：默认 `navigator.hardwareConcurrency`（CI/headless 下通常为 4）。取消按钮已完成；断点续跑仍未实现。
- M7 待办:main.py 接 build_optimizer 导出 JSON 做回归;combat_simulator/ 与 fficiency_engine/ 的 deprecated 标记注释。

## 关键文件清单

`
build_optimizer/
- index.html                      # 单页 UI(Bootstrap 5 tab:Build 库 / 队伍&地图 / 结果)
- package.json / webpack.config.js
- src/optimizer/
  - main.js                     # 入口(注意:末尾曾有重复死代码,已清理)
  - buildStore.js               # localStorage mwiBuildLibrary
  - teamCombos.js               # 笛卡尔积
  - batchRunner.js              # Web Worker 池
  - playerFactory.js            # <- 本轮修的 houseRooms 兜底
  - keyShardMetric.js           # 钥匙碎片期望数(Path 1 monster-only)
  - ranker.js                   # 排序 + toCsv + toExportJson
- simulator/                      # fork 自 shykai/MWICombatSimulatorTest@feature-json
- _smoke_test.mjs                 # <- 本轮重写为 multi-zone + 导出验证
- _smoke_run.log                  # 最近一次烟测输出
- README.md / PLAN.md / STATUS.md
`

## 17 个 key_fragment dungeon(已 verified)

| Zone | Source monster | Fragment |
|---|---|---|
| fly / rat / skunk / porcupine / slimy / smelly_planet / aqua_planet | fly / rat / skunk / porcupine / slimy / marine_huntress (boss) | Blue |
| swamp_planet / jungle_planet | giant_shoebill (boss) / luna_empress (boss) | Green |
| gobo_planet | gobo_chieftain (boss) | Purple |
| planet_of_the_eyes | the_watcher (boss) | White |
| sorcerers_tower | chronofrost_sorcerer (boss) | Orange |
| bear_with_it | red_panda (boss) | Brown |
| golem_cave | crystal_colossus (boss) | Stone |
| twilight_zone | dusk_revenant (boss) | Dark |
| infernal_abyss | demonic_overlord (boss) | Burning |
| chimerical_den | rat (regular) | Blue |

dungeonInfo.keyItemHrid(如 /items/chimerical_entry_key)是 dungeon 入场钥匙消耗品,与 key_fragment 是两条独立 ladder,故意排除。

## 运行方式

dev server(后台常驻,webpack-dev-server:9100):

`
cd build_optimizer
npx webpack serve --mode development --port 9100 --no-open
`

烟测:

`
# 先杀残留 edge / 清旧 log
powershell -ExecutionPolicy Bypass -File _cleanup.ps1

# 再跑
node _smoke_test.mjs 2>&1 | Tee-Object -FilePath _smoke_run.log
`

_cleanup.ps1 逻辑:

`
Get-Process msedge -ErrorAction SilentlyContinue |
  Where-Object { .StartTime -gt (Get-Date).AddMinutes(-3) } |
  ForEach-Object { Stop-Process -Id .Id -Force -ErrorAction SilentlyContinue }
Remove-Item -LiteralPath _smoke_run.log -Force
`

## 已知限制(来自 README & 实际踩坑)

1. dropRateMultiplier / combatDropQuantity 用 player1 的值,3 人队伍下未按人加权,~10% 偏差,对排名影响小。
2. 多 zone 起步慢:每新 case 起一个新 Web Worker,开销大;并发数受限于 CPU 核心数(headless 下通常 4)。
3. #startBatchBtn 在 #pane-team tab 里,初始隐藏;puppeteer.click 前必须先 .click() 对应的 tab 按钮,否则报 Node is either not clickable。smoke test 已经处理。
4. localStorage 单设备存储,跨设备用 xportLibraryBtn / importLibraryInput。
5. T0 不掉 key_fragment(base 是负数 + perTier 偏移要到 T1 才转正),所以默认开 T1 起跳。
6. 浏览器兼容仅 Chrome/Edge 全功能验证。

## 还需要继续做(M9 -> M10)

按优先级:

1. 真实 3-5 build/user × 5-10 zone 压测：3 build/user × 17 zone = **459 case**，验证 worker 池和进度条都正常；记录耗时、最大并发和内存占用。
2. 结果表加展开行:点击表格行展开原始 simResult 详情(drop 表、经验、命中、HP消耗),方便人工核对。
3. 导出的 JSON 加 schema 版本号(schemaVersion: 1),便于 main.py 回归测试脚本做向后兼容。
4. 完成 M7:在 main.py 里读 build_optimizer 导出 JSON,对比 simulator 原 UI 同 case 的 Keys/hr(已在 README 验收标准里规定 < 1% 误差),标旧模块 deprecated。
5. 断点续跑：取消已实现，但未完成 case 尚不能在下次运行时复用。
6. 难度筛选优化：当前是每张地图独立 <select>，可以加全部地图选 T0/T1/T2 快捷按钮。
7. retry-on-fail：单个 case 失败时目前记为失败结果；加可配置重试机制。

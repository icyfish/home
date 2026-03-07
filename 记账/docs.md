# 记账系统技术文档

## 架构概览

```
记账-momo.js  ──┐
记账-star.js  ──┼──▶ 记账_lib.js (共享库)
记账.js       ──┘         │
                          ├── 数据层：记账数据.json
                          ├── 导出层：记账表_momo_star.xlsx
                          └── AI 层：智谱 GLM-4V API
```

## 文件说明

| 文件 | 作用 | 行数 |
|------|------|------|
| `记账_lib.js` | 共享库，所有业务逻辑 | ~640 |
| `记账-momo.js` | momo 入口脚本 | ~20 |
| `记账-star.js` | star 入口脚本 | ~20 |
| `记账.js` | 手动记账入口（需选人） | ~50 |
| `记账_momo.js` | 已废弃（旧版 CSV 独立脚本） | - |
| `记账_star.js` | 已废弃（旧版 CSV 独立脚本） | - |

## 数据文件

| 文件 | 格式 | 用途 |
|------|------|------|
| `记账数据.json` | JSON 数组 | 唯一数据源（手动+截图共用） |
| `记账表_momo_star.xlsx` | XLSX | 自动生成，截图记账后更新 |

### JSON 数据格式

```json
{
  "date": "2026-03-07",
  "person": "momo",
  "type": "支出",
  "amount": 25.5,
  "category": "餐饮",
  "note": "午餐（微信）"
}
```

- `category` 仅 type="支出" 时存在
- `source` 仅 type="收入" 时存在
- `note` 可选

### XLSX 结构（2 个 Sheet）

**Sheet1: 记账明细**

| 月份 | 日期 | 记账人 | 收/支 | 类目 | 来源 | 金额 | 备注 |
|------|------|--------|-------|------|------|------|------|

**Sheet2: 月度汇总**

| 月份 | 记账人 | 总支出 | 总收入 | 结余 |
|------|--------|--------|--------|------|

## 模块 API (记账_lib.js)

### 常量

| 名称 | 值 |
|------|-----|
| `PERSONS` | `["momo", "star"]` |
| `EXPENSE_CATEGORIES` | 餐饮、交通、购物、住房、娱乐、医疗、教育、人情、宠物、其他 |
| `INCOME_SOURCES` | 工资、兼职、投资收益、红包、报销、其他 |
| `AI_CONFIG` | API Key + Model (glm-4v-flash) |
| `XLSX_CDNS` | SheetJS CDN 列表（bootcdn > sheetjs > jsdelivr） |

### 数据函数

| 函数 | 签名 | 说明 |
|------|------|------|
| `loadData()` | `() => Entry[]` | 同步读取 JSON 数据 |
| `loadDataAsync()` | `() => Promise<Entry[]>` | 异步读取（含 iCloud 下载等待） |
| `saveData(data)` | `(Entry[]) => void` | 写入 JSON |
| `todayStr()` | `() => string` | 返回 "YYYY-MM-DD" |
| `monthStr()` | `() => string` | 返回 "YYYY-MM" |

### UI / 业务函数

| 函数 | 说明 |
|------|------|
| `runApp(person)` | 显示主菜单（记一笔/汇总/导出） |
| `runScreenshot(person)` | 截图记账完整流程 |
| `recordEntry(person)` | 手动记账弹窗流程 |
| `showTodaySummary()` | 今日汇总弹窗 |
| `showMonthlySummary()` | 本月汇总弹窗 |
| `showRecentRecords()` | 近期50条记录列表 |
| `exportXLSX()` | 导出 XLSX 并弹出分享 |
| `createWidget()` | 创建桌面小组件 |
| `notify(title, body)` | 发送本地通知 |

### 截图解析函数

| 函数 | 说明 |
|------|------|
| `parseScreenshot(image)` | 调用 GLM-4V 解析支付截图，返回 JSON |
| `validateScreenshot(parsed)` | 验证并修正 AI 返回的数据 |
| `generateXLSX(entries, outputPath)` | 从数据生成 XLSX 文件 |

## 运行模式

### 入口脚本（记账-momo.js / 记账-star.js）

```
config.runsInWidget?
  ├── 是 → createWidget() → 显示小组件
  └── 否 → 有截图/快捷指令参数?
              ├── 是 → runScreenshot(person) → 截图记账
              └── 否 → runApp(person) → 手动菜单
```

### 截图记账流程 (runScreenshot)

```
1. 获取图片 ← args.images / args.shortcutParameter / Pasteboard
2. AI 解析  ← parseScreenshot() → GLM-4V API
3. 数据验证 ← validateScreenshot() → 金额/类目/日期校验
4. 保存 JSON ← loadDataAsync() + saveData()
5. 生成 XLSX ← generateXLSX() → WebView + SheetJS
6. 通知结果 ← notify()
```

### XLSX 生成流程 (generateXLSX)

```
1. 准备数据        → detailRows + summaryRows
2. 创建 WebView    → loadHTML (空白页)
3. 加载 SheetJS    → CDN script 标签（多源自动重试）
4. 注入数据        → evaluateJavaScript(window.__d = ...)
5. 生成 base64     → XLSX.write() 在 WebView 内执行
6. 写入文件        → Data.fromBase64String() + fm.write()
```

CDN 加载使用单次 `completion` 回调 + 内部重试，避免多次 `evaluateJavaScript` 回调冲突。

## 快捷指令配置

```
动作 1: 截屏
动作 2: 运行 Scriptable 脚本
        脚本名: "记账-momo" 或 "记账-star"
        传入参数: 截屏结果
```

Back Tap 配置：设置 → 辅助功能 → 触控 → 轻点背面 → 轻点三下 → 选择快捷指令

## 已知限制

1. **XLSX 生成依赖网络**：首次需要从 CDN 下载 SheetJS 库（~500KB），后续也需要。如果网络不通，JSON 数据已保存但 XLSX 不会更新
2. **iCloud 同步延迟**：`loadData()` 是同步函数，无法 await iCloud 下载。截图流程使用 `loadDataAsync()` 规避此问题
3. **AI 解析精度**：依赖 GLM-4V 识别截图，复杂截图可能解析错误，兜底为"其他"类目

## 旧版文件（可删除）

- `记账_momo.js` — 旧版独立脚本，使用 CSV 格式，不依赖 lib
- `记账_star.js` — 同上

这些文件在重构前使用，现已被 `记账-momo.js` + `记账-star.js` + `记账_lib.js` 替代。

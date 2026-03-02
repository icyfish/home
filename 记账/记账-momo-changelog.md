# 记账-momo.js 修改记录

## 2026-03-03

### 目标

`记账-momo.js` 新增截图自动记账流程：

```
支付后点击手机背面三下 → 自动截图 → AI 解析 → 自动写入 xlsx
```

---

### 第一版：引入截图 AI 解析流程

**改动文件**：`记账-momo.js`

在原有三种入口（Widget / 手动菜单 / 快捷指令）基础上，新增截图流程分支：

```
if (config.runsInWidget)          → 显示 Widget
else if (args.images / shortcutParameter) → runScreenshot()（新增）
else                              → lib.runApp("momo")（手动菜单）
```

新增函数：

| 函数 | 说明 |
|---|---|
| `parseScreenshot(image)` | 图片转 base64 → 调用智谱 GLM-4V API 解析 |
| `validateAndFix(parsed)` | 校验 AI 返回的 JSON，修正金额/类目/日期 |
| `saveEntry(validated)` | 写入 `记账_lib` 的 JSON 数据源 |
| `notify(title, body)` | 推送系统通知 |
| `runScreenshot()` | 主流程：获取截图 → 解析 → 保存 → 通知 |

复用了 `记账_lib.js` 的 `EXPENSE_CATEGORIES`、`INCOME_SOURCES`、`loadData()`、`saveData()`。

---

### 第二版：改为直接写入 xlsx

**需求**：数据直接写入 `记账表_momo_star.xlsx`，可直接查看文件。

**实现方案**：WebView + SheetJS，读取已有 xlsx → 追加一行 → 写回。

**改动**：将 `saveEntry()` 替换为 `appendToXLSX()`：

```
读取已有 xlsx → base64 传入 WebView
→ XLSX.read() 加载
→ sheet_add_aoa() 追加行
→ XLSX.write() 导出 base64
→ FileManager 写回 iCloud
```

xlsx 文件结构（通过 Python 检查确认）：

| Sheet | 说明 |
|---|---|
| `工作表 1 - 记账表_momo_star` | 数据表，第1行表名，第2行表头，第3行起数据 |
| `记账表_momo_star透视 - 记账表_momo_star` | Numbers 透视表 |

列顺序：`月份 / 日期 / 记账人 / 收/支 / 类目 / 来源 / 金额 / 备注`

---

### 第三版：修复报错「执行 JavaScript 返回结果不受支持」

**根本原因**：

`XLSX.read()` 无法解析 Numbers 导出的 xlsx。该文件含 PivotCache 扩展字段，openpyxl 和 SheetJS 均无法正常解析，导致 JS 抛出异常，Scriptable 的 `evaluateJavaScript` 返回 `undefined`，报错"结果不受支持"。

**修复方案**：放弃 `XLSX.read()`，改用 **JSON 数据文件 + 全量重新生成 xlsx**，与 `记账_lib.js` 的 `exportXLSX()` 使用同一套可靠模式。

| | 第二版（报错）| 第三版（修复）|
|---|---|---|
| 数据来源 | 读取已有 xlsx（`XLSX.read`）| JSON 文件（`记账表_momo_star.json`）|
| 写入方式 | 追加一行（`sheet_add_aoa`）| 全量重新生成（`aoa_to_sheet` + `write`）|
| 历史数据保留 | 依赖原 xlsx | JSON 文件持久化 |

**新增函数** `appendEntry(validated)`：

```
追加到 JSON 文件
→ 全量读取 JSON
→ evaluateJavaScript 传入 exportData（小 JSON，无 read 操作）
→ XLSX.write() 生成 base64
→ FileManager 覆盖写入 xlsx
```

**数据迁移**：用 Python 从原 Numbers xlsx 提取 9 条历史记录，生成 `记账表_momo_star.json` 作为初始数据源。

---

### 最终文件说明

| 文件 | 作用 |
|---|---|
| `记账-momo.js` | Scriptable 脚本（需同步到 iCloud Scriptable Documents）|
| `记账表_momo_star.json` | JSON 数据源，含历史 9 条记录（需同步到 iCloud Scriptable Documents）|
| `记账表_momo_star.xlsx` | 每次记账后自动覆盖生成，可直接用 Numbers / Excel 查看 |

### 快捷指令配置（Back Tap）

```
设置 → 辅助功能 → 触控 → 轻点背面 → 轻点三下 → 快捷指令

快捷指令：
  动作 1: 截屏
  动作 2: 运行 Scriptable 脚本 "记账-momo"，传入参数 = 截屏结果
```

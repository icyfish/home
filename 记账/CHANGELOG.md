# Changelog

## [Unreleased] - 2026-03-03

### 记账.js

#### Changed
- 导出格式由 CSV 改为 XLSX，菜单项「导出 CSV」更名为「导出 Excel (.xlsx)」

#### Added
- 新增 `exportXLSX()` 函数，使用 WebView + SheetJS 库生成标准 xlsx 文件
- 导出文件包含两张工作表：
  - **记账明细**：列 = 月份、日期、记账人、收/支、类目、来源、金额、备注
  - **月度汇总**：按月份 + 记账人聚合，列 = 月份、记账人、总支出、总收入、结余
- 导出文件命名格式：`记账导出_YYYY-MM-DD.xlsx`，保存至临时目录后通过 ShareSheet 分享

#### Removed
- 删除 `exportCSV()` 函数

#### Notes
- 导出时需要网络连接（首次加载 SheetJS CDN）；无网络时弹出错误提示

---

## [Unreleased] - 2026-03-03 (2)

### 新增文件

#### 记账_lib.js（新建）
- 将 `记账.js` 中所有可复用逻辑提取为共享库，供三个脚本通过 `importModule("记账_lib")` 引用
- `recordEntry(person)` 接受 `person` 参数，去掉"谁在记账"弹窗（由调用方决定）
- 新增 `runApp(person)` 函数：展示以 `记账 · {person}` 为标题的菜单，"记一笔"直接使用预设 person
- 通过 `module.exports` 导出全部公共函数和常量

#### 记账-momo.js（新建）
- 固定记账人为 `momo`，跳过选人弹窗
- Widget 模式调用 `lib.createWidget()`，App 模式调用 `lib.runApp("momo")`
- 图标颜色：blue

#### 记账-star.js（新建）
- 固定记账人为 `star`，跳过选人弹窗
- Widget 模式调用 `lib.createWidget()`，App 模式调用 `lib.runApp("star")`
- 图标颜色：orange

### 修改文件

#### 记账.js
- 重构：所有业务逻辑改为调用 `记账_lib`，自身只保留"选人"弹窗一步
- 文件从 ~570 行精简至 ~45 行

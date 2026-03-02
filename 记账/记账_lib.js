// 记账_lib.js — 共享库
// 供 记账.js / 记账-momo.js / 记账-star.js 通过 importModule("记账_lib") 使用

const FILE_NAME = "记账数据.json"
const fm = FileManager.iCloud()
const dir = fm.documentsDirectory()
const filePath = fm.joinPath(dir, FILE_NAME)

const EXPENSE_CATEGORIES = [
  "餐饮", "交通", "购物", "住房", "娱乐",
  "医疗", "教育", "人情", "宠物", "其他"
]
const INCOME_SOURCES = [
  "工资", "兼职", "投资收益", "红包", "报销", "其他"
]
const PERSONS = ["momo", "star"]

// ---------- 数据读写 ----------
function loadData() {
  if (fm.fileExists(filePath)) {
    if (!fm.isFileDownloaded(filePath)) {
      fm.downloadFileFromiCloud(filePath)
    }
    let raw = fm.readString(filePath)
    try {
      return JSON.parse(raw)
    } catch (e) {
      return []
    }
  }
  return []
}

function saveData(data) {
  fm.writeString(filePath, JSON.stringify(data, null, 2))
}

// ---------- 日期工具 ----------
function todayStr() {
  let d = new Date()
  let y = d.getFullYear()
  let m = String(d.getMonth() + 1).padStart(2, "0")
  let day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function monthStr() {
  let d = new Date()
  let y = d.getFullYear()
  let m = String(d.getMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
}

// ---------- 记账流程（person 由调用方传入，不再弹窗询问）----------
async function recordEntry(person) {
  // 1. 收入还是支出？
  let typeAlert = new Alert()
  typeAlert.title = `${person} · 收入还是支出？`
  typeAlert.addAction("支出")
  typeAlert.addAction("收入")
  typeAlert.addCancelAction("取消")
  let tIdx = await typeAlert.presentAlert()
  if (tIdx === -1) return
  let type = tIdx === 0 ? "支出" : "收入"

  // 2. 选择类目/来源
  let options = type === "支出" ? EXPENSE_CATEGORIES : INCOME_SOURCES
  let label = type === "支出" ? "类目" : "来源"
  let category = await pickFromTable(`选择${label}`, options)
  if (!category) return

  // 3. 输入金额 + 备注
  let inputAlert = new Alert()
  inputAlert.title = "输入金额和备注"
  inputAlert.message = `${person} · ${type} · ${category}`
  inputAlert.addTextField("金额", "")
  inputAlert.addTextField("备注（可选）", "")
  inputAlert.addAction("确认")
  inputAlert.addCancelAction("取消")
  let iIdx = await inputAlert.presentAlert()
  if (iIdx === -1) return
  let amountStr = inputAlert.textFieldValue(0).trim()
  let note = inputAlert.textFieldValue(1).trim()

  let amount = parseFloat(amountStr)
  if (isNaN(amount) || amount <= 0) {
    let errAlert = new Alert()
    errAlert.title = "金额无效"
    errAlert.message = "请输入一个正数"
    errAlert.addAction("好的")
    await errAlert.presentAlert()
    return
  }

  // 4. 确认
  let confirmAlert = new Alert()
  confirmAlert.title = "确认记录"
  confirmAlert.message = [
    `日期：${todayStr()}`,
    `记账人：${person}`,
    `类型：${type}`,
    `${label}：${category}`,
    `金额：¥${amount.toFixed(2)}`,
    note ? `备注：${note}` : ""
  ].filter(Boolean).join("\n")
  confirmAlert.addAction("保存")
  confirmAlert.addCancelAction("取消")
  let cIdx = await confirmAlert.presentAlert()
  if (cIdx === -1) return

  // 保存
  let entry = { date: todayStr(), person, type, amount }
  if (type === "支出") entry.category = category
  else entry.source = category
  if (note) entry.note = note

  let data = loadData()
  data.push(entry)
  saveData(data)

  let doneAlert = new Alert()
  doneAlert.title = "已保存 ✓"
  doneAlert.message = `${person} ${type} ¥${amount.toFixed(2)}`
  doneAlert.addAction("好的")
  await doneAlert.presentAlert()
}

// UITable 滚动列表选择
async function pickFromTable(title, options) {
  let table = new UITable()
  table.showSeparators = true
  let selected = null

  for (let opt of options) {
    let row = new UITableRow()
    row.height = 50
    let cell = row.addText(opt)
    cell.titleFont = Font.systemFont(18)
    row.onSelect = () => { selected = opt }
    table.addRow(row)
  }

  await table.present()
  return selected
}

// ---------- 今日汇总 ----------
async function showTodaySummary() {
  let data = loadData()
  let today = todayStr()
  let todayData = data.filter(e => e.date === today)

  if (todayData.length === 0) {
    let a = new Alert()
    a.title = "今日汇总"
    a.message = "今天还没有记录"
    a.addAction("好的")
    await a.presentAlert()
    return
  }

  let totalExpense = 0, totalIncome = 0
  let personExpense = {}
  let categoryExpense = {}

  for (let p of PERSONS) personExpense[p] = 0

  for (let e of todayData) {
    if (e.type === "支出") {
      totalExpense += e.amount
      personExpense[e.person] = (personExpense[e.person] || 0) + e.amount
      let cat = e.category || "其他"
      categoryExpense[cat] = (categoryExpense[cat] || 0) + e.amount
    } else {
      totalIncome += e.amount
    }
  }

  let lines = [
    `📅 ${today}`,
    "",
    `总支出：¥${totalExpense.toFixed(2)}`,
    `总收入：¥${totalIncome.toFixed(2)}`,
    ""
  ]

  for (let p of PERSONS) {
    if (personExpense[p] > 0) {
      lines.push(`${p} 支出：¥${personExpense[p].toFixed(2)}`)
    }
  }

  if (totalExpense > 0) {
    lines.push("")
    lines.push("— 支出类目占比 —")
    let sorted = Object.entries(categoryExpense).sort((a, b) => b[1] - a[1])
    for (let [cat, amt] of sorted) {
      let pct = ((amt / totalExpense) * 100).toFixed(1)
      lines.push(`${cat}：¥${amt.toFixed(2)}（${pct}%）`)
    }
  }

  let a = new Alert()
  a.title = "今日汇总"
  a.message = lines.join("\n")
  a.addAction("好的")
  await a.presentAlert()
}

// ---------- 本月汇总 ----------
async function showMonthlySummary() {
  let data = loadData()
  let month = monthStr()
  let monthData = data.filter(e => e.date.startsWith(month))

  if (monthData.length === 0) {
    let a = new Alert()
    a.title = "本月汇总"
    a.message = "本月还没有记录"
    a.addAction("好的")
    await a.presentAlert()
    return
  }

  let totalExpense = 0, totalIncome = 0
  let personExpense = {}
  let categoryExpense = {}
  let incomeSource = {}

  for (let p of PERSONS) personExpense[p] = 0

  for (let e of monthData) {
    if (e.type === "支出") {
      totalExpense += e.amount
      personExpense[e.person] = (personExpense[e.person] || 0) + e.amount
      let cat = e.category || "其他"
      categoryExpense[cat] = (categoryExpense[cat] || 0) + e.amount
    } else {
      totalIncome += e.amount
      let src = e.source || "其他"
      incomeSource[src] = (incomeSource[src] || 0) + e.amount
    }
  }

  let activePeople = PERSONS.filter(p => personExpense[p] > 0)
  let avgExpense = activePeople.length > 0 ? totalExpense / activePeople.length : 0

  let lines = [
    `📅 ${month}`,
    `共 ${monthData.length} 条记录`,
    "",
    `总支出：¥${totalExpense.toFixed(2)}`,
    `总收入：¥${totalIncome.toFixed(2)}`,
    `净收入：¥${(totalIncome - totalExpense).toFixed(2)}`,
    ""
  ]

  for (let p of PERSONS) {
    if (personExpense[p] > 0) {
      lines.push(`${p} 支出：¥${personExpense[p].toFixed(2)}`)
    }
  }
  if (activePeople.length > 1) {
    lines.push(`人均支出：¥${avgExpense.toFixed(2)}`)
  }

  if (totalExpense > 0) {
    lines.push("")
    lines.push("— 支出类目 —")
    let sorted = Object.entries(categoryExpense).sort((a, b) => b[1] - a[1])
    for (let [cat, amt] of sorted) {
      let pct = ((amt / totalExpense) * 100).toFixed(1)
      lines.push(`${cat}：¥${amt.toFixed(2)}（${pct}%）`)
    }
  }

  if (totalIncome > 0) {
    lines.push("")
    lines.push("— 收入来源 —")
    let sorted = Object.entries(incomeSource).sort((a, b) => b[1] - a[1])
    for (let [src, amt] of sorted) {
      lines.push(`${src}：¥${amt.toFixed(2)}`)
    }
  }

  let a = new Alert()
  a.title = "本月汇总"
  a.message = lines.join("\n")
  a.addAction("好的")
  await a.presentAlert()
}

// ---------- 查看近期记录 ----------
async function showRecentRecords() {
  let data = loadData()
  if (data.length === 0) {
    let a = new Alert()
    a.title = "近期记录"
    a.message = "还没有任何记录"
    a.addAction("好的")
    await a.presentAlert()
    return
  }

  let recent = data.slice(-50).reverse()

  let table = new UITable()
  table.showSeparators = true

  let header = new UITableRow()
  header.isHeader = true
  header.height = 40
  header.addText("近期记录（最近50条）")
  table.addRow(header)

  for (let e of recent) {
    let row = new UITableRow()
    row.height = 50

    let catOrSrc = e.type === "支出" ? (e.category || "") : (e.source || "")
    let sign = e.type === "支出" ? "-" : "+"
    let color = e.type === "支出" ? Color.red() : Color.green()

    let leftCell = row.addText(`${e.date}  ${e.person}`)
    leftCell.titleFont = Font.systemFont(13)
    leftCell.titleColor = Color.gray()
    leftCell.widthWeight = 35

    let midCell = row.addText(`${e.type} · ${catOrSrc}`, e.note || "")
    midCell.titleFont = Font.systemFont(15)
    midCell.subtitleFont = Font.systemFont(12)
    midCell.subtitleColor = Color.gray()
    midCell.widthWeight = 40

    let rightCell = row.addText(`${sign}¥${e.amount.toFixed(2)}`)
    rightCell.titleFont = Font.boldSystemFont(15)
    rightCell.titleColor = color
    rightCell.rightAligned()
    rightCell.widthWeight = 25

    table.addRow(row)
  }

  await table.present()
}

// ---------- 导出 XLSX ----------
async function exportXLSX() {
  let data = loadData()
  if (data.length === 0) {
    let a = new Alert()
    a.title = "导出"
    a.message = "没有数据可导出"
    a.addAction("好的")
    await a.presentAlert()
    return
  }

  // Sheet1：记账明细
  let detailRows = data.map(e => [
    e.date.substring(0, 7),
    e.date,
    e.person,
    e.type,
    e.type === "支出" ? (e.category || "") : "",
    e.type === "收入" ? (e.source || "") : "",
    e.amount,
    e.note || ""
  ])

  // Sheet2：月度汇总（按月份+记账人聚合）
  let monthMap = {}
  for (let e of data) {
    let month = e.date.substring(0, 7)
    let key = `${month}|${e.person}`
    if (!monthMap[key]) monthMap[key] = { month, person: e.person, expense: 0, income: 0 }
    if (e.type === "支出") monthMap[key].expense += e.amount
    else monthMap[key].income += e.amount
  }
  let summaryRows = Object.values(monthMap)
    .sort((a, b) => a.month === b.month ? a.person.localeCompare(b.person) : a.month.localeCompare(b.month))
    .map(r => [r.month, r.person, +r.expense.toFixed(2), +r.income.toFixed(2), +(r.income - r.expense).toFixed(2)])

  let exportData = JSON.stringify({
    dh: ["月份", "日期", "记账人", "收/支", "类目", "来源", "金额", "备注"],
    dr: detailRows,
    sh: ["月份", "记账人", "总支出", "总收入", "结余"],
    sr: summaryRows
  })

  let wv = new WebView()
  await wv.loadHTML("<!DOCTYPE html><html><head></head><body></body></html>")

  let loaded = await wv.evaluateJavaScript(`
    var s = document.createElement('script')
    s.src = 'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js'
    s.onload = function() { completion(true) }
    s.onerror = function() { completion(false) }
    document.head.appendChild(s)
  `, true)

  if (!loaded) {
    let a = new Alert()
    a.title = "导出失败"
    a.message = "无法加载 Excel 生成库，请检查网络连接后重试"
    a.addAction("好的")
    await a.presentAlert()
    return
  }

  await wv.evaluateJavaScript(`window.__d = ${exportData}`)

  let base64 = await wv.evaluateJavaScript(`
    (function() {
      var d = window.__d
      var wb = XLSX.utils.book_new()

      var ws1 = XLSX.utils.aoa_to_sheet([d.dh].concat(d.dr))
      ws1['!cols'] = [{wch:10},{wch:12},{wch:10},{wch:6},{wch:8},{wch:8},{wch:10},{wch:30}]
      XLSX.utils.book_append_sheet(wb, ws1, "记账明细")

      var ws2 = XLSX.utils.aoa_to_sheet([d.sh].concat(d.sr))
      ws2['!cols'] = [{wch:10},{wch:10},{wch:12},{wch:12},{wch:12}]
      XLSX.utils.book_append_sheet(wb, ws2, "月度汇总")

      return XLSX.write(wb, {type: 'base64', bookType: 'xlsx'})
    })()
  `)

  let xlsxData = Data.fromBase64String(base64)
  let fileName = `记账导出_${todayStr()}.xlsx`
  let path = fm.joinPath(fm.temporaryDirectory(), fileName)
  fm.write(path, xlsxData)
  await ShareSheet.present([path])
}

// ---------- Widget ----------
async function createWidget() {
  let data = loadData()
  let today = todayStr()
  let todayData = data.filter(e => e.date === today)

  let totalExpense = 0
  let personExpense = {}
  for (let p of PERSONS) personExpense[p] = 0

  for (let e of todayData) {
    if (e.type === "支出") {
      totalExpense += e.amount
      personExpense[e.person] = (personExpense[e.person] || 0) + e.amount
    }
  }

  let w = new ListWidget()
  w.backgroundColor = new Color("#1c1c1e")

  let titleStack = w.addStack()
  let title = titleStack.addText("今日支出")
  title.font = Font.mediumSystemFont(13)
  title.textColor = new Color("#8e8e93")

  w.addSpacer(6)

  let amountText = w.addText(`¥${totalExpense.toFixed(2)}`)
  amountText.font = Font.boldSystemFont(28)
  amountText.textColor = totalExpense > 0 ? new Color("#ff6b6b") : Color.white()

  w.addSpacer(8)

  for (let p of PERSONS) {
    let personStack = w.addStack()
    personStack.centerAlignContent()

    let dot = personStack.addText("●")
    dot.font = Font.systemFont(8)
    dot.textColor = p === "momo" ? new Color("#5ac8fa") : new Color("#ff9f0a")

    personStack.addSpacer(4)

    let nameText = personStack.addText(p)
    nameText.font = Font.systemFont(13)
    nameText.textColor = new Color("#ebebf5")

    personStack.addSpacer(null)

    let pAmount = personStack.addText(`¥${personExpense[p].toFixed(2)}`)
    pAmount.font = Font.mediumSystemFont(13)
    pAmount.textColor = new Color("#ebebf5")
  }

  w.addSpacer(4)

  let dateText = w.addText(today)
  dateText.font = Font.systemFont(10)
  dateText.textColor = new Color("#636366")

  w.url = URLScheme.forRunningScript()

  return w
}

// ---------- 主流程（person-specific 脚本使用）----------
async function runApp(person) {
  let menu = new Alert()
  menu.title = `记账 · ${person}`
  menu.message = "momo & star"
  menu.addAction("记一笔")
  menu.addAction("今日汇总")
  menu.addAction("本月汇总")
  menu.addAction("查看近期记录")
  menu.addAction("导出 Excel (.xlsx)")
  menu.addCancelAction("关闭")

  let choice = await menu.presentAlert()
  switch (choice) {
    case 0: await recordEntry(person); break
    case 1: await showTodaySummary(); break
    case 2: await showMonthlySummary(); break
    case 3: await showRecentRecords(); break
    case 4: await exportXLSX(); break
  }
}

module.exports = {
  PERSONS, EXPENSE_CATEGORIES, INCOME_SOURCES,
  loadData, saveData, todayStr, monthStr,
  recordEntry, pickFromTable,
  showTodaySummary, showMonthlySummary, showRecentRecords,
  exportXLSX, createWidget, runApp
}

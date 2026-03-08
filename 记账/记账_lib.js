// 记账_lib.js — 共享库
// 供 记账.js / 记账-momo.js / 记账-star.js 通过 importModule("记账_lib") 使用

// ---------- 常量 ----------
const FILE_NAME = "记账数据.json"
const XLSX_FILE = "记账表_momo_star.xlsx"
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

const AI_CONFIG = {
  API_KEY: "d0f66a494faf4fcbb74b0200d5b4f23d.EcPiPYYdPWjzEqz3",
  MODEL: "glm-4v-flash",
}

const XLSX_CDNS = [
  "https://cdn.bootcdn.net/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  "https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js",
  "https://cdn.jsdelivr.net/npm/xlsx@0.20.2/dist/xlsx.full.min.js",
]

// ---------- 数据读写 ----------
function loadData() {
  if (fm.fileExists(filePath)) {
    if (!fm.isFileDownloaded(filePath)) fm.downloadFileFromiCloud(filePath)
    try { return JSON.parse(fm.readString(filePath)) } catch (e) {}
  }
  return []
}

async function loadDataAsync() {
  if (fm.fileExists(filePath)) {
    if (!fm.isFileDownloaded(filePath)) await fm.downloadFileFromiCloud(filePath)
    try { return JSON.parse(fm.readString(filePath)) } catch (e) {}
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

// ---------- 通知 ----------
async function notify(title, body) {
  let n = new Notification()
  n.title = title
  n.body = body
  n.sound = "default"
  await n.schedule()
}

// ---------- XLSX 生成（共享）----------
async function generateXLSX(entries, outputPath) {
  // Sheet1：记账明细
  let detailRows = entries.map(e => [
    e.date.substring(0, 7),
    e.date,
    e.person,
    e.type,
    e.type === "支出" ? (e.category || "") : "",
    e.type === "收入" ? (e.source || "") : "",
    e.amount,
    e.note || ""
  ])

  // Sheet2：月度汇总
  let monthMap = {}
  for (let e of entries) {
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
    var cdns = ${JSON.stringify(XLSX_CDNS)}
    var idx = 0
    function tryNext() {
      if (idx >= cdns.length) { completion(false); return }
      var s = document.createElement('script')
      s.src = cdns[idx++]
      s.onload = function() { completion(true) }
      s.onerror = function() { tryNext() }
      document.head.appendChild(s)
    }
    tryNext()
  `, true)
  if (!loaded) throw new Error("无法加载 Excel 库，请检查网络")

  await wv.evaluateJavaScript(`window.__d = ${exportData}; void 0`)

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
      return XLSX.write(wb, {type:'base64', bookType:'xlsx'})
    })()
  `)

  fm.write(outputPath, Data.fromBase64String(base64))
}

// ---------- 手动记账 ----------
async function recordEntry(person) {
  let typeAlert = new Alert()
  typeAlert.title = `${person} · 收入还是支出？`
  typeAlert.addAction("支出")
  typeAlert.addAction("收入")
  typeAlert.addCancelAction("取消")
  let tIdx = await typeAlert.presentAlert()
  if (tIdx === -1) return
  let type = tIdx === 0 ? "支出" : "收入"

  let options = type === "支出" ? EXPENSE_CATEGORIES : INCOME_SOURCES
  let label = type === "支出" ? "类目" : "来源"
  let category = await pickFromTable(`选择${label}`, options)
  if (!category) return

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

  let lines = [`📅 ${today}`, "", `总支出：¥${totalExpense.toFixed(2)}`, `总收入：¥${totalIncome.toFixed(2)}`, ""]
  for (let p of PERSONS) {
    if (personExpense[p] > 0) lines.push(`${p} 支出：¥${personExpense[p].toFixed(2)}`)
  }
  if (totalExpense > 0) {
    lines.push("", "— 支出类目占比 —")
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
    `📅 ${month}`, `共 ${monthData.length} 条记录`, "",
    `总支出：¥${totalExpense.toFixed(2)}`, `总收入：¥${totalIncome.toFixed(2)}`,
    `净收入：¥${(totalIncome - totalExpense).toFixed(2)}`, ""
  ]
  for (let p of PERSONS) {
    if (personExpense[p] > 0) lines.push(`${p} 支出：¥${personExpense[p].toFixed(2)}`)
  }
  if (activePeople.length > 1) lines.push(`人均支出：¥${avgExpense.toFixed(2)}`)

  if (totalExpense > 0) {
    lines.push("", "— 支出类目 —")
    let sorted = Object.entries(categoryExpense).sort((a, b) => b[1] - a[1])
    for (let [cat, amt] of sorted) {
      let pct = ((amt / totalExpense) * 100).toFixed(1)
      lines.push(`${cat}：¥${amt.toFixed(2)}（${pct}%）`)
    }
  }
  if (totalIncome > 0) {
    lines.push("", "— 收入来源 —")
    let sorted = Object.entries(incomeSource).sort((a, b) => b[1] - a[1])
    for (let [src, amt] of sorted) lines.push(`${src}：¥${amt.toFixed(2)}`)
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
  let fileName = `记账导出_${todayStr()}.xlsx`
  let path = fm.joinPath(fm.temporaryDirectory(), fileName)
  await generateXLSX(data, path)
  await ShareSheet.present([path])
}

// ---------- 截图 AI 解析 ----------
async function parseScreenshot(image) {
  let imageData = Data.fromJPEG(image)
  let base64Str = imageData.toBase64String()

  let prompt = `你是支付截图解析助手。分析这张截图，提取消费信息，返回严格的 JSON 格式。

要求：
1. 提取金额、商家、支付方式、日期
2. 根据商家名称智能判断消费类目
3. 如果不是支付/收款截图，返回 {"error": "非支付截图"}

类目范围：${EXPENSE_CATEGORIES.join("、")}
收入来源：${INCOME_SOURCES.join("、")}

返回格式（只返回 JSON，无其他文字）：
{
  "amount": 数字,
  "type": "支出" 或 "收入",
  "category": "类目名称",
  "source": "支付方式（微信/支付宝/银行卡等）",
  "note": "商家名称或交易描述",
  "date": "YYYY-MM-DD"
}`

  let req = new Request("https://open.bigmodel.cn/api/paas/v4/chat/completions")
  req.method = "POST"
  req.headers = {
    "Authorization": `Bearer ${AI_CONFIG.API_KEY}`,
    "Content-Type": "application/json"
  }
  req.body = JSON.stringify({
    model: AI_CONFIG.MODEL,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Str}` } }
      ]
    }],
    max_tokens: 300
  })

  let resp = await req.loadJSON()
  if (resp.error) throw new Error(resp.error.message || "API 调用失败")
  let text = resp.choices[0].message.content.trim()

  text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "")
  let match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("无法解析 AI 返回内容")
  return JSON.parse(match[0])
}

function validateScreenshot(parsed) {
  if (parsed.error) throw new Error(parsed.error)

  let amountStr = String(parsed.amount).replace(/[¥￥元\s,+\-]/g, "")
  let amount = parseFloat(amountStr)
  if (isNaN(amount) || amount <= 0) throw new Error(`金额无效: ${parsed.amount}`)

  let type = parsed.type === "收入" ? "收入" : "支出"
  let category
  if (type === "支出") {
    category = EXPENSE_CATEGORIES.includes(parsed.category) ? parsed.category : "其他"
  } else {
    category = INCOME_SOURCES.includes(parsed.category) ? parsed.category : "其他"
  }

  let date = parsed.date || todayStr()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = todayStr()

  return { amount, type, category, source: parsed.source || "", note: parsed.note || "", date }
}

// ---------- 截图结果确认 & 编辑 ----------
async function confirmAndEditEntry(entry) {
  while (true) {
    let isExpense = entry.type === "支出"
    let catOrSrc = isExpense ? (entry.category || "") : (entry.source || "")
    let label = isExpense ? "类目" : "来源"

    let a = new Alert()
    a.title = "确认记账信息"
    a.message = [
      `类型：${entry.type}`,
      `${label}：${catOrSrc}`,
      `日期：${entry.date}`,
    ].join("\n")
    a.addTextField("金额", String(entry.amount))
    a.addTextField("备注", entry.note || "")
    a.addAction("保存")
    a.addAction("修改类型")
    a.addAction(`修改${label}`)
    a.addAction("修改日期")
    a.addCancelAction("取消")

    let idx = await a.presentAlert()

    // 始终从文本框更新金额和备注
    let amountVal = parseFloat(a.textFieldValue(0).replace(/[¥￥元\s,]/g, ""))
    if (!isNaN(amountVal) && amountVal > 0) entry.amount = amountVal
    entry.note = a.textFieldValue(1).trim()

    if (idx === -1) return null  // 取消
    if (idx === 0) return entry  // 保存

    if (idx === 1) {
      // 切换收支类型
      if (isExpense) {
        entry.type = "收入"
        entry.source = "其他"
        delete entry.category
      } else {
        entry.type = "支出"
        entry.category = "其他"
        delete entry.source
      }
    } else if (idx === 2) {
      // 修改类目/来源
      let options = isExpense ? EXPENSE_CATEGORIES : INCOME_SOURCES
      let ca = new Alert()
      ca.title = `选择${label}`
      for (let opt of options) ca.addAction(opt)
      ca.addCancelAction("取消")
      let cIdx = await ca.presentAlert()
      if (cIdx !== -1) {
        if (isExpense) entry.category = options[cIdx]
        else entry.source = options[cIdx]
      }
    } else if (idx === 3) {
      // 修改日期
      let da = new Alert()
      da.title = "修改日期"
      da.addTextField("日期 (YYYY-MM-DD)", entry.date)
      da.addAction("确认")
      da.addCancelAction("取消")
      let dIdx = await da.presentAlert()
      if (dIdx !== -1) {
        let newDate = da.textFieldValue(0).trim()
        if (/^\d{4}-\d{2}-\d{2}$/.test(newDate)) entry.date = newDate
      }
    }
  }
}

// ---------- 编辑最近一条记录 ----------
async function editLastEntry(person) {
  let data = await loadDataAsync()
  let idx = -1
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].person === person) { idx = i; break }
  }
  if (idx === -1) {
    await notify("无记录", "没有找到可编辑的记录")
    return
  }

  let edited = await confirmAndEditEntry(data[idx])
  if (!edited) return

  data[idx] = edited
  saveData(data)

  let xlsxPath = fm.joinPath(dir, XLSX_FILE)
  await generateXLSX(data, xlsxPath)

  let sign = edited.type === "支出" ? "-" : "+"
  await notify("已更新 ✓", `${edited.type} ${sign}¥${edited.amount.toFixed(2)}`)
}

// ---------- 截图记账主流程 ----------
async function runScreenshot(person) {
  try {
    // 1. 获取截图
    let image = args.images?.[0]
    if (!image && args.shortcutParameter) {
      let param = args.shortcutParameter
      if (typeof param === "string") {
        let path = decodeURIComponent(param.replace(/^file:\/\//, ""))
        image = Image.fromFile(path)
      } else {
        image = param
      }
    }
    if (!image) image = Pasteboard.pasteImage()

    if (!image) {
      let debug = [
        `images: ${args.images?.length ?? "无"}`,
        `param type: ${typeof args.shortcutParameter}`,
        `param: ${String(args.shortcutParameter).slice(0, 100)}`,
      ].join("\n")
      await notify("调试信息", debug)
      Script.complete()
      return
    }

    // 2. AI 解析
    let parsed = await parseScreenshot(image)

    // 3. 验证
    let validated = validateScreenshot(parsed)

    // 4. 构造 entry
    let note = validated.note || ""
    if (validated.source) note = note ? `${note}（${validated.source}）` : validated.source

    let entry = { date: validated.date, person, type: validated.type, amount: validated.amount }
    if (validated.type === "支出") entry.category = validated.category
    else entry.source = validated.category
    if (note) entry.note = note

    // 5. 保存 JSON
    let data = await loadDataAsync()
    data.push(entry)
    saveData(data)

    // 6. 生成 XLSX
    let xlsxPath = fm.joinPath(dir, XLSX_FILE)
    await generateXLSX(data, xlsxPath)

    // 7. 通知（点击可编辑）
    let sign = entry.type === "支出" ? "-" : "+"
    let summary = `${person} ${entry.type} ${sign}¥${entry.amount.toFixed(2)}`
    if (entry.note) summary += `\n${entry.note}`
    let scriptName = encodeURIComponent(Script.name())
    let n = new Notification()
    n.title = "记账成功 ✓（点击可编辑）"
    n.body = summary
    n.sound = "default"
    n.openURL = `scriptable:///run/${scriptName}?action=edit`
    await n.schedule()
    Script.setShortcutOutput(summary)

  } catch (err) {
    await notify("记账失败", err.message || "未知错误")
    Script.setShortcutOutput(`失败: ${err.message}`)
  }
  Script.complete()
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

// ---------- 主菜单 ----------
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
  notify, generateXLSX,
  recordEntry, pickFromTable,
  showTodaySummary, showMonthlySummary, showRecentRecords,
  exportXLSX, createWidget, runApp,
  parseScreenshot, validateScreenshot, confirmAndEditEntry,
  editLastEntry, runScreenshot,
}

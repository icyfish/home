// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: yen-sign;
//
// ── 截图自动记账流程（Back Tap 触发）────────────────────────────
// 支付后点击手机背面三下 → 自动截图 → AI 解析 → 自动记录（数据源与 xlsx 导出共用）
//
// 快捷指令配置：
//   动作 1: 截屏
//   动作 2: 运行 Scriptable 脚本 "记账-momo"，传入参数 = 截屏结果
// ────────────────────────────────────────────────────────────────

const lib = importModule("记账_lib")

// ── 截图 AI 配置 ──────────────────────────────────────────────────
const CONFIG = {
  AI_PROVIDER: "openai",
  API_KEY: "d0f66a494faf4fcbb74b0200d5b4f23d.EcPiPYYdPWjzEqz3",
  MODEL: "glm-4v-flash",
  DEFAULT_PERSON: "momo",
  IMAGE_QUALITY: 0.7,
}

const PARSE_PROMPT = `你是支付截图解析助手。分析这张截图，提取消费信息，返回严格的 JSON 格式。

要求：
1. 提取金额、商家、支付方式、日期
2. 根据商家名称智能判断消费类目
3. 如果不是支付/收款截图，返回 {"error": "非支付截图"}

类目范围：${lib.EXPENSE_CATEGORIES.join("、")}
收入来源：${lib.INCOME_SOURCES.join("、")}

返回格式（只返回 JSON，无其他文字）：
{
  "amount": 数字,
  "type": "支出" 或 "收入",
  "category": "类目名称",
  "source": "支付方式（微信/支付宝/银行卡等）",
  "note": "商家名称或交易描述",
  "date": "YYYY-MM-DD"
}`

// ── AI 解析截图 ───────────────────────────────────────────────────

async function parseScreenshot(image) {
  let imageData = Data.fromJPEG(image, CONFIG.IMAGE_QUALITY)
  let base64Str = imageData.toBase64String()

  let req = new Request("https://open.bigmodel.cn/api/paas/v4/chat/completions")
  req.method = "POST"
  req.headers = {
    "Authorization": `Bearer ${CONFIG.API_KEY}`,
    "Content-Type": "application/json"
  }
  req.body = JSON.stringify({
    model: CONFIG.MODEL,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: PARSE_PROMPT },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Str}` } }
      ]
    }],
    max_tokens: 300
  })

  let resp = await req.loadJSON()
  if (resp.error) throw new Error(resp.error.message || "API 调用失败")
  let text = resp.choices[0].message.content.trim()

  // 去除 markdown 代码块标记
  text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "")
  let match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("无法解析 AI 返回内容")
  return JSON.parse(match[0])
}

// ── 数据验证与修正 ────────────────────────────────────────────────

function validateAndFix(parsed) {
  if (parsed.error) throw new Error(parsed.error)

  let amountStr = String(parsed.amount).replace(/[¥￥元\s,+\-]/g, "")
  let amount = parseFloat(amountStr)
  if (isNaN(amount) || amount <= 0) throw new Error(`金额无效: ${parsed.amount}`)

  let type = parsed.type === "收入" ? "收入" : "支出"
  let category
  if (type === "支出") {
    category = lib.EXPENSE_CATEGORIES.includes(parsed.category) ? parsed.category : "其他"
  } else {
    category = lib.INCOME_SOURCES.includes(parsed.category) ? parsed.category : "其他"
  }

  let date = parsed.date || lib.todayStr()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = lib.todayStr()

  return { amount, type, category, source: parsed.source || "", note: parsed.note || "", date }
}

// ── 追加记录到 JSON + 重新生成 xlsx ──────────────────────────────
// 注意：XLSX.read() 无法解析 Numbers 导出的 xlsx（含透视缓存），
// 因此改用 JSON 作为数据源，每次重新生成 xlsx（与 exportXLSX 同一套模式）

const DATA_FILE = "记账表_momo_star.json"  // 数据源（JSON）
const XLSX_FILE = "记账表_momo_star.xlsx"  // 生成的 xlsx

async function appendEntry(validated) {
  let note = validated.note || ""
  if (validated.source) {
    note = note ? `${note}（${validated.source}）` : validated.source
  }

  let entry = {
    date: validated.date,
    person: CONFIG.DEFAULT_PERSON,
    type: validated.type,
    amount: validated.amount,
    category: validated.type === "支出" ? (validated.category || "") : "",
    source:   validated.type === "收入" ? (validated.category || "") : "",
    note,
  }

  // 1. 追加到 JSON 数据文件
  const fm2 = FileManager.iCloud()
  const dataPath = fm2.joinPath(fm2.documentsDirectory(), DATA_FILE)
  let allEntries = []
  if (fm2.fileExists(dataPath)) {
    if (!fm2.isFileDownloaded(dataPath)) fm2.downloadFileFromiCloud(dataPath)
    try { allEntries = JSON.parse(fm2.readString(dataPath)) } catch(e) {}
  }
  allEntries.push(entry)
  fm2.writeString(dataPath, JSON.stringify(allEntries, null, 2))

  // 2. 重新生成 xlsx（与 记账_lib.js exportXLSX 相同的可靠模式，避免 XLSX.read）
  let detailRows = allEntries.map(e => [
    e.date.substring(0, 7),
    e.date,
    e.person,
    e.type,
    e.category || "",
    e.source   || "",
    e.amount,
    e.note     || "",
  ])

  let exportData = JSON.stringify({
    dh: ["月份", "日期", "记账人", "收/支", "类目", "来源", "金额", "备注"],
    dr: detailRows,
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
  if (!loaded) throw new Error("无法加载 Excel 生成库，请检查网络")

  await wv.evaluateJavaScript(`window.__d = ${exportData}`)

  let base64 = await wv.evaluateJavaScript(`
    (function() {
      var d = window.__d
      var wb = XLSX.utils.book_new()
      var ws = XLSX.utils.aoa_to_sheet([d.dh].concat(d.dr))
      ws['!cols'] = [{wch:10},{wch:12},{wch:10},{wch:6},{wch:8},{wch:8},{wch:10},{wch:30}]
      XLSX.utils.book_append_sheet(wb, ws, "记账明细")
      return XLSX.write(wb, {type:'base64', bookType:'xlsx'})
    })()
  `)

  const xlsxPath = fm2.joinPath(fm2.documentsDirectory(), XLSX_FILE)
  fm2.write(xlsxPath, Data.fromBase64String(base64))

  return entry
}

// ── 通知反馈 ──────────────────────────────────────────────────────

async function notify(title, body) {
  let n = new Notification()
  n.title = title
  n.body = body
  n.sound = "default"
  await n.schedule()
}

// ── 截图自动记账主流程 ────────────────────────────────────────────

async function runScreenshot() {
  try {
    // 1. 获取截图（快捷指令传入 / 剪贴板）
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

    // 2. AI 解析截图
    let parsed = await parseScreenshot(image)

    // 3. 验证修正
    let validated = validateAndFix(parsed)

    // 4. 追加到 JSON + 重新生成 xlsx
    let entry = await appendEntry(validated)

    // 5. 通知
    let sign = entry.type === "支出" ? "-" : "+"
    let summary = `${entry.person} ${entry.type} ${sign}¥${entry.amount.toFixed(2)}`
    if (entry.note) summary += `\n${entry.note}`

    await notify("记账成功 ✓", summary)
    Script.setShortcutOutput(summary)

  } catch (err) {
    await notify("记账失败", err.message || "未知错误")
    Script.setShortcutOutput(`失败: ${err.message}`)
  }

  Script.complete()
}

// ── 入口 ──────────────────────────────────────────────────────────

if (config.runsInWidget) {
  // Widget 模式
  Script.setWidget(await lib.createWidget())
  Script.complete()
} else if (args.images?.length > 0 || args.shortcutParameter) {
  // Back Tap 截图触发：AI 解析 → 自动记录
  await runScreenshot()
} else {
  // 手动打开：正常菜单（记一笔 / 汇总 / 导出 xlsx）
  await lib.runApp("momo")
}

// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: camera;

// ========================================
// 记账_截图.js — 截图 AI 解析自动记账
// 支付后点击手机背面三下 → 自动截图 → AI 解析 → 自动记录
//
// 设置步骤：
// 1. 在下方 CONFIG 中填入你的 API Key
// 2. 将此脚本保存到 Scriptable
// 3. 创建 iOS 快捷指令（见下方说明）
// 4. 设置 Back Tap：设置 → 辅助功能 → 触控 → 轻点背面 → 轻点三下 → 选择快捷指令
//
// 快捷指令配置：
//   动作 1: 截屏
//   动作 2: 运行 Scriptable 脚本 "记账_截图"，传入参数 = 截屏结果
// ========================================

// ── 配置 ──────────────────────────────────────────────────────────
const CONFIG = {
  // AI 服务商: "openai" 或 "claude"（智谱兼容 OpenAI 格式，选 "openai"）
  AI_PROVIDER: "openai",

  // API Key（必填，从 open.bigmodel.cn 获取）
  API_KEY: "d0f66a494faf4fcbb74b0200d5b4f23d.EcPiPYYdPWjzEqz3",

  // 模型名称（glm-4v-flash 免费，支持图片识别）
  MODEL: "glm-4v-flash",

  // 默认记账人（Back Tap 时不弹窗选择，直接使用默认值）
  DEFAULT_PERSON: "momo",

  // 是否在记账前弹窗确认（false = 全自动，true = 弹窗确认后保存）
  CONFIRM_BEFORE_SAVE: false,

  // 图片压缩质量（0-1，越低越快但识别可能变差）
  IMAGE_QUALITY: 0.7,
}

// ── 类目配置（与 记账.js 保持一致）──────────────────────────────
const EXPENSE_CATEGORIES = [
  "餐饮", "交通", "购物", "住房", "娱乐",
  "医疗", "教育", "人情", "宠物", "其他"
]
const INCOME_SOURCES = [
  "工资", "兼职", "投资收益", "红包", "报销", "其他"
]

// ── 数据文件（CSV 格式，Numbers 可直接打开）─────────────────────
const FILE_NAME = "记账表_momo_star.csv"
const CSV_HEADER = "日期,记账人,收/支,类目,来源,金额,备注"
const fm = FileManager.iCloud()
const dir = fm.documentsDirectory()
const filePath = fm.joinPath(dir, FILE_NAME)

function csvEscape(val) {
  let s = String(val ?? "")
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function appendCSVRow(row) {
  let line = row.map(csvEscape).join(",")
  if (fm.fileExists(filePath)) {
    if (!fm.isFileDownloaded(filePath)) {
      fm.downloadFileFromiCloud(filePath)
    }
    let existing = fm.readString(filePath)
    fm.writeString(filePath, existing + "\n" + line)
  } else {
    fm.writeString(filePath, CSV_HEADER + "\n" + line)
  }
}

function todayStr() {
  let d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// ── AI 解析截图 ───────────────────────────────────────────────────

const PARSE_PROMPT = `你是支付截图解析助手。分析这张截图，提取消费信息，返回严格的 JSON 格式。

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

async function parseScreenshot(image) {
  let imageData = Data.fromJPEG(image, CONFIG.IMAGE_QUALITY)
  let base64Str = imageData.toBase64String()

  if (CONFIG.AI_PROVIDER === "claude") {
    return await callClaude(base64Str)
  } else {
    return await callOpenAI(base64Str)
  }
}

async function callOpenAI(base64Str) {
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

  if (resp.error) {
    throw new Error(resp.error.message || "API 调用失败")
  }

  let text = resp.choices[0].message.content.trim()
  return extractJSON(text)
}

async function callClaude(base64Str) {
  let req = new Request("https://api.anthropic.com/v1/messages")
  req.method = "POST"
  req.headers = {
    "x-api-key": CONFIG.API_KEY,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json"
  }
  req.body = JSON.stringify({
    model: CONFIG.MODEL,
    max_tokens: 300,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: base64Str }
        },
        { type: "text", text: PARSE_PROMPT }
      ]
    }]
  })

  let resp = await req.loadJSON()

  if (resp.error) {
    throw new Error(resp.error.message || "API 调用失败")
  }

  let text = resp.content[0].text.trim()
  return extractJSON(text)
}

function extractJSON(text) {
  // 去除 markdown 代码块标记
  text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "")
  let match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("无法解析 AI 返回内容")
  return JSON.parse(match[0])
}

// ── 数据验证与修正 ────────────────────────────────────────────────

function validateAndFix(parsed) {
  if (parsed.error) {
    throw new Error(parsed.error)
  }

  // 去掉金额中的货币符号和空格，如 "¥25.00"、"25.00元"、"￥ 25"
  // 去掉货币符号、正负号、空格等，只保留数字和小数点
  let amountStr = String(parsed.amount).replace(/[¥￥元\s,+\-]/g, "")
  let amount = parseFloat(amountStr)
  if (isNaN(amount) || amount <= 0) {
    throw new Error(`金额无效: ${parsed.amount}`)
  }

  let type = parsed.type === "收入" ? "收入" : "支出"

  // 验证类目
  let category
  if (type === "支出") {
    category = EXPENSE_CATEGORIES.includes(parsed.category) ? parsed.category : "其他"
  } else {
    category = INCOME_SOURCES.includes(parsed.category) ? parsed.category : "其他"
  }

  // 日期验证
  let date = parsed.date || todayStr()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    date = todayStr()
  }

  return {
    amount,
    type,
    category,
    source: parsed.source || "",
    note: parsed.note || "",
    date,
  }
}

// ── 保存记录 ──────────────────────────────────────────────────────

function saveEntry(validated) {
  let note = validated.note || ""
  if (validated.source) {
    note = note ? `${note}（${validated.source}）` : validated.source
  }

  let category = validated.type === "支出" ? validated.category : ""
  let source = validated.type === "收入" ? validated.category : ""

  // CSV 列：日期, 记账人, 收/支, 类目, 来源, 金额, 备注
  appendCSVRow([
    validated.date,
    CONFIG.DEFAULT_PERSON,
    validated.type,
    category,
    source,
    validated.amount,
    note,
  ])

  return {
    date: validated.date,
    person: CONFIG.DEFAULT_PERSON,
    type: validated.type,
    amount: validated.amount,
    category: validated.category,
    note,
  }
}

// ── 通知反馈 ──────────────────────────────────────────────────────

async function notify(title, body) {
  let n = new Notification()
  n.title = title
  n.body = body
  n.sound = "default"
  await n.schedule()
}

// ── 确认弹窗（可选）─────────────────────────────────────────────

async function confirmEntry(validated) {
  let a = new Alert()
  a.title = "确认记账"
  a.message = [
    `日期：${validated.date}`,
    `记账人：${CONFIG.DEFAULT_PERSON}`,
    `类型：${validated.type}`,
    `类目：${validated.category}`,
    `金额：¥${validated.amount.toFixed(2)}`,
    validated.note ? `备注：${validated.note}` : "",
    validated.source ? `支付方式：${validated.source}` : "",
  ].filter(Boolean).join("\n")

  a.addAction("保存")
  a.addAction("修改记账人")
  a.addCancelAction("取消")

  let idx = await a.presentAlert()
  if (idx === -1) return null
  if (idx === 1) {
    // 修改记账人
    let pAlert = new Alert()
    pAlert.title = "选择记账人"
    pAlert.addAction("momo")
    pAlert.addAction("star")
    pAlert.addCancelAction("取消")
    let pIdx = await pAlert.presentAlert()
    if (pIdx === -1) return null
    CONFIG.DEFAULT_PERSON = pIdx === 0 ? "momo" : "star"
  }

  return validated
}

// ── 主流程 ────────────────────────────────────────────────────────

async function main() {
  try {
    // 1. 获取截图
    let image = args.images?.[0]

    if (!image && args.shortcutParameter) {
      let param = args.shortcutParameter
      if (typeof param === "string") {
        // 快捷指令传入的是 file:// URL，去掉前缀
        let path = decodeURIComponent(param.replace(/^file:\/\//, ""))
        image = Image.fromFile(path)
      } else {
        image = param
      }
    }

    if (!image) {
      image = Pasteboard.pasteImage()
    }

    if (!image && config.runsInApp) {
      image = await Photos.fromLibrary()
    }

    if (!image) {
      // 调试：显示 args 中有什么
      let debug = [
        `images: ${args.images?.length ?? "无"}`,
        `param type: ${typeof args.shortcutParameter}`,
        `param: ${String(args.shortcutParameter).slice(0, 100)}`,
        `plainTexts: ${args.plainTexts?.length ?? "无"}`,
        `urls: ${args.urls?.length ?? "无"}`,
        `fileURLs: ${args.fileURLs?.length ?? "无"}`,
      ].join("\n")
      await notify("调试信息", debug)
      Script.complete()
      return
    }

    // 2. AI 解析截图
    let parsed = await parseScreenshot(image)

    // 3. 验证修正
    let validated = validateAndFix(parsed)

    // 4. 确认（如果开启了确认模式）
    if (CONFIG.CONFIRM_BEFORE_SAVE) {
      let confirmed = await confirmEntry(validated)
      if (!confirmed) {
        Script.complete()
        return
      }
    }

    // 5. 保存
    let entry = saveEntry(validated)

    // 6. 通知
    let sign = entry.type === "支出" ? "-" : "+"
    let summary = `${entry.person} ${entry.type} ${sign}¥${entry.amount.toFixed(2)}`
    if (entry.note) summary += `\n${entry.note}`

    await notify("记账成功 ✓", summary)

    // 返回结果给快捷指令
    Script.setShortcutOutput(summary)

  } catch (err) {
    await notify("记账失败", err.message || "未知错误")
    Script.setShortcutOutput(`失败: ${err.message}`)
  }

  Script.complete()
}

await main()

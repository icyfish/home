// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: green; icon-glyph: yen-sign;

// ========================================
// 记账.js — momo & star 双人记账（带选人步骤）
// 需要同目录存在 记账_lib.js
// ========================================

const lib = importModule("记账_lib")

async function main() {
  if (config.runsInWidget) {
    Script.setWidget(await lib.createWidget())
    Script.complete()
    return
  }

  let menu = new Alert()
  menu.title = "记账"
  menu.message = "momo & star"
  menu.addAction("记一笔")
  menu.addAction("今日汇总")
  menu.addAction("本月汇总")
  menu.addAction("查看近期记录")
  menu.addAction("导出 Excel (.xlsx)")
  menu.addCancelAction("关闭")

  let choice = await menu.presentAlert()
  if (choice === 0) {
    // 选人后委托给 lib
    let personAlert = new Alert()
    personAlert.title = "谁在记账？"
    for (let p of lib.PERSONS) personAlert.addAction(p)
    personAlert.addCancelAction("取消")
    let pIdx = await personAlert.presentAlert()
    if (pIdx !== -1) await lib.recordEntry(lib.PERSONS[pIdx])
  } else {
    switch (choice) {
      case 1: await lib.showTodaySummary(); break
      case 2: await lib.showMonthlySummary(); break
      case 3: await lib.showRecentRecords(); break
      case 4: await lib.exportXLSX(); break
    }
  }
}

await main()

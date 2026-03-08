// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: yen-sign;

const lib = importModule("记账_lib")

try {
  if (config.runsInWidget) {
    Script.setWidget(await lib.createWidget())
    Script.complete()
  } else if (URLScheme.parameter("action") === "edit") {
    await lib.editLastEntry("momo")
  } else if (args.images?.length > 0 || args.shortcutParameter) {
    await lib.runScreenshot("momo")
  } else {
    await lib.runApp("momo")
  }
} catch (e) {
  await lib.notify("脚本异常", String(e.message || e).slice(0, 200))
  Script.complete()
}

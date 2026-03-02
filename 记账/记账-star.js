// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: yen-sign;

const lib = importModule("记账_lib")

if (config.runsInWidget) {
  Script.setWidget(await lib.createWidget())
  Script.complete()
} else {
  await lib.runApp("star")
}

#!/usr/bin/env python3
"""
记账快捷指令辅助脚本
从 stdin 读取 ChatGPT 返回的 JSON，通过 AppleScript 写入 Numbers 记账表
"""
import sys
import json
import re
import subprocess
from datetime import datetime

# ── 配置（按需修改）──
LEDGER_FILE = "/Users/fish/Fish/projects/test/记账表_momo_star.xlsx"
SHEET_NAME = "记账明细"


def escape_applescript(s):
    return str(s).replace("\\", "\\\\").replace('"', '\\"')


def parse_json(text):
    """从 ChatGPT 输出中提取 JSON"""
    # 去除 markdown 代码块
    text = re.sub(r"```\w*\n?", "", text)
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        text = match.group()
    return json.loads(text)


def write_to_numbers(date, person, txn_type, category, source, amount, note):
    """通过 AppleScript 将数据写入 Numbers"""
    applescript = f'''
tell application "Numbers"
    set filePath to POSIX file "{escape_applescript(LEDGER_FILE)}"

    -- 查找已打开的文档
    set docFound to false
    repeat with d in documents
        if name of d contains "记账表" then
            set docFound to true
            set targetDoc to d
            exit repeat
        end if
    end repeat

    if not docFound then
        set targetDoc to open filePath
        delay 2
    end if

    tell targetDoc
        tell sheet "{escape_applescript(SHEET_NAME)}"
            tell table 1
                set rowCount to count of rows
                set targetRow to 0
                repeat with i from 2 to rowCount
                    try
                        set cellVal to value of cell 1 of row i
                        if cellVal is missing value then
                            set targetRow to i
                            exit repeat
                        end if
                    on error
                        set targetRow to i
                        exit repeat
                    end try
                end repeat

                if targetRow is 0 then
                    add row below row rowCount
                    set targetRow to rowCount + 1
                end if

                set value of cell 1 of row targetRow to "{escape_applescript(date)}"
                set value of cell 2 of row targetRow to "{escape_applescript(person)}"
                set value of cell 3 of row targetRow to "{escape_applescript(txn_type)}"
                set value of cell 4 of row targetRow to "{escape_applescript(category)}"
                set value of cell 5 of row targetRow to "{escape_applescript(source)}"
                set value of cell 6 of row targetRow to {amount}
                set value of cell 7 of row targetRow to "{escape_applescript(note)}"
            end tell
        end tell
    end tell
end tell
'''
    result = subprocess.run(["osascript", "-e", applescript], capture_output=True, text=True)
    return result.returncode == 0, result.stderr.strip()


# ── 主流程 ──
text = sys.stdin.read().strip()
if not text:
    print("❌ 未收到输入")
    sys.exit(1)

try:
    data = parse_json(text)
except (json.JSONDecodeError, AttributeError) as e:
    print(f"❌ JSON 解析失败: {e}")
    sys.exit(1)

date = data.get("date", datetime.now().strftime("%Y-%m-%d"))
person = data.get("person", "momo")
txn_type = data.get("type", "支出")
category = data.get("category", "其他")
source = data.get("source", "")
amount = float(data.get("amount", 0))
note = data.get("note", "")

ok, err = write_to_numbers(date, person, txn_type, category, source, amount, note)

if ok:
    print(f"✅ 已记录: {person} {txn_type} {category} ¥{amount} {note}")
else:
    print(f"❌ 写入失败: {err}")
    sys.exit(1)

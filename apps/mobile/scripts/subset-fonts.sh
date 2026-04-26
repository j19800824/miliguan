#!/usr/bin/env bash
#
# Re-subset Alibaba PuHuiTi fonts based on Chinese characters actually used
# in src/. Run this whenever you add Chinese strings that the current subset
# might not cover (rendered as boxes).
#
# Requirements:
#   pip3 install --user fonttools brotli
#
# Usage:
#   bash scripts/subset-fonts.sh
#
# Inputs:
#   - Source files under src/ and App.tsx
#   - scripts/font-chars.txt (regenerated each run; commit to lock the set)
#
# Outputs:
#   - assets/fonts/Alibaba-PuHuiTi-{Regular,Medium,Bold}.ttf (replaced in place)
#
# Note: this script assumes the FULL .ttf files are NOT in the repo (they are
# 9MB each — too big). It downloads them on demand into a temp dir, subsets,
# and replaces only the small subset .ttf files.

set -euo pipefail

cd "$(dirname "$0")/.."

ASSETS_DIR="assets/fonts"
SCRIPTS_DIR="scripts"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

CDN_BASE="https://cdn.jsdelivr.net/gh/wordshub/free-font@master/assets/font/中文/阿里巴巴普惠体"

echo "→ Extracting unique CJK characters from source..."
python3 - <<'PY'
import re, glob, os
chars = set()
for f in glob.glob('src/**/*.tsx', recursive=True) + glob.glob('src/**/*.ts', recursive=True) + glob.glob('App.tsx'):
    with open(f) as fh:
        for ch in fh.read():
            if '　' <= ch <= '鿿' or '＀' <= ch <= '￯':
                chars.add(ch)
ascii_set = set(chr(c) for c in range(0x20, 0x7f))
common_extra = '人月日年时分秒姓名地址电话号码密码确定取消提交搜索查询查看修改新增删除返回首页设置帮助通知消息退出登录注册账户密码权限管理列表详情添加编辑保存关闭刷新加载更多暂无空数据网络错误请重试成功失败警告提示完成进行中待处理已完成全部今天昨天明天本周上周本月上月本年我们你们他们正在加载请稍候点击长按双击向上向下向左向右默认普通重要紧急级别高低中类型分类排序筛选导出导入同步备份恢复升级版本更新当前最新最近最早最大最小总计合计平均最高最低首单尾单首先然后最后之前之后立即马上预约定时延时取消订阅开启关闭打开收起展开隐藏显示选择切换确认取消保留'
chars.update(ascii_set)
chars.update(common_extra)
with open('scripts/font-chars.txt', 'w') as out:
    out.write(''.join(sorted(chars)))
print(f'  {len(chars)} unique chars written to scripts/font-chars.txt')
PY

for weight in Regular Medium Bold; do
  echo "→ $weight: download + subset"
  curl -sL -o "$TMP_DIR/Alibaba-PuHuiTi-$weight.ttf" \
    "$CDN_BASE/Alibaba-PuHuiTi-$weight.ttf"

  python3 -m fontTools.subset \
    "$TMP_DIR/Alibaba-PuHuiTi-$weight.ttf" \
    --output-file="$ASSETS_DIR/Alibaba-PuHuiTi-$weight.ttf" \
    --text-file="$SCRIPTS_DIR/font-chars.txt" \
    --no-hinting \
    --desubroutinize \
    --layout-features='*'

  size=$(du -h "$ASSETS_DIR/Alibaba-PuHuiTi-$weight.ttf" | cut -f1)
  echo "  → $size"
done

echo "✓ Done. Re-run \`pnpm --filter mobile clean && pnpm --filter mobile dev\` to pick up changes."

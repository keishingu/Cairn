# Copyright 2026 Cairn Contributors
# SPDX-License-Identifier: Apache-2.0
"""LP と同じ Geist / Geist Mono / Noto Sans JP を Google Fonts から取得し、fonts.local.css を生成する。

書き出し中のフォント読み込み待ちでフレームが欠けないよう、フォントはローカルに置いて参照する。
"""
import hashlib
import os
import re
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CSS_URL = (
    'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800;900'
    '&family=Geist+Mono:wght@400;500;600&family=Noto+Sans+JP:wght@400;500;700;900&display=block'
)
# woff2 を返させるため、モダンブラウザの UA を名乗る
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req) as res:
        return res.read()


def main():
    css = get(CSS_URL).decode()
    os.makedirs(os.path.join(HERE, 'fonts'), exist_ok=True)
    urls = sorted(set(re.findall(r'url\((https://[^)]+)\)', css)))
    for u in urls:
        name = 'fonts/' + hashlib.md5(u.encode()).hexdigest()[:12] + '.woff2'
        path = os.path.join(HERE, name)
        if not os.path.exists(path):
            with open(path, 'wb') as f:
                f.write(get(u))
        css = css.replace(u, name)
    with open(os.path.join(HERE, 'fonts.local.css'), 'w') as f:
        f.write(css)
    print(f'{len(urls)} font files ready')


if __name__ == '__main__':
    main()

# ANIMALS OFFICIAL ICON RING MAKER

お気に入りの写真に ANIMALS のアイコンリングを重ね、1500 × 1500 px の透過 PNG として保存できる Web アプリです。利用者が選ぶ写真は JPEG、PNG、WebP に対応しています。写真の読み込み・編集・合成はブラウザ内で完結し、写真はサーバーへ送信されません。アプリのインストール、会員登録、ログインは不要です。

公開先は [GitHub Pages](https://animals-official.github.io/ring/) です。

## GitHub Pages で公開する

1. GitHub の `animals-official/ring` リポジトリで **Settings → Pages** を開きます。GitHub Free では公開リポジトリで GitHub Pages を利用できます。
2. **Build and deployment → Source** で **GitHub Actions** を選びます。
3. この実装を `main` に反映します。`main` へのプッシュで **Deploy GitHub Pages** が実行されます。すでに反映済みの場合は **Actions → Deploy GitHub Pages → Run workflow** から `main` を選んで実行できます。
4. Actions のデプロイが成功したら公開 URL を開きます。

デプロイ時にリング一覧を生成します。API キー、シークレット、外部サービスの設定は不要です。

## リング素材を追加する

1. GitHub で `rings/` を開き、**Add file → Upload files** で画像をアップロードします。変更にはリポジトリの書き込み権限が必要です。
2. 変更を `main` に反映します。プルリクエストを使う場合はマージします。
3. Actions のデプロイ後に一覧へ表示されます。拡張子を除いたファイル名が表示名になります。日本語やスペースを使えます。

対応する拡張子は PNG、JPEG、JPG、WebP、GIF、AVIF、BMP です。大文字・小文字は問いません。GIF は先頭フレームを静止画として使います。

推奨形式は 1500 × 1500 px の正方形の RGBA PNG です。中央の写真を見せる部分と円の外側を透過にしてください。解像度が異なる正方形のリング素材も使えます。縦横比と透過を保ったまま 1500 × 1500 px に合わせて合成するため、素材の余白も出力に反映されます。透過画素を含まない画像は、短辺の70%を直径とする円を中央にくり抜きます。長方形の素材は縦横比を維持して中央に配置します。

## リング素材を削除・改名する

GitHub の `rings/` から該当画像を削除し、変更を `main` に反映します。改名する場合は新しい名前でアップロードし、旧ファイルを削除してください。Actions が公開用の一覧を再生成します。すべて削除した場合は未登録の案内が表示されます。`rings.json` を手動編集する必要はありません。フォルダを残すための `.gitkeep` は一覧に含まれません。

## ローカルで確認する

Node.js 24 と Python 3 が入った環境で、リポジトリ直下から実行します。Python はローカル確認用の HTTP サーバーにのみ使います。

```sh
node scripts/generate-rings.mjs
python3 -m http.server 8000
```

ブラウザで [localhost:8000](http://localhost:8000/) を開きます。`file://` で直接開くと、ブラウザの制限でリング一覧を取得できません。

### ブラウザテスト

Node.js と Python 3 を用意し、テスト用に Pillow と Playwright をインストールします。

```sh
python3 -m pip install Pillow playwright
python3 -m playwright install chromium
python3 tests/browser_smoke.py
```

インストール済みの Chromium を使う場合は `CHROMIUM_EXECUTABLE` に実行ファイルのパスを指定できます。テストでは 1500 × 1500 px の透過 PNG 出力とリング一覧の生成を確認します。

## トラブルシューティング

- **ページが 404 になる** — Pages の Source が GitHub Actions になっているか、Actions のデプロイが完了したか、URL の末尾が `/ring/` かを確認してください。
- **新作が表示されない** — 対応形式の画像が `rings/` 直下にあり、変更が `main` に反映済みか確認してください。デプロイ完了後にページを再読み込みしてください。
- **リングの背景が白くなる** — 素材の背景が実際に透過されているか確認してください。白で塗られた部分は白のまま合成されます。
- **写真を読み込めない** — JPEG、PNG、WebP の有効な画像が必要です。上限は 20 MB、2,400 万画素、各辺 12,000 px です。HEIC は端末の写真アプリなどで JPEG に変換してください。
- **iPhone で写真アプリに保存したい** — Safari で「画像を保存する！」を押し、共有シートの「画像を保存」を選びます。共有を開けない場合は「画像を開いて保存」を押し、開いた画像を長押しして写真に保存してください。共有機能が使えない環境では、保存ボタンから直接画像を開きます。Discord や X のアプリ内で保存できない場合は Safari で開き直してください。
- **更新前の画面が表示される** — デプロイの完了を確認してからページを再読み込みしてください。公開用の HTML はデプロイごとに異なる URL で JavaScript と CSS を読み込みます。
- **リングが読み込めない** — 画像デコーダーはブラウザに依存します。古いブラウザでは AVIF や GIF の静止画化に必要な機能に対応していない場合があります。BMP の一部の方式ではアルファチャンネルが認識されないことがあります。互換性を優先する場合は透過 PNG を使用してください。

# AWS EC2 デプロイ 実装計画（フェーズ4）

> **進め方（重要）:** これはコーチング用のランブックです。サブエージェントに実行させず、
> **jun本人が各ステップを実行**し、詰まったらヒントを出す方式で進めます。各ステップは
> 「目的 → 作業（使うコマンド/道具）→ ✅検証 → （コード変更があれば）コミット」の形。
> インフラ作業は各層を✅検証してから次へ。テストコードの代わりに `curl`/`systemctl status`
> 等で動作確認します。

**Goal:** estat-aging-dashboard（Django+PostGIS API / Next.js フロント）を、AWS EC2 1台
（Ubuntu, 無料枠）に nginx リバースプロキシ + systemd 常駐で公開し、DuckDNS 無料サブドメイン
+ Let's Encrypt で HTTPS 化する。

**Architecture:** 単一 EC2 に全同居。nginx(80/443) が `/api/*`→gunicorn:8000(Django)、
それ以外→Next.js:3000 に振り分け。PostgreSQL+PostGIS は localhost:5432。1GB メモリは
スワップで補う。同一ドメイン集約により本番では CORS 不要。

**Tech Stack:** Ubuntu 24.04 LTS / EC2 t2.micro / nginx / gunicorn / systemd / PostgreSQL+PostGIS /
Node.js(Next.js) / certbot(Let's Encrypt) / DuckDNS

## Global Constraints

- コスト: 完全無料枠内（月$0）。インスタンスは t2.micro、EBS は無料枠内、Elastic IP は
  「起動中インスタンスに紐付いている間だけ無料」に注意（未紐付けだと課金）。
- リージョン: 東京 ap-northeast-1。
- 秘密情報は `.env`（Git管理外）。SECRET_KEY・DBパスワード等をコミットしない。
- 公開リポジトリ（github.com/kakizakojun/estat-aging-dashboard）。会社名・秘密を含めない。
- 設計書: `docs/superpowers/specs/2026-07-02-aws-ec2-deploy-design.md`

---

## 事前準備（STEP 0）: Django 設定の環境変数化（ローカルで実施）

**目的:** 本番で変わる設定（DEBUG/ALLOWED_HOSTS/DB/GDAL・GEOSパス）を環境変数から読む形に
し、macOS(開発)とUbuntu(本番)で同じコードが動くようにする。SECRET_KEY は実施済み。

**Files:** Modify `backend/config/settings.py` / `backend/.env` / `backend/.env.example`

- [ ] **DEBUG を環境変数化** — `os.environ.get("DEBUG", "False")` を読み、文字列 `"True"` と
  比較して bool 化（環境変数は必ず文字列で来るため。`DEBUG = os.environ.get("DEBUG","False")=="True"`）。
  ローカル `.env` に `DEBUG=True`、本番 `.env` に `DEBUG=False`。
- [ ] **ALLOWED_HOSTS を環境変数化** — カンマ区切り文字列を `.split(",")` でリスト化。
  ローカルは `localhost,127.0.0.1`、本番は `xxxx.duckdns.org`。
- [ ] **DB接続を環境変数化** — `NAME/USER/PASSWORD/HOST/PORT` を `os.environ.get` で読み、
  ローカル値をデフォルトに。本番 `.env` に本番DB認証を書く。
- [ ] **GDAL/GEOS パスを環境変数化** — 現状 macOS 直書き（`/opt/homebrew/...`）。
  `os.environ.get("GDAL_LIBRARY_PATH")` を読み、**値があるときだけ**その設定を定義する
  （Ubuntu では未設定にして GeoDjango の自動検出に任せる）。`.env` に mac のパスを書く。
- [ ] **.env.example を更新** — 上記の新しい変数名（DEBUG/ALLOWED_HOSTS/DB_*/GDAL・GEOS）を
  見本として追記。
- [ ] **✅検証:** `python manage.py runserver` がローカルで従来通り起動する。
- [ ] **コミット:** 「Django設定を環境変数化（DEBUG/ALLOWED_HOSTS/DB/GDAL・GEOS）」

---

## フェーズA: サーバーを用意する（STEP 1–2）

### STEP 1: AWSアカウント & EC2インスタンス起動

**目的:** SSH でログインできる Ubuntu サーバーを無料枠で立てる。

- [ ] AWSアカウント作成（未作成なら）。**請求アラート**を設定（無料枠超過に早く気づくため）。
- [ ] リージョンを**東京(ap-northeast-1)**に切替。
- [ ] EC2 起動: **Ubuntu Server 24.04 LTS** / インスタンスタイプ **t2.micro（無料枠対象）**。
- [ ] **キーペア**を新規作成し `.pem` をDL（**紛失するとログイン不能**。安全に保管、権限 `chmod 400`）。
- [ ] **セキュリティグループ**（ファイアウォール）でインバウンドを開放:
  - 22 (SSH) — 可能なら**自分のIPのみ**に限定
  - 80 (HTTP)、443 (HTTPS) — どこからでも
- [ ] **Elastic IP** を割り当ててインスタンスに紐付け（再起動でIPが変わらないように。DuckDNSの
  向き先を固定するため）。
- [ ] **✅検証:** `ssh -i キー.pem ubuntu@<Elastic IP>` でログインできる。
- コミット対象なし（AWS側の操作）。

### STEP 2: サーバー初期設定（スワップ・基本ツール）

**目的:** メモリ1GBを補い、以降の作業に必要な土台を作る。

- [ ] パッケージ更新: `sudo apt update && sudo apt upgrade -y`
- [ ] **スワップ領域作成**（2GB目安）: `fallocate` で確保 → `mkswap` → `swapon` →
  `/etc/fstab` に追記して再起動後も有効化。
- [ ] タイムゾーン等の基本設定（任意）。基本ツール: `git` 等が入っているか確認。
- [ ] **✅検証:** `free -h` で Swap 行に 2.0Gi が出る。`git --version` が通る。
- コミット対象なし（サーバー設定）。

---

## フェーズB: データとアプリを動かす（STEP 3–5）

### STEP 3: PostgreSQL + PostGIS 導入とデータ投入

**目的:** 本番DBを用意し、アプリのデータを入れる。

- [ ] インストール: `sudo apt install -y postgresql postgresql-contrib postgis`。
  GeoDjango用に `sudo apt install -y gdal-bin libgdal-dev binutils libproj-dev` も。
- [ ] DBユーザーとDB作成: `sudo -u postgres` で `createuser`/`createdb`、または `psql` で
  `CREATE ROLE` + `CREATE DATABASE estat_aging`。本番用**DBパスワードを設定**（`.env`に入れる）。
- [ ] PostGIS拡張: 対象DBで `CREATE EXTENSION postgis;`
- [ ] （STEP4でDjango配置後に）`python manage.py migrate` → `import_aging` → `import_boundaries`
  でデータ投入。**注意**: 境界データ元 `frontend/public/cities/*.json` がサーバー上に必要
  （git clone に含まれる）。
- [ ] **✅検証:** `psql estat_aging -c "SELECT count(*) FROM aging_municipality;"` で件数(≈1400)が出る。

### STEP 4: Django を gunicorn + systemd で動かす

**目的:** APIサーバーを本番構成で常駐させる。

- [ ] コード取得: `git clone https://github.com/kakizakojun/estat-aging-dashboard.git`
- [ ] Python環境: `sudo apt install -y python3-venv` → `python3 -m venv venv` →
  有効化 → `pip install -r requirements.txt`。
- [ ] **本番用 `backend/.env` をサーバー上で作成**（Gitには無いので手で作る）:
  - `SECRET_KEY=`（サーバーで新規生成）、`DEBUG=False`、`ALLOWED_HOSTS=xxxx.duckdns.org`、
    DB認証（本番パスワード）。GDAL/GEOS は Ubuntu では未設定でよい（自動検出）。
- [ ] gunicorn 導入: `pip install gunicorn` → `requirements.txt` に追記。
- [ ] **手動起動で確認**: `gunicorn config.wsgi:application --bind 127.0.0.1:8000` を一時実行。
- [ ] **✅検証(手動):** 別SSHで `curl http://127.0.0.1:8000/api/aging/` がJSONを返す。
- [ ] **systemd サービス化**: `/etc/systemd/system/gunicorn.service` を作成（作業ディレクトリ・
  venvのgunicornパス・bind先・自動再起動 `Restart=always` を指定）→ `daemon-reload` →
  `enable --now`。
- [ ] 静的ファイル: `python manage.py collectstatic`（Django admin用CSS等をnginx配信するため）。
- [ ] **✅検証(常駐):** `systemctl status gunicorn` が active(running)。再度 curl でJSON。
- [ ] **コミット:** 「gunicornを依存に追加」（settings/gunicorn追記分）。※`.env`はコミットしない。

### STEP 5: Next.js を build + systemd で動かす

**目的:** フロント本番サーバーを常駐させる。

- [ ] Node.js 導入（LTS。NodeSource か nvm で。t2.microのメモリに注意）。
- [ ] 依存: `frontend` で `npm install`。
- [ ] **本番用フロント環境変数**: `frontend/.env.production`（または `.env.local`）に
  `NEXT_PUBLIC_API_URL=https://xxxx.duckdns.org` を設定（本番ドメイン。これで client-side
  fetch が同一オリジンになり CORS 不要）。
- [ ] ビルド: `npm run build`（**メモリを食う**。不足時はスワップが吸収。最悪 `NODE_OPTIONS`
  でヒープ調整）。
- [ ] **手動起動で確認**: `npm run start`（=next start, 127.0.0.1:3000）。
- [ ] **✅検証(手動):** `curl http://127.0.0.1:3000` でHTMLが返る。
- [ ] **systemd サービス化**: `/etc/systemd/system/nextjs.service`（`npm run start` を実行、
  作業ディレクトリ・`Restart=always`）→ `enable --now`。
- [ ] **✅検証(常駐):** `systemctl status nextjs` が active。curl でHTML。
- コミット対象なし（`.env.production` はGit管理外にする）。

---

## フェーズC: 公開する（STEP 6–8）

### STEP 6: nginx リバースプロキシ

**目的:** 1つの入口(80)で `/api/*`→Django、それ以外→Next.js に振り分ける。

- [ ] 導入: `sudo apt install -y nginx`
- [ ] サイト設定 `/etc/nginx/sites-available/estat` を作成。必要なディレクティブ:
  - `server_name xxxx.duckdns.org;`
  - `location /api/ { proxy_pass http://127.0.0.1:8000; ...proxyヘッダ }`
  - `location /static/ { alias <collectstaticの出力先>; }`（Django admin用）
  - `location / { proxy_pass http://127.0.0.1:3000; ...proxyヘッダ }`
- [ ] 有効化: `sites-enabled` にシンボリックリンク → デフォルトサイト無効化 →
  `sudo nginx -t`（構文チェック）→ `sudo systemctl reload nginx`
- [ ] **✅検証:** ブラウザで `http://<Elastic IP>` にアクセスし、地図付き画面が出る。県選択で
  市区町村が色分け表示（=nginx経由で両サービスが動いている）。
- コミット対象なし（サーバー設定）。

### STEP 7: DuckDNS 無料サブドメイン

**目的:** 覚えやすい無料ドメインを Elastic IP に向ける。

- [ ] DuckDNS でサインイン、サブドメイン `xxxx` を作成し、IPに Elastic IP を設定。
- [ ] `ALLOWED_HOSTS` と nginx `server_name` にこのドメインが入っていることを再確認。
- [ ] **✅検証:** `http://xxxx.duckdns.org` で画面が出る。
- コミット対象なし。

### STEP 8: HTTPS 化（Let's Encrypt / certbot）

**目的:** 通信を暗号化し、鍵マーク付きで公開する。

- [ ] 導入: `sudo apt install -y certbot python3-certbot-nginx`
- [ ] 証明書取得＋nginx自動設定: `sudo certbot --nginx -d xxxx.duckdns.org`
  （メール入力、http→httpsリダイレクトを有効化）。
- [ ] 自動更新確認: `sudo certbot renew --dry-run`
- [ ] **✅検証:** `https://xxxx.duckdns.org` で鍵マーク付き表示。`http://` は `https://` に
  リダイレクト。県選択→市区町村色分けまで一通り動作。
- コミット対象なし。

---

## 完了後

- [ ] README にデプロイURLと構成図を追記（ポートフォリオとして見せる）。**コミット。**
- [ ] 面接用に「詰まった点と解決」（環境取り違え、メモリ、GDALパス、CORS消滅の理屈など）を
  自分の言葉で言語化できる状態にする。

## 想定ハマりどころ（先回りメモ）

- **GDAL/GEOS**: Ubuntuはパスが違う。STEP0で「env未設定なら自動検出」にしておけば回避。
- **メモリ不足**: `next build` で落ちたらスワップ確認、`NODE_OPTIONS=--max-old-space-size`。
- **502 Bad Gateway**: nginxは動くがupstream(gunicorn/next)が落ちている合図。`systemctl status`。
- **静的ファイル**: Django admin のCSSが崩れる→ collectstatic と nginx `/static/` を確認。
- **課金**: Elastic IP 未紐付け・EBS肥大・t2.micro以外に注意。使わない期間は停止判断。

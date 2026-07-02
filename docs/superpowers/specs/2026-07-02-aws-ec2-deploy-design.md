# AWS EC2 デプロイ設計（フェーズ4）

作成日: 2026-07-02

## 目的

estat-aging-dashboard（Django + PostGIS API + Next.js フロント）を AWS 上に公開する。
主目的は **AWS/Linux の実務スキル習得**。応募先企業が AWS/Linux を
nice-to-have に挙げているため、「EC2 に自分で SSH してサーバーを一から構築・運用した」と
面接で語れる経験を得ることを最優先とする。

## 制約・方針（ブレストで決定）

| 項目 | 決定 | 理由 |
|---|---|---|
| 主目的 | AWS/Linux 学習重視（マネージド最短ではなく EC2 手構築） | 面接で語れる実務経験を積む |
| コスト | 完全に無料枠内（月 $0 目標） | 学習用途。EC2 1台に全部同居させる |
| ドメイン/HTTPS | 無料サブドメイン（DuckDNS 等）+ Let's Encrypt(certbot) | $0 のまま HTTPS まで学ぶ |
| リージョン | 東京（ap-northeast-1） | 日本向け・低レイテンシ |

## アーキテクチャ

EC2 1台（Ubuntu, t2.micro 無料枠）に全コンポーネントを同居させる。

```
インターネット
   │ https://xxxx.duckdns.org  (443, TLSは certbot)
   ▼
EC2 1台 (Ubuntu, 東京, t2.micro)
   ┌──────────┐  /api/*           ┌────────────────────┐
   │  nginx   │ ────────────────▶ │ gunicorn → Django  │  APIサーバー
   │ (80/443) │                   │ (localhost:8000)   │
   │ リバース  │  それ以外          └─────────┬──────────┘
   │ プロキシ  │ ──────────┐                 │ SQL
   │  +TLS    │           ▼                 ▼
   └──────────┘  ┌──────────────────┐ ┌────────────────────┐
                 │ Next.js 本番      │ │ PostgreSQL+PostGIS │  DB
                 │ (localhost:3000) │ │ (localhost:5432)   │
                 └──────────────────┘ └────────────────────┘
   + スワップ領域（メモリ1GBを補う）
```

### 設計の要点

1. **nginx がリバースプロキシ（玄関番）**。外部通信を全て受け、URL パスで振り分ける。
   - `/api/...` → Django(gunicorn) : localhost:8000
   - それ以外 → Next.js : localhost:3000
2. **CORS が不要になる**。本番は画面も API も同一ドメイン `xxxx.duckdns.org`（同一オリジン）
   になるため、別オリジンへのアクセスが発生せず CORS が発動しない。
   `NEXT_PUBLIC_API_URL` を本番ドメインに設定するだけでよい（フェーズ4前の環境変数化が活きる）。
3. **Django/Next.js は外部非公開**（localhost のみ待受）。必ず nginx 経由にし、TLS を
   nginx に一元化する。
4. **全部同居 + スワップ**でメモリ 1GB の制約を補う。
5. **常駐化は systemd**。gunicorn と Next.js を systemd サービス化し、サーバー再起動時の
   自動起動・クラッシュ時の自動復旧を OS に任せる。開発時の `runserver`/`npm run dev`
   （手動起動・ターミナル依存）とは異なり、本番は gunicorn / `next build`→`next start`。

## 構築手順（下の層から積み上げ、各層を検証してから次へ）

| STEP | 内容 | 検証 |
|---|---|---|
| 1 | AWSアカウント & EC2起動。Ubuntu / t2.micro(東京) / セキュリティグループで 22,80,443 開放 / キーペア発行 | SSH でログインできる |
| 2 | サーバー初期設定。apt update/upgrade / スワップ領域作成 / 基本ツール導入 | `free -h` でスワップ確認 |
| 3 | DB層：PostgreSQL + PostGIS 導入・設定。DB作成 → migrate → データ投入(import_aging/import_boundaries) | psql でデータ件数確認 |
| 4 | アプリ層①：Django。git clone → venv → pip install → 本番設定 → gunicorn → systemd化 | `curl localhost:8000/api/aging/` |
| 5 | アプリ層②：Next.js。Node導入 → npm install → NEXT_PUBLIC_API_URL設定 → next build → next start → systemd化 | `curl localhost:3000` |
| 6 | Web層：nginx リバースプロキシ設定（/api→8000, 他→3000） | ブラウザで `http://EC2のIP` |
| 7 | ドメイン：DuckDNS 無料サブドメインを EC2のIP に向ける | `http://xxxx.duckdns.org` |
| 8 | HTTPS：certbot で証明書取得 → TLS化 → http→https リダイレクト | `https://` で鍵マーク |

## STEP 4 で必要な本番用コード修正

ローカル用設定のままでは本番で動かない/危険な箇所を修正する。

- `DEBUG = False`（本番でエラー詳細を晒さない）
- `ALLOWED_HOSTS` にドメインを追加（現状 `[]` のため本番で全リクエストが弾かれる）
- `SECRET_KEY` を環境変数から読む（現状 settings.py 直書き＝GitHub に露出している状態を解消）
- GDAL/GEOS ライブラリパス：現状 macOS Homebrew パス（`/opt/homebrew/...`）が直書き。
  Ubuntu ではパスが異なる（`/usr/lib/...`）ため、環境ごとに切替。**ハマりどころ**。
- 静的ファイル（Django admin の CSS 等）：`collectstatic` して nginx で配信。

## メモリ制約（t2.micro = 1GB）への対応

PostgreSQL + Django(gunicorn) + Next.js(Node) + nginx を 1GB で同時稼働させるのは
タイト。**スワップ領域**（STEP 2）で補う。特に `next build` はメモリを食うため、
ビルド時に不足したらスワップで吸収する。

## リスク・注意点

- **課金事故**：無料枠を超えないよう、インスタンスタイプ・EBS サイズ・稼働時間に注意。
  請求アラートの設定も検討。
- **GDAL/GEOS のパス差異**：macOS と Ubuntu で異なる（上記）。
- **SSH 鍵の管理**：キーペアの秘密鍵を紛失するとログイン不能。安全に保管。
- **セキュリティグループ**：SSH(22) は可能なら自分の IP に限定。

## 学習方針

コーチング（伴走型）。各 STEP は「大枠と概念・使うコマンド名を提示 → jun本人が実行 →
詰まったらヒント → 検証 → なぜ動くか本人が説明」のサイクルで進める。
コードやコマンドの丸写しは避ける。

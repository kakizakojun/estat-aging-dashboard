# 多指標 地域分析ツール 実装計画（フェーズ5：PF強化）

> **進め方（重要）:** これは**コーチング用ランブック**。サブエージェントに実行させず、**jun 本人が各タスクを実装**し、詰まったらヒントを出す方式で進める。各タスクは「目的 → 対象ファイル → インターフェース（関数名・型の契約）→ やること（使う道具・考え方）→ ✅検証 → コミット」の形。**実装本体のコードはここに載せない**（jun が書く。Claude はレビュー）。例外: 純粋関数 `computeScore` は TDD（テスト先行）で進める。

**Goal:** 高齢化率ビューアを、複数指標を加重合成した「課題スコア」で自治体をランキングし、スライダーで重みを変え、Excel 出力できる地域分析ツールへ拡張する。

**Architecture:** データ先行。指標をロング形式（`Metric` / `MunicipalityMetric`）で持ち、ETL で正規化＋課題方向に揃えた `value_challenge` を格納。API は正規化値を返すだけで、スコアはクライアントで加重平均。地図は既存の県→市区町村ドリルダウンを流用しスコアで色分け、全国比較はランキング表。

**Tech Stack:** Django / GeoDjango / PostgreSQL+PostGIS / DRF不使用(既存の関数ビュー) / Next.js(App Router) / React / MapLibre GL JS / SheetJS(xlsx) / Vitest(または既存のテスト環境)

## Global Constraints

- コーチング: jun が実装、Claude はヒント/レビュー/検証。学習対象コード（Django/React）は丸写しさせない。
- 設計書: `docs/superpowers/specs/2026-07-10-multi-metric-analysis-design.md`
- 検証の流儀: `curl` / ブラウザ目視 ＋ `computeScore` だけ単体テスト。
- 既存 API 契約を壊さない（`/api/aging/`・`/api/cities/` は当面維持し、拡張は追加で行う）。
- 秘密情報・会社名をコミットに含めない（公開リポジトリ）。
- コミットはこまめに。git は jun が担当。

---

## フェーズ0：フィージビリティ・スパイク（出典検証）

**このフェーズの意味:** データ先行の最大リスク＝「作り込んだ後に取れないと判明」を先回りで潰す。各指標を**小さく1回試して**から本実装へ。

### Task 0.1: 各指標の出典と結合可否を検証

- **目的:** 4新指標が「市区町村(5桁)で取得でき、`area_code` で既存 `Municipality` に結合できる」ことを確認する。
- **対象:** 調査のみ（コード変更なし）。必要なら `scripts/` に使い捨ての試行スクリプト。
- **やること:**
  - 国勢調査系（**人口増減率・生産年齢人口比率**）: 既存の高齢化率 ETL と同じ e-Stat API 系統で、対象の統計表IDを探す。1都道府県分だけ取得して中身を確認。
  - **財政力指数・1人あたり課税対象所得**: 出典を特定（総務省の財政・税務系）。e-Stat 経由で取れるか、別ファイル(CSV/Excel)DLかを判断。1自治体分の値と市区町村コードの形を確認。
  - 各指標について「サンプル値」「年次」「コード体系(5桁か、旧コードか)」をメモ。
- **✅検証:** 4指標すべてで「サンプル自治体の値が取れ、`area_code` と対応づく」ことを確認できた。取れない指標があれば設計書の「未確定」欄を更新し**差し替え判断**（モデルはロング形式なので設計は無傷）。
- **コミット:** 調査メモ（`docs/` に任意）。コード変更があれば別途。

---

## フェーズ1：データモデル（ロング形式で N 指標対応）

### Task 1.1: `Metric` モデル（指標の定義）

- **目的:** 指標を「1行=1指標」で定義できるようにする。
- **対象:** Modify `backend/aging/models.py`、`makemigrations`/`migrate`。
- **インターフェース（契約・フィールド名と役割。型は jun が選ぶ）:**
  - `key`（一意の識別子・文字列。例 `aging_rate`）/ `name`（表示名）/ `unit`（単位）/ `source`（出典）/ `year`（年次・整数）/ `direction_is_challenge`（真偽: True=高いほど課題）/ 正規化用メタ（min/max を持たせるか、動的計算かは Task 2.3 で決める）
- **やること:** `models.Model` を継承した `Metric` を追加。`key` は `unique=True`。`__str__` を定義。makemigrations→migrate。
- **✅検証:** `migrate` 成功。`python manage.py shell` で `Metric.objects.create(...)` が1件通る。
- **コミット:** 「Metricモデルを追加」

### Task 1.2: `MunicipalityMetric` モデル（自治体×指標=値）

- **目的:** 各自治体の各指標の値を持つ。
- **対象:** Modify `backend/aging/models.py`、migrate。
- **インターフェース:**
  - `municipality`（`Municipality` への ForeignKey）/ `metric`（`Metric` への ForeignKey）/ `value_raw`（生値・浮動小数, null 許容）/ `value_challenge`（0〜1で1=最も課題, null 許容）
  - `class Meta: unique_together = ("municipality", "metric")`（同じ組み合わせは1行）
- **やること:** ForeignKey の `on_delete` を選ぶ。`unique_together` を設定。makemigrations→migrate。
- **✅検証:** `migrate` 成功。shell で `MunicipalityMetric` を1件作れる（既存 `Municipality` と `Metric` を紐付け）。
- **コミット:** 「MunicipalityMetricモデルを追加」

### Task 1.3: 既存の高齢化率を新モデルへ移行

- **目的:** 高齢化率を「最初の1指標」として新モデルに載せ替え、以降の指標追加の型を作る。
- **対象:** Create `backend/aging/management/commands/migrate_aging_to_metric.py`（名前は任意）。
- **やること:**
  - 高齢化率の `Metric` 行を作る（`key="aging_rate"`, `direction_is_challenge=True`）。
  - 既存の値（`Municipality.aging_rate` または `AgingRecord`）を全自治体ぶん `MunicipalityMetric.value_raw` へ投入（`update_or_create` の発想）。
  - `value_challenge` はこの時点では未計算でよい（Task 2.3 でまとめて計算）。
- **✅検証:** `MunicipalityMetric.objects.filter(metric__key="aging_rate").count()` が既存件数(≈1700)と一致。抜き取りで `value_raw` が元の高齢化率と一致。
- **コミット:** 「高齢化率を新指標モデルへ移行するコマンドを追加」

---

## フェーズ2：ETL 汎用化＋新指標＋正規化

### Task 2.1: 指標取り込みの共通処理

- **目的:** 「1指標分（取得 → `area_code` 対応 → `MunicipalityMetric` へ upsert）」を再利用できる形にする。
- **対象:** Create `backend/aging/etl/` などに共通関数、または既存 `import_aging` を一般化。
- **インターフェース（契約）:**
  - `upsert_metric_values(metric_key: str, rows: Iterable[tuple[area_code, value]]) -> int`（投入件数を返す、の発想）
- **やること:** area_code をキーに `Municipality` を引き、`MunicipalityMetric` を `update_or_create` で upsert する共通関数を書く。取得部分（各出典）はここから分離。
- **✅検証:** 高齢化率で共通関数を通して再投入 → 件数が変わらない（冪等）ことを確認。
- **コミット:** 「指標upsertの共通処理を追加」

### Task 2.2: 新指標の取り込みコマンド（Phase0 の結果に従う）

- **目的:** 4新指標を DB に入れる。
- **対象:** Create 指標ごと（または引数切替）の management command。
- **やること:** Phase0 で確定した出典から取得 → area_code へ対応 → Task 2.1 の共通関数で upsert。指標ごとに `Metric` 行（`direction_is_challenge` を正しく: 人口増減率=減少が課題なので符号に注意、財政力指数/生産年齢比率/所得は「高い=課題小」なので False）。
- **✅検証:** 各指標で `MunicipalityMetric` 件数がおおむね自治体数。抜き取りで出典値と一致。
- **コミット:** 指標ごとに「〇〇指標の取り込みを追加」

### Task 2.3: 正規化の後処理（`value_challenge` を計算）

- **目的:** 指標ごとに 0〜1・課題方向に揃えた `value_challenge` を計算・保存。
- **対象:** Create `backend/aging/management/commands/compute_challenge.py`（任意）。
- **やること:**
  - 指標ごとに全自治体の `value_raw` の min/max を求める（外れ値が気になれば分位クリップ。まず min-max）。
  - min-max 正規化 → `direction_is_challenge` が False の指標は `1 - 正規化値` に反転 → `value_challenge` に保存。
- **✅検証:** 各指標で `value_challenge` の min≈0/max≈1。方向確認: 財政力が高い自治体の `value_challenge`（財政力指標）が**低い**。
- **コミット:** 「課題方向の正規化値を計算するコマンドを追加」

---

## フェーズ3：API

### Task 3.1: `/api/metrics/` 新設

- **目的:** スライダーと全国ランキングの元データ（指標定義＋全自治体の正規化値、ジオメトリ無し＝軽い）を返す。
- **対象:** Modify `backend/aging/views.py`（関数追加）、`backend/config/urls.py`（path 追加）。
- **インターフェース（レスポンスの形の契約）:**
  - `{ "metrics": [{key, name, direction_is_challenge}, ...], "municipalities": [{code, name, pref, values: {metric_key: value_challenge, ...}}, ...] }`
- **やること:** `MunicipalityMetric` を自治体ごとに集約（ロング→ワイド）。`JsonResponse` で返す。既存ビューの書き方に合わせる。
- **✅検証:** `curl http://127.0.0.1:8000/api/metrics/` で上記の形の JSON が返る。指標数=5、自治体数≈1700。
- **コミット:** 「/api/metrics/ を追加」

### Task 3.2: `/api/cities/?pref=` を指標値付きに拡張

- **目的:** 地図をスコアで色分けできるよう、市区町村ジオメトリに各指標の `value_challenge` を載せる。
- **対象:** Modify `backend/aging/views.py:cities_list`。
- **インターフェース:** 既存 GeoJSON の各 feature の `properties` に `values: {metric_key: value_challenge}` を追加（`aging_rate` プロパティは当面残して互換維持）。
- **やること:** 各市区町村について `MunicipalityMetric` を引いて properties に載せる。シリアライズ方法は既存の `serialize("geojson", ...)` を踏襲するか、手組みするか判断。
- **✅検証:** `curl "http://127.0.0.1:8000/api/cities/?pref=大分県"` で各 feature に `values` が入っている。
- **コミット:** 「/api/cities/ に指標値を追加」

---

## フェーズ4：フロント

### Task 4.1: `computeScore` 純粋関数（★ここだけ TDD）

- **目的:** 重みと各自治体の指標値から課題スコアを出す、地図とランキングで共有する純粋関数。
- **対象:** Create `frontend/app/score.ts`、Test `frontend/app/score.test.ts`。テスト環境（Vitest 等）が無ければ導入。
- **インターフェース（契約）:**
  - `computeScore(values: Record<string, number>, weights: Record<string, number>): number`
  - 仕様: 利用可能な指標だけで**重みを再正規化**した加重平均。全指標欠損なら `NaN`（または `null`）。
- **やること（TDD の順で、jun が書く）:**
  - [ ] **Step 1: 失敗するテストを書く** — 例のケース（自分で書く）:
    - 単一指標: `computeScore({a:0.5},{a:1}) === 0.5`
    - 2指標の加重平均: `computeScore({a:1,b:0},{a:3,b:1}) === 0.75`
    - 欠損時の重み再正規化: `computeScore({a:1},{a:1,b:1}) === 1`（b が無いので a だけで平均）
  - [ ] **Step 2: 実行して fail を確認** — `npx vitest run app/score.test.ts`（未実装で失敗）
  - [ ] **Step 3: 最小実装を書く**（jun が実装）
  - [ ] **Step 4: 実行して pass を確認**
  - [ ] **Step 5: コミット** — 「computeScoreを追加（TDD）」
- **✅検証:** 上記テストが緑。
- **ヒント方針:** テストの"形"（`describe`/`it`/`expect`）と Vitest の実行コマンドは渡すが、実装本体は jun が書く。

### Task 4.2: `page.tsx` で `/api/metrics/` を取得し `Dashboard` へ

- **目的:** スコア計算の元データをフロントに供給。
- **対象:** Modify `frontend/app/page.tsx`。
- **やること:** サーバー側 fetch で `${INTERNAL_API_URL}/api/metrics/` を取得（既存の aging 取得と同じ流儀）。取得データを `Dashboard` に props で渡す。
- **✅検証:** ブラウザで `Dashboard` に metrics データが渡っている（一時的に件数を表示して確認）。
- **コミット:** 「metricsデータの取得を追加」

### Task 4.3: `WeightSliders` と重み state

- **目的:** 重みをユーザーが調整できるようにする（lifting state up）。
- **対象:** Create `frontend/app/WeightSliders.tsx`、Modify `frontend/app/Dashboard.tsx`。
- **インターフェース:** `Dashboard` が `weights: Record<string,number>` を `useState` で保持。`WeightSliders` は `props: { metrics, weights, onChange }`。
- **やること:** 指標ごとに `<input type="range">`。onChange で該当指標の重みを更新（多統計の onChange 更新パターン、既存の pref 選択と同じ発想）。合計100%表示は任意。
- **✅検証:** スライダーを動かすと `weights` state が変わる（一時表示で確認）。
- **コミット:** 「重みスライダーを追加」

### Task 4.4: `RankingTable`

- **目的:** 全自治体を課題スコアでランキング表示。
- **対象:** Create `frontend/app/RankingTable.tsx`、Modify `Dashboard.tsx`。
- **やること:** `Dashboard` で `useMemo` を使い、全自治体に `computeScore(values, weights)` を適用 → 降順ソート → 上位N（Nは決める、例50）。`RankingTable` は表描画＋行クリックで `onSelect`（地図ハイライト用）。スライダー変化で再計算・再ソート。
- **✅検証:** スライダーを動かすとランキング順が変わる。過疎地の自治体が上位に来る妥当性を目視。
- **コミット:** 「ランキング表を追加」

### Task 4.5: `PrefMap` をスコア色分けに

- **目的:** 地図の色を高齢化率固定から「課題スコア」に差し替え。
- **対象:** Modify `frontend/app/PrefMap.tsx`。
- **やること:** `/api/cities/?pref=` 拡張で得た各市区町村の `values` と `weights` から `computeScore` で色を決める。既存の step/補間カラー式を、スコア（0〜1）ベースに変更。`weights` 変化時に再色付け（`useEffect([weights])` か setPaintProperty）。
- **✅検証:** 県ドリルダウン時、スライダーを変えると地図の色が変わる。
- **コミット:** 「地図の色分けを課題スコアに変更」

### Task 4.6: `ExportButton`（Excel 出力）

- **目的:** 現ランキングを .xlsx で持ち出す。
- **対象:** Create `frontend/app/ExportButton.tsx`、`npm install` で xlsx ライブラリ（SheetJS）。
- **やること:** 現在のランキング配列（自治体名・スコア・各指標の生値/正規化値・現在の重み）を SheetJS でワークブック化しダウンロード。列構成を決める。
- **✅検証:** ボタン → .xlsx がDLされ、開くと画面のランキングと一致。
- **コミット:** 「Excel出力を追加」

---

## フェーズ5：地図美化＋仕上げ

### Task 5.1: 凡例（legend）

- **目的:** スコアの色スケールの意味を示す。
- **対象:** Create `frontend/app/Legend.tsx` など。
- **やること:** スコア0〜1のカラーバー＋ラベル。配色は Task 5.3 と合わせる。
- **✅検証:** 地図に凡例が出て、色と意味が対応。
- **コミット:** 「凡例を追加」

### Task 5.2: ホバーツールチップ

- **目的:** 自治体にホバーで名前・スコア・主要指標を表示。
- **対象:** Modify `PrefMap.tsx`。
- **やること:** MapLibre のマウスイベント（`mousemove`/`mouseleave`）で feature を拾い、名前＋スコア＋寄与の大きい指標を表示。
- **✅検証:** ホバーで情報が出る。
- **コミット:** 「ホバーツールチップを追加」

### Task 5.3: 配色改善

- **目的:** 見やすく色覚に配慮した連続スケール。
- **対象:** Modify `PrefMap.tsx` / `Legend.tsx`。
- **やること:** 実装時に配色ガイド(dataviz スキル)を参照して連続カラーランプを選定。地図と凡例で統一。
- **✅検証:** 目視で改善、凡例と一致。
- **コミット:** 「配色を改善」

### Task 5.4: 欠損の扱い

- **目的:** データ不足自治体で破綻しない。
- **対象:** `score.ts`（再正規化は Task 4.1 で対応済み）、`RankingTable`。
- **やること:** 欠損が多すぎる自治体（例: 過半の指標が欠損）はランキングから除外 or 「データ不足」表示。閾値を決める。地図の geom=null（例: 津久見市）はランキングには出ることを確認。
- **✅検証:** 欠損自治体でスコアが `NaN` を撒き散らさない。ランキングに変な値が出ない。
- **コミット:** 「欠損データの扱いを追加」

### Task 5.5: 回帰確認＋README 反映

- **目的:** 全体が壊れていないか確認し、成果を記録。
- **やること:** 高齢化率のみ→多指標に変わっても、県→地方→市区町村の既存操作が動くか回帰確認（curl＋目視）。README に新機能（課題スコア・スライダー・ランキング・Excel）を追記（別途 README 全面刷新タスクと統合可）。
- **✅検証:** 一通りの操作が動作。
- **コミット:** 「READMEに多指標分析機能を追記」

---

## 想定ハマりどころ（先回りメモ）

- **出典が取れない**（財政力・所得）: フェーズ0で早期発見。取れなければ別指標へ差し替え（モデルはロング形式なので無傷）。
- **年次のズレ**: 指標ごとに最新年次が違う。比較の妥当性のため `Metric.year` を明記し、極端なズレは注記。
- **正規化の外れ値**: 1つの極端値で色が潰れる → 分位クリップを検討。
- **ロング→ワイドのシリアライズ**: `/api/metrics/` の集約が N+1 になりやすい → `select_related`/`prefetch_related` で回避。
- **スライダーの再描画コスト**: 全自治体 re-score は `useMemo` 依存で最適化。地図は setPaintProperty で部分更新。
- **コーチング原則**: 各タスクで jun が実装 → Claude はヒント（メソッド名・考え方）とレビュー。丸写しコードは出さない。

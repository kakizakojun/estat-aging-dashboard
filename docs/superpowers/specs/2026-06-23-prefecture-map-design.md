# 都道府県コロプレス地図 設計書（第1段階）

作成日: 2026-06-23
対象: estat-aging-dashboard フロントエンド（ロードマップ ステップ④の第1段階）

## 目的

47都道府県を高齢化率で色分けした地図（コロプレス）を表示し、既存の市区町村一覧と
連動させる。地図クリック・プルダウン・一覧が同じ「選択中の県」で連動するダッシュボードにする。

将来の段階（本設計の対象外）: 地方別（九州・四国 等）→ 市区町村別。

## スコープ（今回やること）

- 47都道府県を高齢化率で色塗り（コロプレス）
- 凡例の表示
- 県ホバーで県名＋高齢化率のツールチップ（手が届けば）
- 地図クリック → その県に一覧が絞られる（クリック連動）
- プルダウン・地図・一覧が `selectedPref` で連動
- 選択中の県を地図上で枠線ハイライト

やらないこと（将来段階）: 地方別表示、市区町村ポリゴン、クリック以外の高度な操作。

## ライブラリ

- **maplibre-gl**（生のAPIを直接使用。react-map-gl ラッパーは使わない）
- 地図はブラウザ専用（WebGL/window 依存）→ 描画コンポーネントは Client Component。
  `useRef`（描画先 div の確保）＋ `useEffect`（表示後に地図を初期化）で組む。
- ベースマップ（タイル地図）は使わず、背景＋県ポリゴンのみのミニマル構成で開始
  （APIキー不要・無料）。必要になれば後でタイルを追加。

## アーキテクチャ / コンポーネント構成

```
page.tsx (Server Component)
  - 全データを fetch（従来通り）
  - area_type==="都道府県" の47件を抽出し、{ 県コード: 高齢化率 } の対応表(rates)を作る
  - <Dashboard data={data} rates={rates} /> を描画

Dashboard.tsx (Client Component) ★ 新規
  - selectedPref を useState で保持（持ち上げ先 / lifting state up）
  - <PrefMap rates selectedPref onSelectPref={setSelectedPref} />
  - <CityList data selectedPref setSelectedPref />

PrefMap.tsx (Client Component) ★ 新規
  - useRef で地図描画用 div を確保
  - useEffect(初回) で maplibre 地図を初期化、県境 GeoJSON を読み込み、
    各県に高齢化率を合体し、fill レイヤー（色塗り）＋ highlight レイヤー（枠線）を追加
  - 県クリックで onSelectPref(県名) を呼ぶ
  - useEffect([selectedPref]) で highlight レイヤーの対象を更新

CityList.tsx (既存 / 変更)
  - selectedPref を自前で持つのをやめ、selectedPref と setSelectedPref を props で受け取る
  - <select> と filter は props の値を使う（挙動は従来と同じ）
```

## データの流れ

### 地図データ（GeoJSON）
- 47都道府県の境界 GeoJSON（軽量版）を `frontend/public/` に配置し、
  `PrefMap` から fetch する。
- 容量は数百KB程度の簡略版を選ぶ（市区町村版は重いので県版は軽い）。
- 実ファイルのプロパティ名（県コード/県名の入り方）は入手後に中身を見て確定する。

### 突き合わせ（join）
- API側: `area_code` の先頭2桁が県コード（例 "13000" → 13 = 東京都）、`aging_rate` が率。
- GeoJSON側: 各県フィーチャーが県コードまたは県名を持つ。
- **県コードで照合**（名前は表記ゆれの恐れがあるため）。
- 各県フィーチャーの `properties.aging_rate` に率を書き込む。

### 色塗り（コロプレス）
- fill レイヤーの `fill-color` を、`aging_rate` を読むデータ駆動式で指定。
- まずは `step`（数段階のバケツ分け）で実装。区切りは実データの最小〜最大を見て決める。
- 色は薄→濃の1色系（高いほど濃い）。

### 連動（selectedPref）
- `selectedPref` は県名（"東京都" 等）で統一（既存プルダウンに合わせる）。
- 地図クリック: クリックされた県の名前を取り出し `onSelectPref(県名)` を呼ぶ。
- プルダウン: 従来通り `setSelectedPref`。
- どちらの経路でも Dashboard の state が変わり、地図（ハイライト）と一覧（filter）が再描画。

### ハイライト
- 「選択中の県だけを強調する枠線（line）レイヤー」を追加。
- `selectedPref` が変わるたびに `useEffect([selectedPref])` でそのレイヤーの
  フィルタ対象を切り替える。

## 学習上の新概念（コーチング用メモ）

- `useRef`: 再描画をまたいで保持する「箱」。地図インスタンスや描画先DOMの保持に使う。
- `useEffect`: 「表示された後」「ある値が変わった後」に副作用（地図初期化・更新）を走らせる。
- lifting state up: 共有したい state を共通の親へ移す。
- callback props: 子（PrefMap）が親から渡された関数（onSelectPref）を呼んで親の state を変える。

## エラー / 注意点

- maplibre は SSR で動かない → `'use client'` ＋ 初期化は useEffect 内（クライアントのみ実行）。
- GeoJSON の県コード/県名の形式が想定と違う場合あり → 入手後に必ず中身を確認してから join 実装。
- 高齢化率の定義/年次により値域が想定と異なる（例: 東京都 15.8%）→ 色の区切りは実データ基準で。
- maplibre-gl の CSS の読み込みを忘れない（地図UIが崩れる）。

## 実装の段取り（大まかな順序）

1. maplibre-gl 導入、県境 GeoJSON を public/ に配置、中身（プロパティ）確認
2. PrefMap: 空の地図を表示（初期化のみ）
3. GeoJSON を表示（色なしポリゴン）
4. 高齢化率を join し、step で色塗り＋凡例
5. Dashboard を作り state を持ち上げ、CityList を props 受け取りに変更
6. 地図クリック → onSelectPref で一覧連動
7. 選択中県のハイライト
8. （余裕があれば）ホバーのツールチップ

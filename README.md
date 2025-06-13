# Gmail Facebook Blog Automation System

Facebook投稿をGmail経由で監視し、自動でブログ記事を生成・投稿するシステム

## 機能

- Gmail APIを使用したFacebook通知メールの監視
- 特定発話者の投稿内容自動抽出
- AI駆動のブログ記事自動生成
- はてなブログAPI連携による自動投稿
- メールフォルダの自動整理
- エラーハンドリングとログ機能

## セットアップ

### 1. 依存関係のインストール
```bash
npm install
```

### 2. Google Cloud Platform設定
1. [Google Cloud Console](https://console.cloud.google.com/)でプロジェクト作成
2. Gmail API有効化
3. OAuth2クライアント認証情報作成
4. `credentials.json`をダウンロードしてルートディレクトリに配置

### 3. 環境変数設定
`.env.example`を`.env`にコピーして必要な値を設定

### 4. 初期設定実行
```bash
npm run setup
```

### 5. システム起動
```bash
npm start
```

## 設定

### config/config.json
- Gmail監視設定
- Facebook通知パターン
- ブログ生成設定
- はてなブログAPI設定

### .env
- API キー
- 認証情報
- ログレベル設定

## 使用方法

1. システムを起動すると自動でGmail監視を開始
2. Facebook通知メールを検出すると自動処理
3. 生成されたブログ記事は`drafts/`フォルダに保存
4. 設定により自動投稿または手動確認後投稿

## ログ

- `logs/app.log` - アプリケーションログ
- `logs/error.log` - エラーログ
- `logs/gmail.log` - Gmail処理ログ

## ライセンス

MIT
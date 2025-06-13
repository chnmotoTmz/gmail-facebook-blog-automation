FROM node:18-alpine

# 作業ディレクトリ設定
WORKDIR /app

# パッケージファイルをコピー
COPY package*.json ./

# 依存関係インストール
RUN npm ci --only=production && npm cache clean --force

# アプリケーションファイルをコピー
COPY . .

# ログディレクトリ作成
RUN mkdir -p logs drafts temp

# 非rootユーザー作成
RUN addgroup -g 1001 -S nodejs && \
    adduser -S automation -u 1001

# ファイル権限設定
RUN chown -R automation:nodejs /app
USER automation

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "console.log('OK')" || exit 1

# ポート公開（必要に応じて）
EXPOSE 3000

# 起動コマンド
CMD ["npm", "start"]
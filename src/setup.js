require('dotenv').config();
const { google } = require('googleapis');
const readline = require('readline');
const fs = require('fs-extra');
const path = require('path');
const { Logger } = require('./utils/Logger');
const config = require('../config/config.json');

class Setup {
    constructor() {
        this.logger = new Logger();
    }

    async run() {
        console.log('🚀 Facebook→ブログ自動化システム セットアップ開始\n');
        
        try {
            // 1. 環境確認
            await this.checkEnvironment();
            
            // 2. ディレクトリ作成
            await this.createDirectories();
            
            // 3. Gmail API認証設定
            await this.setupGmailAuth();
            
            // 4. 設定ファイル確認
            await this.validateConfig();
            
            // 5. システムテスト
            await this.runSystemTest();
            
            console.log('\n✅ セットアップが完了しました！');
            console.log('\n次のコマンドでシステムを開始できます:');
            console.log('npm start');
            
        } catch (error) {
            console.error('\n❌ セットアップエラー:', error.message);
            process.exit(1);
        }
    }

    async checkEnvironment() {
        console.log('📋 環境確認中...');
        
        // Node.jsバージョン確認
        const nodeVersion = process.version;
        console.log(`- Node.js バージョン: ${nodeVersion}`);
        
        // .envファイル確認
        if (!await fs.pathExists('.env')) {
            console.log('⚠️  .envファイルが見つかりません');
            console.log('📝 .env.exampleを.envにコピーして設定を行ってください');
            throw new Error('.envファイルが必要です');
        }
        
        // 必要な環境変数チェック
        const requiredEnvVars = [
            'GMAIL_CLIENT_ID',
            'GMAIL_CLIENT_SECRET',
            'HATENA_API_KEY',
            'HATENA_API_SECRET',
            'HATENA_USERNAME',
            'HATENA_BLOG_ID',
            'OPENAI_API_KEY'
        ];
        
        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        
        if (missingVars.length > 0) {
            console.log(`⚠️  以下の環境変数が設定されていません: ${missingVars.join(', ')}`);
            throw new Error('必要な環境変数が不足しています');
        }
        
        console.log('✅ 環境確認完了\n');
    }

    async createDirectories() {
        console.log('📁 ディレクトリ作成中...');
        
        const directories = ['logs', 'drafts', 'temp'];
        
        for (const dir of directories) {
            await fs.ensureDir(dir);
            console.log(`- ${dir}/`);
        }
        
        console.log('✅ ディレクトリ作成完了\n');
    }

    async setupGmailAuth() {
        console.log('🔐 Gmail API認証設定中...');
        
        const credentialsPath = config.gmail.credentialsPath;
        const tokenPath = config.gmail.tokenPath;
        
        // credentials.json確認
        if (!await fs.pathExists(credentialsPath)) {
            console.log('⚠️  credentials.jsonが見つかりません');
            console.log('📖 Google Cloud Consoleから認証情報をダウンロードしてください:');
            console.log('   1. https://console.cloud.google.com/');
            console.log('   2. プロジェクト作成 → Gmail API有効化');
            console.log('   3. 認証情報 → OAuth2クライアント作成');
            console.log('   4. credentials.jsonをダウンロードしてルートに配置');
            throw new Error('credentials.jsonが必要です');
        }
        
        // トークンが既に存在する場合
        if (await fs.pathExists(tokenPath)) {
            console.log('✅ 既存の認証トークンを発見しました');
            return;
        }
        
        // 新しい認証を実行
        await this.performOAuthFlow();
        
        console.log('✅ Gmail API認証完了\n');
    }

    async performOAuthFlow() {
        const credentials = await fs.readJson(config.gmail.credentialsPath);
        const { client_secret, client_id, redirect_uris } = credentials.installed;
        
        const oAuth2Client = new google.auth.OAuth2(
            client_id,
            client_secret,
            redirect_uris[0]
        );
        
        // 認証URL生成
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: config.gmail.scopes,
        });
        
        console.log('\n📱 以下のURLにアクセスして認証を完了してください:');
        console.log(authUrl);
        
        // 認証コード入力
        const code = await this.getAuthCode();
        
        // トークン取得
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);
        
        // トークン保存
        await fs.writeJson(config.gmail.tokenPath, tokens);
        console.log('✅ 認証トークンを保存しました');
    }

    async getAuthCode() {
        return new Promise((resolve) => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
            });
            
            rl.question('\n🔑 認証コードを入力してください: ', (code) => {
                rl.close();
                resolve(code);
            });
        });
    }

    async validateConfig() {
        console.log('⚙️  設定ファイル確認中...');
        
        // 対象ユーザー設定チェック
        if (config.facebook.targetUsers.length === 0) {
            console.log('⚠️  Facebook対象ユーザーが設定されていません');
            console.log('📝 config/config.jsonのfacebook.targetUsersに監視したいユーザー名を追加してください');
        }
        
        // ブログ設定チェック
        if (!config.blog.platform) {
            throw new Error('ブログプラットフォームが設定されていません');
        }
        
        console.log('✅ 設定ファイル確認完了\n');
    }

    async runSystemTest() {
        console.log('🧪 システムテスト実行中...');
        
        try {
            // Gmail接続テスト
            const { GmailService } = require('./services/GmailService');
            const gmailService = new GmailService();
            await gmailService.authenticate();
            console.log('✅ Gmail API接続 - OK');
            
            // はてなブログ接続テスト
            const { HatenaBlogService } = require('./services/HatenaBlogService');
            const hatenaBlogService = new HatenaBlogService();
            await hatenaBlogService.authenticate();
            console.log('✅ はてなブログ API接続 - OK');
            
            // OpenAI接続テスト（簡易）
            if (process.env.OPENAI_API_KEY) {
                console.log('✅ OpenAI API キー設定 - OK');
            }
            
        } catch (error) {
            console.log(`❌ システムテストエラー: ${error.message}`);
            throw error;
        }
        
        console.log('✅ システムテスト完了\n');
    }
}

// セットアップ実行
if (require.main === module) {
    const setup = new Setup();
    setup.run().catch(console.error);
}

module.exports = { Setup };
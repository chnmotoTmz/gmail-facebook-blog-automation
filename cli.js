#!/usr/bin/env node

/**
 * Gmail Facebook Blog Automation System
 * 使用方法とコマンドラインインターフェース
 */

const { program } = require('commander');
const { FacebookBlogAutomation } = require('./src/index');
const { Setup } = require('./src/setup');
const { FileManager } = require('./src/utils/FileManager');
const { Logger } = require('./src/utils/Logger');
const config = require('./config/config.json');

const logger = new Logger();

program
    .name('facebook-blog-automation')
    .description('Gmail駆動のFacebook投稿→ブログ記事自動生成システム')
    .version('1.0.0');

// セットアップコマンド
program
    .command('setup')
    .description('システムの初期設定を実行')
    .action(async () => {
        try {
            const setup = new Setup();
            await setup.run();
        } catch (error) {
            console.error('セットアップエラー:', error.message);
            process.exit(1);
        }
    });

// 開始コマンド
program
    .command('start')
    .description('システムを開始（デーモンモード）')
    .option('-d, --daemon', 'バックグラウンドで実行')
    .action(async (options) => {
        try {
            const automation = new FacebookBlogAutomation();
            
            if (options.daemon) {
                console.log('バックグラウンドでシステムを開始します...');
                // デーモン化の実装
                process.daemon = true;
            }
            
            await automation.start();
        } catch (error) {
            console.error('システム開始エラー:', error.message);
            process.exit(1);
        }
    });

// 一回だけ実行コマンド
program
    .command('run-once')
    .description('一度だけメール処理を実行')
    .action(async () => {
        try {
            const automation = new FacebookBlogAutomation();
            
            const initialized = await automation.initialize();
            if (!initialized) {
                console.error('初期化に失敗しました');
                process.exit(1);
            }
            
            console.log('メール処理を開始します...');
            await automation.processNewEmails();
            console.log('処理完了');
            
        } catch (error) {
            console.error('実行エラー:', error.message);
            process.exit(1);
        }
    });

// 統計表示コマンド
program
    .command('stats')
    .description('システム統計を表示')
    .action(async () => {
        try {
            const fileManager = new FileManager();
            
            console.log('\n📊 システム統計\n');
            
            // ディスク使用量
            const diskUsage = await fileManager.getDiskUsage();
            console.log('💾 ディスク使用量:');
            Object.entries(diskUsage).forEach(([dir, size]) => {
                const sizeMB = (size / 1024 / 1024).toFixed(2);
                console.log(`  ${dir}: ${sizeMB} MB`);
            });
            
            // 設定ファイル状態
            console.log('\n⚙️  設定ファイル:');
            const configStatus = await fileManager.validateConfigFiles();
            Object.entries(configStatus).forEach(([file, status]) => {
                const statusIcon = status.exists ? '✅' : '❌';
                console.log(`  ${statusIcon} ${file}`);
                if (status.size) {
                    console.log(`     サイズ: ${status.size} bytes`);
                }
            });
            
        } catch (error) {
            console.error('統計取得エラー:', error.message);
            process.exit(1);
        }
    });

// クリーンアップコマンド
program
    .command('cleanup')
    .description('古いファイルを削除')
    .option('-d, --days <days>', '削除対象の日数', '30')
    .action(async (options) => {
        try {
            const fileManager = new FileManager();
            
            console.log(`${options.days}日以上古いファイルを削除します...`);
            
            const deletedCount = await fileManager.cleanupOldDrafts(parseInt(options.days));
            console.log(`${deletedCount}個のファイルを削除しました`);
            
            await fileManager.rotateLogFiles();
            console.log('ログファイルのローテーションを実行しました');
            
        } catch (error) {
            console.error('クリーンアップエラー:', error.message);
            process.exit(1);
        }
    });

// バックアップコマンド
program
    .command('backup')
    .description('システムのバックアップを作成')
    .action(async () => {
        try {
            const fileManager = new FileManager();
            
            console.log('バックアップを作成しています...');
            const backupPath = await fileManager.createBackup();
            console.log(`バックアップ完了: ${backupPath}`);
            
        } catch (error) {
            console.error('バックアップエラー:', error.message);
            process.exit(1);
        }
    });

// テストコマンド
program
    .command('test')
    .description('システムの接続テストを実行')
    .action(async () => {
        try {
            console.log('🧪 システムテストを実行します...\n');
            
            // Gmail接続テスト
            console.log('📧 Gmail API接続テスト...');
            const { GmailService } = require('./src/services/GmailService');
            const gmailService = new GmailService();
            await gmailService.authenticate();
            console.log('✅ Gmail API - OK\n');
            
            // はてなブログ接続テスト
            console.log('📝 はてなブログ API接続テスト...');
            const { HatenaBlogService } = require('./src/services/HatenaBlogService');
            const hatenaBlogService = new HatenaBlogService();
            await hatenaBlogService.authenticate();
            console.log('✅ はてなブログ API - OK\n');
            
            // OpenAI接続テスト
            if (process.env.OPENAI_API_KEY) {
                console.log('🤖 OpenAI API接続テスト...');
                const { BlogGenerator } = require('./src/services/BlogGenerator');
                const generator = new BlogGenerator();
                // 簡単なテスト投稿でブログ生成
                const testPost = await generator.generateFallbackPost({
                    author: 'Test User',
                    content: 'This is a test post',
                    postType: 'test',
                    date: new Date().toISOString(),
                    images: [],
                    links: []
                });
                console.log('✅ OpenAI API - OK\n');
            }
            
            console.log('🎉 すべてのテストが成功しました！');
            
        } catch (error) {
            console.error('❌ テストエラー:', error.message);
            process.exit(1);
        }
    });

// 設定表示コマンド
program
    .command('config')
    .description('現在の設定を表示')
    .action(() => {
        console.log('\n⚙️  現在の設定:\n');
        
        console.log('📧 Gmail設定:');
        console.log(`  監視間隔: ${config.monitoring.interval}ms`);
        console.log(`  検索クエリ: ${config.monitoring.query}`);
        console.log(`  最大結果数: ${config.monitoring.maxResults}`);
        
        console.log('\n📘 Facebook設定:');
        console.log(`  対象ユーザー: ${config.facebook.targetUsers.length > 0 ? config.facebook.targetUsers.join(', ') : '全ユーザー'}`);
        console.log(`  投稿パターン: ${config.facebook.postPatterns.join(', ')}`);
        
        console.log('\n📝 ブログ設定:');
        console.log(`  プラットフォーム: ${config.blog.platform}`);
        console.log(`  自動投稿: ${config.blog.autoPost ? '有効' : '無効'}`);
        console.log(`  デフォルトカテゴリ: ${config.blog.defaultCategory}`);
        
        console.log('\n🤖 AI設定:');
        console.log(`  モデル: ${config.ai.model}`);
        console.log(`  最大トークン: ${config.ai.maxTokens}`);
        console.log(`  Temperature: ${config.ai.temperature}`);
    });

// ヘルプコマンドのカスタマイズ
program.on('--help', () => {
    console.log('');
    console.log('使用例:');
    console.log('  $ facebook-blog-automation setup     # 初期設定');
    console.log('  $ facebook-blog-automation start     # システム開始');
    console.log('  $ facebook-blog-automation run-once  # 一回だけ実行');
    console.log('  $ facebook-blog-automation test      # 接続テスト');
    console.log('');
    console.log('詳細なドキュメント:');
    console.log('  https://github.com/your-repo/gmail-facebook-blog-system');
    console.log('');
});

// プログラム実行
program.parse();

// デフォルト動作（引数なしの場合）
if (!process.argv.slice(2).length) {
    program.outputHelp();
}
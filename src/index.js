require('dotenv').config();
const { GmailService } = require('./services/GmailService');
const { FacebookParser } = require('./services/FacebookParser');
const { BlogGenerator } = require('./services/BlogGenerator');
const { HatenaBlogService } = require('./services/HatenaBlogService');
const { Logger } = require('./utils/Logger');
const cron = require('node-cron');
const config = require('../config/config.json');

class FacebookBlogAutomation {
    constructor() {
        this.logger = new Logger();
        this.gmailService = new GmailService();
        this.facebookParser = new FacebookParser();
        this.blogGenerator = new BlogGenerator();
        this.hatenaBlogService = new HatenaBlogService();
        this.isRunning = false;
    }

    async initialize() {
        try {
            this.logger.info('システム初期化開始');
            
            // Gmail API認証
            await this.gmailService.authenticate();
            this.logger.info('Gmail API認証完了');
            
            // はてなブログAPI認証
            await this.hatenaBlogService.authenticate();
            this.logger.info('はてなブログAPI認証完了');
            
            this.logger.info('システム初期化完了');
            return true;
        } catch (error) {
            this.logger.error('システム初期化エラー:', error);
            return false;
        }
    }

    async processNewEmails() {
        if (this.isRunning) {
            this.logger.debug('前回の処理がまだ実行中です');
            return;
        }

        this.isRunning = true;
        
        try {
            this.logger.info('新着メール処理開始');
            
            // Facebook通知メールを取得
            const emails = await this.gmailService.getFacebookNotifications();
            this.logger.info(`${emails.length}件のFacebook通知を発見`);
            
            for (const email of emails) {
                try {
                    await this.processEmail(email);
                } catch (error) {
                    this.logger.error(`メール処理エラー [${email.id}]:`, error);
                }
            }
            
            this.logger.info('新着メール処理完了');
        } catch (error) {
            this.logger.error('新着メール処理エラー:', error);
        } finally {
            this.isRunning = false;
        }
    }

    async processEmail(email) {
        this.logger.info(`メール処理開始: ${email.subject}`);
        
        // Facebook投稿内容を解析
        const postData = await this.facebookParser.extractPostData(email);
        
        if (!postData) {
            this.logger.debug('Facebook投稿データが見つかりませんでした');
            await this.gmailService.markAsProcessed(email.id);
            return;
        }

        // 対象ユーザーかチェック
        if (!this.isTargetUser(postData.author)) {
            this.logger.debug(`対象外ユーザー: ${postData.author}`);
            await this.gmailService.markAsProcessed(email.id);
            return;
        }

        this.logger.info(`対象投稿発見: ${postData.author} - ${postData.content.substring(0, 50)}...`);
        
        // ブログ記事生成
        const blogPost = await this.blogGenerator.generatePost(postData);
        
        // 下書きとして保存
        await this.saveDraft(blogPost, postData);
        
        // 自動投稿が有効な場合
        if (config.blog.autoPost) {
            await this.hatenaBlogService.publishPost(blogPost);
            this.logger.info('ブログ記事を自動投稿しました');
        } else {
            this.logger.info('ブログ記事を下書きとして保存しました');
        }
        
        // メールを処理済みとしてマーク
        await this.gmailService.markAsProcessed(email.id);
    }

    isTargetUser(author) {
        const targetUsers = config.facebook.targetUsers;
        return targetUsers.length === 0 || targetUsers.includes(author);
    }

    async saveDraft(blogPost, postData) {
        const fs = require('fs-extra');
        const moment = require('moment');
        
        const filename = `draft_${moment().format('YYYYMMDD_HHmmss')}_${postData.author}.md`;
        const filepath = `./drafts/${filename}`;
        
        const content = `---
title: ${blogPost.title}
author: ${postData.author}
date: ${postData.date}
source: Facebook
auto_generated: true
---

${blogPost.content}
`;
        
        await fs.writeFile(filepath, content, 'utf8');
        this.logger.info(`下書き保存: ${filepath}`);
    }

    async start() {
        this.logger.info('Facebook→ブログ自動化システム開始');
        
        const initialized = await this.initialize();
        if (!initialized) {
            this.logger.error('初期化に失敗しました');
            return;
        }
        
        // 初回実行
        await this.processNewEmails();
        
        // 定期実行設定（5分毎）
        cron.schedule('*/5 * * * *', () => {
            this.processNewEmails();
        });
        
        this.logger.info('システムが正常に開始されました');
        this.logger.info('5分毎にFacebook通知をチェックします');
    }

    async stop() {
        this.logger.info('システム停止中...');
        // クリーンアップ処理
        this.logger.info('システムが停止されました');
    }
}

// メイン実行
if (require.main === module) {
    const automation = new FacebookBlogAutomation();
    
    automation.start().catch(error => {
        console.error('システム開始エラー:', error);
        process.exit(1);
    });
    
    // 終了処理
    process.on('SIGINT', async () => {
        await automation.stop();
        process.exit(0);
    });
}

module.exports = { FacebookBlogAutomation };
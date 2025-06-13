const winston = require('winston');
const path = require('path');

class Logger {
    constructor() {
        this.logger = winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: winston.format.combine(
                winston.format.timestamp({
                    format: 'YYYY-MM-DD HH:mm:ss'
                }),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            defaultMeta: { service: 'facebook-blog-automation' },
            transports: [
                // エラーログファイル
                new winston.transports.File({
                    filename: path.join(process.cwd(), 'logs', 'error.log'),
                    level: 'error',
                    maxsize: 5242880, // 5MB
                    maxFiles: 5
                }),
                
                // 一般ログファイル
                new winston.transports.File({
                    filename: path.join(process.cwd(), 'logs', 'app.log'),
                    maxsize: 5242880, // 5MB
                    maxFiles: 10
                }),
                
                // Gmail専用ログ
                new winston.transports.File({
                    filename: path.join(process.cwd(), 'logs', 'gmail.log'),
                    level: 'debug',
                    maxsize: 5242880, // 5MB
                    maxFiles: 3,
                    format: winston.format.combine(
                        winston.format.timestamp(),
                        winston.format.printf(({ timestamp, level, message, ...meta }) => {
                            return `${timestamp} [${level.toUpperCase()}] Gmail: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
                        })
                    )
                })
            ]
        });

        // 開発環境では コンソール出力も追加
        if (process.env.NODE_ENV !== 'production') {
            this.logger.add(new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple(),
                    winston.format.printf(({ timestamp, level, message, ...meta }) => {
                        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
                        return `${timestamp} [${level}] ${message} ${metaStr}`;
                    })
                )
            }));
        }
    }

    info(message, meta = {}) {
        this.logger.info(message, meta);
    }

    error(message, meta = {}) {
        this.logger.error(message, meta);
    }

    warn(message, meta = {}) {
        this.logger.warn(message, meta);
    }

    debug(message, meta = {}) {
        this.logger.debug(message, meta);
    }

    // Gmail専用ログメソッド
    gmailLog(level, message, meta = {}) {
        this.logger.log(level, message, { service: 'gmail', ...meta });
    }

    // 処理時間を測定するヘルパー
    startTimer(label) {
        const start = Date.now();
        return {
            end: () => {
                const duration = Date.now() - start;
                this.info(`${label} 処理時間: ${duration}ms`);
                return duration;
            }
        };
    }

    // エラーの詳細ログ
    logError(error, context = '') {
        const errorInfo = {
            message: error.message,
            stack: error.stack,
            context: context,
            timestamp: new Date().toISOString()
        };
        
        this.error('詳細エラー情報', errorInfo);
    }

    // APIリクエストログ
    logApiRequest(method, url, statusCode, responseTime) {
        this.info('API Request', {
            method,
            url,
            statusCode,
            responseTime: `${responseTime}ms`
        });
    }

    // Facebook投稿処理ログ
    logFacebookPost(postData, status) {
        this.info('Facebook投稿処理', {
            author: postData.author,
            postType: postData.postType,
            contentLength: postData.content.length,
            status: status,
            timestamp: new Date().toISOString()
        });
    }

    // ブログ記事生成ログ
    logBlogGeneration(blogPost, processingTime) {
        this.info('ブログ記事生成', {
            title: blogPost.title,
            contentLength: blogPost.content.length,
            tags: blogPost.tags,
            processingTime: `${processingTime}ms`,
            timestamp: new Date().toISOString()
        });
    }

    // システム統計ログ
    logSystemStats(stats) {
        this.info('システム統計', {
            ...stats,
            timestamp: new Date().toISOString()
        });
    }

    // カスタムフォーマットでログ出力
    custom(level, category, message, data = {}) {
        this.logger.log(level, `[${category}] ${message}`, data);
    }
}

module.exports = { Logger };
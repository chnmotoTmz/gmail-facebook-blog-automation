const cheerio = require('cheerio');
const { Logger } = require('../utils/Logger');
const config = require('../../config/config.json');

class FacebookParser {
    constructor() {
        this.logger = new Logger();
    }

    async extractPostData(email) {
        try {
            this.logger.debug(`Facebook投稿解析開始: ${email.subject}`);
            
            // HTMLメール本文を解析
            const $ = cheerio.load(email.body);
            
            // Facebook投稿データを抽出
            const postData = {
                author: this.extractAuthor(email.subject, $),
                content: this.extractContent($),
                postType: this.extractPostType(email.subject, $),
                date: this.parseDate(email.date),
                images: this.extractImages($),
                links: this.extractLinks($),
                originalEmail: {
                    subject: email.subject,
                    from: email.from,
                    date: email.date
                }
            };
            
            // 投稿内容が有効かチェック
            if (!postData.author || !postData.content) {
                this.logger.debug('投稿データが不完全です');
                return null;
            }
            
            this.logger.info(`投稿解析完了: ${postData.author} - ${postData.postType}`);
            return postData;
            
        } catch (error) {
            this.logger.error('Facebook投稿解析エラー:', error);
            return null;
        }
    }

    extractAuthor(subject, $) {
        // 件名から投稿者名を抽出
        const patterns = [
            /(.+?) posted in/,
            /(.+?) shared a post/,
            /(.+?) added a new photo/,
            /(.+?) updated their status/,
            /(.+?) wrote a new post/
        ];
        
        for (const pattern of patterns) {
            const match = subject.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }
        
        // HTMLから抽出を試行
        const authorElements = $('[data-testid="post_author"], .author, .post-author');
        if (authorElements.length > 0) {
            return authorElements.first().text().trim();
        }
        
        // その他のパターンを試行
        const textContent = $.text();
        const authorMatch = textContent.match(/(?:Posted by|From|By)\s+([^\n\r]+)/i);
        if (authorMatch) {
            return authorMatch[1].trim();
        }
        
        this.logger.debug('投稿者名を抽出できませんでした');
        return null;
    }

    extractContent($) {
        // 投稿内容を抽出する優先順位
        const selectors = [
            '[data-testid="post_message"]',
            '.post-content',
            '.message',
            '.post-text',
            '.userContent',
            'p:contains("wrote:")',
            'div:contains("wrote:")'
        ];
        
        for (const selector of selectors) {
            const elements = $(selector);
            if (elements.length > 0) {
                let content = elements.first().text().trim();
                
                // "wrote:" などの不要なプレフィックスを除去
                content = content.replace(/^.+?wrote:\s*/i, '');
                content = content.replace(/^.+?said:\s*/i, '');
                content = content.replace(/^.+?posted:\s*/i, '');
                
                if (content.length > 10) { // 最小文字数チェック
                    return this.cleanContent(content);
                }
            }
        }
        
        // フォールバック: メール本文全体から投稿内容を推測
        const fullText = $.text();
        const lines = fullText.split('\n').filter(line => line.trim().length > 0);
        
        // 意味のある行を見つける
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Facebook投稿らしい行を検出
            if (this.isPostContent(line)) {
                let content = line;
                
                // 続く行も投稿内容に含める
                for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
                    const nextLine = lines[j].trim();
                    if (this.isPostContent(nextLine) && !this.isSystemMessage(nextLine)) {
                        content += '\n' + nextLine;
                    } else {
                        break;
                    }
                }
                
                if (content.length > 20) {
                    return this.cleanContent(content);
                }
            }
        }
        
        this.logger.debug('投稿内容を抽出できませんでした');
        return null;
    }

    isPostContent(text) {
        // システムメッセージではない実際の投稿内容かどうかを判定
        const systemPatterns = [
            /^(To help keep|You're receiving|This message was sent|Facebook|Copyright|Privacy|Terms)/i,
            /^(View|Reply|Like|Comment|Share|Unsubscribe)/i,
            /^(http|www\.)/i,
            /^[0-9\s\-:]+$/, // 日付のみ
            /^.{0,5}$/ // 短すぎる
        ];
        
        return !systemPatterns.some(pattern => pattern.test(text));
    }

    isSystemMessage(text) {
        const systemPatterns = [
            /facebook\.com/i,
            /unsubscribe/i,
            /privacy policy/i,
            /terms of service/i,
            /help center/i,
            /view on facebook/i
        ];
        
        return systemPatterns.some(pattern => pattern.test(text));
    }

    cleanContent(content) {
        // 投稿内容をクリーンアップ
        return content
            .replace(/\s+/g, ' ') // 連続空白を単一空白に
            .replace(/\n\s*\n/g, '\n') // 連続改行を単一改行に
            .trim();
    }

    extractPostType(subject, $) {
        const typePatterns = {
            'photo': /added a new photo|posted a photo|shared .*photo/i,
            'status': /updated their status|wrote on their timeline/i,
            'shared': /shared a post|shared .*link|shared a video/i,
            'video': /posted a video|shared a video/i,
            'link': /shared a link|posted a link/i,
            'group': /posted in .*group/i,
            'page': /posted on .*page/i
        };
        
        for (const [type, pattern] of Object.entries(typePatterns)) {
            if (pattern.test(subject)) {
                return type;
            }
        }
        
        return 'post'; // デフォルト
    }

    parseDate(dateString) {
        try {
            return new Date(dateString).toISOString();
        } catch (error) {
            this.logger.debug('日付解析エラー:', error);
            return new Date().toISOString();
        }
    }

    extractImages($) {
        const images = [];
        
        $('img').each((i, elem) => {
            const src = $(elem).attr('src');
            const alt = $(elem).attr('alt') || '';
            
            if (src && !src.includes('facebook.com/tr/') && !src.includes('pixel')) {
                images.push({
                    url: src,
                    alt: alt
                });
            }
        });
        
        return images;
    }

    extractLinks($) {
        const links = [];
        
        $('a').each((i, elem) => {
            const href = $(elem).attr('href');
            const text = $(elem).text().trim();
            
            if (href && !href.includes('facebook.com/help') && !href.includes('unsubscribe')) {
                links.push({
                    url: href,
                    text: text
                });
            }
        });
        
        return links;
    }

    // Facebook投稿の重要度を判定
    calculateImportance(postData) {
        let score = 0;
        
        // 文字数
        if (postData.content.length > 100) score += 2;
        if (postData.content.length > 300) score += 3;
        
        // 投稿タイプ
        if (['photo', 'video'].includes(postData.postType)) score += 2;
        if (postData.postType === 'shared') score += 1;
        
        // 画像の有無
        if (postData.images.length > 0) score += 2;
        
        // リンクの有無
        if (postData.links.length > 0) score += 1;
        
        return score;
    }
}

module.exports = { FacebookParser };

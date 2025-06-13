const OpenAI = require('openai');
const { Logger } = require('../utils/Logger');
const config = require('../../config/config.json');

class BlogGenerator {
    constructor() {
        this.logger = new Logger();
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }

    async generatePost(postData) {
        try {
            this.logger.info(`ブログ記事生成開始: ${postData.author}`);
            
            // AI用プロンプトを構築
            const prompt = this.buildPrompt(postData);
            
            // OpenAI APIでブログ記事生成
            const response = await this.openai.chat.completions.create({
                model: config.ai.model,
                messages: [
                    {
                        role: 'system',
                        content: config.ai.systemPrompt
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: config.ai.maxTokens,
                temperature: config.ai.temperature
            });
            
            const generatedContent = response.choices[0].message.content;
            
            // ブログ記事を構築
            const blogPost = this.buildBlogPost(postData, generatedContent);
            
            this.logger.info('ブログ記事生成完了');
            return blogPost;
            
        } catch (error) {
            this.logger.error('ブログ記事生成エラー:', error);
            
            // フォールバック: シンプルな記事生成
            return this.generateFallbackPost(postData);
        }
    }

    buildPrompt(postData) {
        const prompt = `
Facebook投稿情報:
- 投稿者: ${postData.author}
- 投稿タイプ: ${postData.postType}
- 投稿日時: ${new Date(postData.date).toLocaleString('ja-JP')}
- 投稿内容: "${postData.content}"

${postData.images.length > 0 ? `- 画像: ${postData.images.length}枚` : ''}
${postData.links.length > 0 ? `- リンク: ${postData.links.map(l => l.url).join(', ')}` : ''}

上記のFacebook投稿を元に、以下の要件でブログ記事を作成してください:

1. 投稿内容を分析し、読者にとって興味深いポイントを見つけてください
2. 適切なタイトルを付けてください（50文字以内）
3. 導入部分で投稿の背景や重要性を説明してください
4. 投稿内容を引用形式で紹介してください
5. 投稿に対する考察や分析を加えてください
6. 読者への問いかけや関連する話題で締めくくってください
7. 適切な見出しを使って読みやすく構成してください

記事の長さ: 800-1200文字程度
トーン: 親しみやすく、かつ情報価値のある文章
`;

        return prompt;
    }

    buildBlogPost(postData, generatedContent) {
        // タイトルと本文を分離
        const lines = generatedContent.split('\n').filter(line => line.trim());
        let title = lines[0] || this.generateTitle(postData);
        let content = lines.slice(1).join('\n').trim();
        
        // タイトルのプレフィックスを適用
        if (config.blog.titlePrefix) {
            title = config.blog.titlePrefix + title.replace(/^#+\s*/, '');
        }
        
        // テンプレートを適用
        const template = config.blog.template;
        const fullContent = `${template.header}${content}${template.footer}`;
        
        return {
            title: title,
            content: fullContent,
            category: config.blog.defaultCategory,
            tags: this.generateTags(postData),
            publishedAt: new Date().toISOString(),
            metadata: {
                sourceAuthor: postData.author,
                sourceDate: postData.date,
                postType: postData.postType,
                importance: this.calculateImportance(postData),
                generatedAt: new Date().toISOString()
            }
        };
    }

    generateTitle(postData) {
        const templates = {
            'photo': `${postData.author}さんの写真投稿より`,
            'status': `${postData.author}さんの近況報告`,
            'shared': `${postData.author}さんがシェアした投稿について`,
            'video': `${postData.author}さんの動画投稿`,
            'link': `${postData.author}さんが紹介したリンク`,
            'group': `${postData.author}さんのグループ投稿`,
            'page': `${postData.author}さんのページ投稿`,
            'post': `${postData.author}さんの投稿より`
        };
        
        return templates[postData.postType] || templates['post'];
    }

    generateTags(postData) {
        const tags = ['Facebook', postData.author];
        
        // 投稿タイプに応じたタグ
        const typeTagMap = {
            'photo': '写真',
            'status': '近況',
            'shared': 'シェア',
            'video': '動画',
            'link': 'リンク',
            'group': 'グループ',
            'page': 'ページ'
        };
        
        if (typeTagMap[postData.postType]) {
            tags.push(typeTagMap[postData.postType]);
        }
        
        // 内容からキーワードを抽出（簡単な実装）
        const content = postData.content.toLowerCase();
        const keywords = ['技術', '開発', 'AI', '機械学習', 'プログラミング', 'Web', 'アプリ', 'スタートアップ', 'ビジネス'];
        
        for (const keyword of keywords) {
            if (content.includes(keyword.toLowerCase())) {
                tags.push(keyword);
            }
        }
        
        return [...new Set(tags)]; // 重複除去
    }

    calculateImportance(postData) {
        let score = 0;
        
        // 文字数
        if (postData.content.length > 100) score += 1;
        if (postData.content.length > 300) score += 2;
        if (postData.content.length > 500) score += 3;
        
        // 投稿タイプ
        const typeScores = {
            'photo': 2,
            'video': 3,
            'shared': 1,
            'link': 1,
            'status': 1,
            'group': 2,
            'post': 1
        };
        score += typeScores[postData.postType] || 1;
        
        // メディア
        score += postData.images.length;
        score += postData.links.length * 0.5;
        
        return Math.min(score, 10); // 最大10点
    }

    generateFallbackPost(postData) {
        this.logger.info('フォールバック記事生成');
        
        const title = this.generateTitle(postData);
        const content = `
# ${postData.author}さんの投稿より

${new Date(postData.date).toLocaleDateString('ja-JP')}に${postData.author}さんがFacebookに投稿された内容をご紹介します。

## 投稿内容

> ${postData.content}

${postData.images.length > 0 ? `\n※ この投稿には${postData.images.length}枚の画像が含まれています。\n` : ''}
${postData.links.length > 0 ? `\n※ この投稿には関連リンクが含まれています。\n` : ''}

## 所感

興味深い投稿ですね。詳細は元の投稿をご確認ください。

---

*この記事はFacebook投稿から自動生成されました*
`;
        
        return {
            title: config.blog.titlePrefix + title,
            content: content,
            category: config.blog.defaultCategory,
            tags: this.generateTags(postData),
            publishedAt: new Date().toISOString(),
            metadata: {
                sourceAuthor: postData.author,
                sourceDate: postData.date,
                postType: postData.postType,
                fallback: true,
                generatedAt: new Date().toISOString()
            }
        };
    }

    // カスタムテンプレートでの記事生成
    async generateWithTemplate(postData, template) {
        try {
            const customPrompt = template.replace(/\{(\w+)\}/g, (match, key) => {
                return postData[key] || match;
            });
            
            const response = await this.openai.chat.completions.create({
                model: config.ai.model,
                messages: [
                    {
                        role: 'system',
                        content: 'あなたは指定されたテンプレートに従ってブログ記事を作成します。'
                    },
                    {
                        role: 'user',
                        content: customPrompt
                    }
                ],
                max_tokens: config.ai.maxTokens,
                temperature: config.ai.temperature
            });
            
            return response.choices[0].message.content;
            
        } catch (error) {
            this.logger.error('カスタムテンプレート生成エラー:', error);
            return null;
        }
    }
}

module.exports = { BlogGenerator };
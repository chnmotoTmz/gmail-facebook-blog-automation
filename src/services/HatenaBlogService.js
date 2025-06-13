const axios = require('axios');
const crypto = require('crypto');
const { Logger } = require('../utils/Logger');

class HatenaBlogService {
    constructor() {
        this.logger = new Logger();
        this.apiKey = process.env.HATENA_API_KEY;
        this.apiSecret = process.env.HATENA_API_SECRET;
        this.username = process.env.HATENA_USERNAME;
        this.blogId = process.env.HATENA_BLOG_ID;
        this.baseUrl = `https://blog.hatena.ne.jp/${this.username}/${this.blogId}/atom`;
    }

    async authenticate() {
        if (!this.apiKey || !this.apiSecret || !this.username || !this.blogId) {
            throw new Error('はてなブログAPIの認証情報が不足しています');
        }
        
        try {
            // 認証テスト
            const response = await this.makeRequest('GET', '/entry');
            this.logger.info('はてなブログAPI認証成功');
            return true;
        } catch (error) {
            this.logger.error('はてなブログAPI認証エラー:', error);
            throw error;
        }
    }

    async publishPost(blogPost) {
        try {
            this.logger.info(`ブログ記事投稿開始: ${blogPost.title}`);
            
            const entry = this.buildAtomEntry(blogPost);
            
            const response = await this.makeRequest('POST', '/entry', entry, {
                'Content-Type': 'application/atom+xml; charset=utf-8'
            });
            
            if (response.status === 201) {
                this.logger.info('ブログ記事投稿成功');
                return this.parseEntryResponse(response.data);
            } else {
                throw new Error(`投稿失敗: ${response.status}`);
            }
            
        } catch (error) {
            this.logger.error('ブログ記事投稿エラー:', error);
            throw error;
        }
    }

    async saveDraft(blogPost) {
        try {
            this.logger.info(`下書き保存開始: ${blogPost.title}`);
            
            const entry = this.buildAtomEntry(blogPost, true); // 下書きフラグ
            
            const response = await this.makeRequest('POST', '/entry', entry, {
                'Content-Type': 'application/atom+xml; charset=utf-8'
            });
            
            if (response.status === 201) {
                this.logger.info('下書き保存成功');
                return this.parseEntryResponse(response.data);
            } else {
                throw new Error(`下書き保存失敗: ${response.status}`);
            }
            
        } catch (error) {
            this.logger.error('下書き保存エラー:', error);
            throw error;
        }
    }

    buildAtomEntry(blogPost, isDraft = false) {
        const categories = blogPost.tags || [];
        const categoryElements = categories.map(tag => 
            `<category term="${this.escapeXml(tag)}" />`
        ).join('\n  ');
        
        const entry = `<?xml version="1.0" encoding="utf-8"?>
<entry xmlns="http://www.w3.org/2005/Atom"
       xmlns:app="http://www.w3.org/2007/app">
  <title>${this.escapeXml(blogPost.title)}</title>
  <author><n>${this.escapeXml(this.username)}</n></author>
  <content type="text/x-markdown">${this.escapeXml(blogPost.content)}</content>
  ${categoryElements}
  <app:control>
    <app:draft>${isDraft ? 'yes' : 'no'}</app:draft>
  </app:control>
</entry>`;
        
        return entry;
    }

    escapeXml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    async makeRequest(method, path, data = null, headers = {}) {
        const url = this.baseUrl + path;
        const timestamp = Math.floor(Date.now() / 1000);
        const nonce = crypto.randomBytes(16).toString('hex');
        
        // OAuth 1.0a署名生成
        const signature = this.generateSignature(method, url, timestamp, nonce, data);
        
        const authHeader = this.buildAuthHeader(timestamp, nonce, signature);
        
        const config = {
            method: method,
            url: url,
            headers: {
                'Authorization': authHeader,
                'User-Agent': 'FacebookBlogAutomation/1.0',
                ...headers
            }
        };
        
        if (data && (method === 'POST' || method === 'PUT')) {
            config.data = data;
        }
        
        return await axios(config);
    }

    generateSignature(method, url, timestamp, nonce, data) {
        const params = {
            oauth_consumer_key: this.apiKey,
            oauth_nonce: nonce,
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: timestamp,
            oauth_version: '1.0'
        };
        
        // パラメーターを正規化
        const sortedParams = Object.keys(params)
            .sort()
            .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
            .join('&');
        
        // 署名ベース文字列を構築
        const signatureBaseString = [
            method.toUpperCase(),
            encodeURIComponent(url),
            encodeURIComponent(sortedParams)
        ].join('&');
        
        // 署名キーを構築
        const signingKey = encodeURIComponent(this.apiSecret) + '&';
        
        // HMAC-SHA1署名を生成
        const signature = crypto
            .createHmac('sha1', signingKey)
            .update(signatureBaseString)
            .digest('base64');
        
        return signature;
    }

    buildAuthHeader(timestamp, nonce, signature) {
        const params = {
            oauth_consumer_key: this.apiKey,
            oauth_nonce: nonce,
            oauth_signature: signature,
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: timestamp,
            oauth_version: '1.0'
        };
        
        const authParams = Object.keys(params)
            .map(key => `${encodeURIComponent(key)}="${encodeURIComponent(params[key])}"`)
            .join(', ');
        
        return `OAuth ${authParams}`;
    }

    parseEntryResponse(responseData) {
        // Atom XMLをパースして記事情報を抽出
        // 簡易実装（実際はXMLパーサーを使用することを推奨）
        const urlMatch = responseData.match(/<link rel="alternate" href="([^"]+)"/);
        const idMatch = responseData.match(/<id>([^<]+)<\/id>/);
        
        return {
            url: urlMatch ? urlMatch[1] : null,
            id: idMatch ? idMatch[1] : null,
            success: true
        };
    }

    async getEntries(limit = 10) {
        try {
            const response = await this.makeRequest('GET', `/entry?page=1&limit=${limit}`);
            return response.data;
        } catch (error) {
            this.logger.error('記事一覧取得エラー:', error);
            throw error;
        }
    }

    async updateEntry(entryId, blogPost) {
        try {
            this.logger.info(`記事更新開始: ${entryId}`);
            
            const entry = this.buildAtomEntry(blogPost);
            
            const response = await this.makeRequest('PUT', `/entry/${entryId}`, entry, {
                'Content-Type': 'application/atom+xml; charset=utf-8'
            });
            
            if (response.status === 200) {
                this.logger.info('記事更新成功');
                return this.parseEntryResponse(response.data);
            } else {
                throw new Error(`記事更新失敗: ${response.status}`);
            }
            
        } catch (error) {
            this.logger.error('記事更新エラー:', error);
            throw error;
        }
    }

    async deleteEntry(entryId) {
        try {
            this.logger.info(`記事削除開始: ${entryId}`);
            
            const response = await this.makeRequest('DELETE', `/entry/${entryId}`);
            
            if (response.status === 200) {
                this.logger.info('記事削除成功');
                return true;
            } else {
                throw new Error(`記事削除失敗: ${response.status}`);
            }
            
        } catch (error) {
            this.logger.error('記事削除エラー:', error);
            throw error;
        }
    }

    // 記事の統計情報取得（はてなブログの場合、APIでは限定的）
    async getPostStats(entryId) {
        try {
            // 基本的な記事情報のみ取得可能
            const response = await this.makeRequest('GET', `/entry/${entryId}`);
            
            // XMLから基本情報を抽出
            const publishedMatch = response.data.match(/<published>([^<]+)<\/published>/);
            const updatedMatch = response.data.match(/<updated>([^<]+)<\/updated>/);
            
            return {
                published: publishedMatch ? publishedMatch[1] : null,
                updated: updatedMatch ? updatedMatch[1] : null,
                // はてなブログAPIではPV数などは取得できない
            };
            
        } catch (error) {
            this.logger.error('記事統計取得エラー:', error);
            return null;
        }
    }
}

module.exports = { HatenaBlogService };
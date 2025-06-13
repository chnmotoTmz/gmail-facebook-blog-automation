const fs = require('fs-extra');
const path = require('path');
const { Logger } = require('./Logger');

class FileManager {
    constructor() {
        this.logger = new Logger();
    }

    // 下書きファイルの管理
    async saveDraftFile(blogPost, postData) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `draft_${timestamp}_${this.sanitizeFilename(postData.author)}.md`;
        const filepath = path.join('drafts', filename);
        
        const frontMatter = `---
title: "${blogPost.title}"
author: "${postData.author}"
source: "Facebook"
postType: "${postData.postType}"
sourceDate: "${postData.date}"
generatedAt: "${new Date().toISOString()}"
tags: [${blogPost.tags.map(tag => `"${tag}"`).join(', ')}]
published: false
---

`;
        
        const content = frontMatter + blogPost.content;
        
        await fs.writeFile(filepath, content, 'utf8');
        this.logger.info(`下書きファイル保存: ${filepath}`);
        
        return {
            filename: filename,
            filepath: filepath,
            size: content.length
        };
    }

    // ファイル名の無害化
    sanitizeFilename(filename) {
        return filename
            .replace(/[<>:"/\\|?*]/g, '_')
            .replace(/\s+/g, '_')
            .substring(0, 50);
    }

    // 古い下書きファイルのクリーンアップ
    async cleanupOldDrafts(daysOld = 30) {
        try {
            const draftsDir = 'drafts';
            const files = await fs.readdir(draftsDir);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);
            
            let deletedCount = 0;
            
            for (const file of files) {
                const filepath = path.join(draftsDir, file);
                const stats = await fs.stat(filepath);
                
                if (stats.mtime < cutoffDate) {
                    await fs.remove(filepath);
                    deletedCount++;
                    this.logger.debug(`古い下書きを削除: ${file}`);
                }
            }
            
            this.logger.info(`${deletedCount}個の古い下書きファイルを削除しました`);
            return deletedCount;
            
        } catch (error) {
            this.logger.error('下書きクリーンアップエラー:', error);
            return 0;
        }
    }

    // ログファイルのローテーション
    async rotateLogFiles() {
        try {
            const logsDir = 'logs';
            const maxSize = 10 * 1024 * 1024; // 10MB
            const files = await fs.readdir(logsDir);
            
            for (const file of files) {
                if (path.extname(file) === '.log') {
                    const filepath = path.join(logsDir, file);
                    const stats = await fs.stat(filepath);
                    
                    if (stats.size > maxSize) {
                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                        const backupPath = path.join(logsDir, `${path.basename(file, '.log')}_${timestamp}.log`);
                        
                        await fs.move(filepath, backupPath);
                        this.logger.info(`ログファイルをローテーション: ${file} -> ${path.basename(backupPath)}`);
                    }
                }
            }
            
        } catch (error) {
            this.logger.error('ログローテーションエラー:', error);
        }
    }

    // 統計情報の保存
    async saveStats(stats) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `stats_${timestamp}.json`;
        const filepath = path.join('logs', filename);
        
        await fs.writeJson(filepath, {
            timestamp: new Date().toISOString(),
            ...stats
        }, { spaces: 2 });
        
        this.logger.debug(`統計情報保存: ${filepath}`);
    }

    // バックアップの作成
    async createBackup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupDir = path.join('temp', `backup_${timestamp}`);
            
            await fs.ensureDir(backupDir);
            
            // 設定ファイル
            await fs.copy('config', path.join(backupDir, 'config'));
            
            // 下書きファイル
            if (await fs.pathExists('drafts')) {
                await fs.copy('drafts', path.join(backupDir, 'drafts'));
            }
            
            // ログファイル（最新のみ）
            const logsDir = 'logs';
            const backupLogsDir = path.join(backupDir, 'logs');
            await fs.ensureDir(backupLogsDir);
            
            const logFiles = await fs.readdir(logsDir);
            for (const file of logFiles.slice(-5)) { // 最新5ファイルのみ
                await fs.copy(
                    path.join(logsDir, file),
                    path.join(backupLogsDir, file)
                );
            }
            
            this.logger.info(`バックアップ作成完了: ${backupDir}`);
            return backupDir;
            
        } catch (error) {
            this.logger.error('バックアップ作成エラー:', error);
            throw error;
        }
    }

    // 設定ファイルの検証
    async validateConfigFiles() {
        const configFiles = [
            'config/config.json',
            '.env'
        ];
        
        const results = {};
        
        for (const file of configFiles) {
            try {
                const exists = await fs.pathExists(file);
                results[file] = {
                    exists: exists,
                    readable: exists ? await this.isReadable(file) : false
                };
                
                if (exists) {
                    const stats = await fs.stat(file);
                    results[file].size = stats.size;
                    results[file].modified = stats.mtime;
                }
                
            } catch (error) {
                results[file] = {
                    exists: false,
                    error: error.message
                };
            }
        }
        
        return results;
    }

    async isReadable(filepath) {
        try {
            await fs.access(filepath, fs.constants.R_OK);
            return true;
        } catch {
            return false;
        }
    }

    // ディスク使用量チェック
    async getDiskUsage() {
        try {
            const directories = ['logs', 'drafts', 'temp'];
            const usage = {};
            
            for (const dir of directories) {
                if (await fs.pathExists(dir)) {
                    usage[dir] = await this.getDirectorySize(dir);
                } else {
                    usage[dir] = 0;
                }
            }
            
            return usage;
            
        } catch (error) {
            this.logger.error('ディスク使用量取得エラー:', error);
            return {};
        }
    }

    async getDirectorySize(dirPath) {
        let size = 0;
        
        const files = await fs.readdir(dirPath);
        
        for (const file of files) {
            const filepath = path.join(dirPath, file);
            const stats = await fs.stat(filepath);
            
            if (stats.isDirectory()) {
                size += await this.getDirectorySize(filepath);
            } else {
                size += stats.size;
            }
        }
        
        return size;
    }
}

module.exports = { FileManager };
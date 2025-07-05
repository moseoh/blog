#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

const sourceDir = 'node_modules/.astro/notion2md/content/posts';
const targetDir = 'src/content/posts';

async function copyPosts() {
  try {
    console.log('📦 Copying posts from cache to content directory...');
    
    // Check if source directory exists
    try {
      await fs.access(sourceDir);
    } catch {
      console.log('⚠️  No cached posts found. Run sync first.');
      return;
    }

    // Remove existing posts
    try {
      await fs.rm(targetDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist, that's fine
    }

    // Create target directory
    await fs.mkdir(targetDir, { recursive: true });

    // Copy all posts
    const items = await fs.readdir(sourceDir);
    
    for (const item of items) {
      const sourcePath = path.join(sourceDir, item);
      const targetPath = path.join(targetDir, item);
      
      const stat = await fs.stat(sourcePath);
      if (stat.isDirectory()) {
        await fs.cp(sourcePath, targetPath, { recursive: true });
        console.log(`✅ Copied: ${item}`);
      }
    }
    
    console.log('🎉 Posts copied successfully!');
  } catch (error) {
    console.error('❌ Error copying posts:', error);
    process.exit(1);
  }
}

copyPosts();
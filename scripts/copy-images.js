import { promises as fs } from 'fs';
import { join } from 'path';

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function main(){
  const src = join(process.cwd(), 'images');
  const dest = join(process.cwd(), 'dist', 'images');
  try {
    await copyDir(src, dest);
    console.log('Copied images to dist/images');
  } catch (err) {
    console.error('Failed copying images:', err);
    process.exit(1);
  }
}

main();

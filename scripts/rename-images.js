import { promises as fs } from 'fs';
import { join, extname } from 'path';

/**
 * Converts a name to lowercase-kebab-case:
 *   "Amora Heart Bracelet" -> "amora-heart-bracelet"
 *   "WhatsApp Image 2026-07-23 at 6.26.45 PM (2).jpeg" -> "whatsapp-image-2026-07-23-at-6-26-45-pm-2.jpeg"
 *   "ChatGPT Image Jul 22, 2026, 08_49_12 PM.png" -> "chatgpt-image-jul-22-2026-08-49-12-pm.png"
 */
function toKebab(name) {
  const ext = extname(name);
  const base = name.slice(0, name.length - ext.length);

  let kebab = base
    .replace(/['']/g, '')           // Remove apostrophes
    .replace(/[(),]/g, ' ')         // Replace parens and commas with spaces
    .replace(/[_]/g, '-')           // Replace underscores with hyphens
    .replace(/[.]/g, '-')           // Replace dots with hyphens
    .replace(/\s+/g, '-')           // Replace whitespace with hyphens
    .replace(/-+/g, '-')            // Collapse multiple hyphens
    .replace(/^-|-$/g, '')          // Trim leading/trailing hyphens
    .toLowerCase();

  return kebab + ext.toLowerCase();
}

/**
 * Renames all entries in a directory (depth-first) so that children
 * are renamed before their parent directory.
 */
async function renameRecursive(dirPath, dryRun = false) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const renames = [];

  for (const entry of entries) {
    if (entry.name === '.DS_Store' || entry.name === '__MACOSX') continue;

    const oldPath = join(dirPath, entry.name);

    // Recurse into subdirectories first (depth-first)
    if (entry.isDirectory()) {
      await renameRecursive(oldPath, dryRun);
    }

    const newName = toKebab(entry.name);
    if (newName !== entry.name) {
      const newPath = join(dirPath, newName);
      renames.push({ oldPath, newPath, oldName: entry.name, newName });
    }
  }

  // Perform renames for this level
  for (const r of renames) {
    if (dryRun) {
      console.log(`[DRY] ${r.oldPath} -> ${r.newPath}`);
    } else {
      try {
        await fs.rename(r.oldPath, r.newPath);
        console.log(`RENAMED: ${r.oldName} -> ${r.newName}`);
      } catch (err) {
        console.error(`FAILED: ${r.oldPath} -> ${r.newPath}:`, err.message);
      }
    }
  }
}

async function printTree(dir, indent) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.DS_Store' || entry.name === '__MACOSX' || entry.name === 'node_modules') continue;
    console.log(`${indent}${entry.isDirectory() ? '📁' : '📄'} ${entry.name}`);
    if (entry.isDirectory()) {
      await printTree(join(dir, entry.name), indent + '  ');
    }
  }
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const imagesRoot = join(process.cwd(), 'images', 'PRIZMORA');

  console.log(`${isDryRun ? '[DRY RUN] ' : ''}Renaming images in: ${imagesRoot}\n`);

  await renameRecursive(imagesRoot, isDryRun);

  if (!isDryRun) {
    console.log('\n--- Renaming top-level category folders ---');

    const categories = await fs.readdir(imagesRoot, { withFileTypes: true });
    for (const cat of categories) {
      if (!cat.isDirectory() || cat.name === '.DS_Store' || cat.name === '__MACOSX') continue;
      const newName = toKebab(cat.name);
      if (newName !== cat.name) {
        const oldP = join(imagesRoot, cat.name);
        const newP = join(imagesRoot, newName);
        try {
          await fs.rename(oldP, newP);
          console.log(`RENAMED: ${cat.name} -> ${newName}`);
        } catch (err) {
          console.error(`FAILED: ${cat.name} -> ${newName}:`, err.message);
        }
      }
    }

    // Rename PRIZMORA -> prizmora
    const prizmoraOld = join(process.cwd(), 'images', 'PRIZMORA');
    const prizmoraNew = join(process.cwd(), 'images', 'prizmora');
    try {
      await fs.rename(prizmoraOld, prizmoraNew);
      console.log(`RENAMED: PRIZMORA -> prizmora`);
    } catch (err) {
      console.log(`Note: PRIZMORA folder rename:`, err.message);
    }

    console.log('\n✅ Done! Now listing final structure...\n');

    const finalRoot = join(process.cwd(), 'images');
    await printTree(finalRoot, '');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

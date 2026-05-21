/**
 * Migration Script: Background Image Data Structure
 * 
 * STANDALONE script - uses raw IndexedDB, no dependencies.
 * 
 * Migrates SceneBackgroundImage from old format to new format:
 * OLD: { opacity, borderFade, colorFilter: {...}, blendMode, ... }
 * NEW: { appearance: { opacity, borderFade, brightness, contrast, ... }, ... }
 * 
 * Usage:
 * 1. Open browser to localhost:5173 (even if app crashes, that's OK)
 * 2. Open browser console (F12)
 * 3. Copy and paste this entire script
 * 4. Run: await migrateBackgroundImages()
 * 5. Refresh the page
 * 
 * Safety features:
 * - Dry run mode by default (preview only)
 * - Creates backup before modifying
 * - Only modifies backgroundImages property, preserves everything else
 * 
 * Delete this file after successful migration.
 */

async function migrateBackgroundImages(dryRun = true) {
  console.log('🔄 Starting background image migration...');
  console.log(dryRun ? '🔍 DRY RUN MODE - no changes will be made' : '⚠️  LIVE MODE - will modify database');
  
  const dbName = 'knogra-graph';
  
  // Open database using raw IndexedDB
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onerror = () => reject(new Error(`Failed to open database: ${request.error}`));
    request.onsuccess = () => resolve(request.result);
  });
  
  console.log(`📂 Opened database: ${dbName} (version ${db.version})`);
  
  // Check if scenes table exists
  if (!db.objectStoreNames.contains('scenes')) {
    console.error('❌ No "scenes" table found in database');
    db.close();
    return;
  }
  
  // Read all scenes
  const scenes = await new Promise((resolve, reject) => {
    const tx = db.transaction('scenes', 'readonly');
    const store = tx.objectStore('scenes');
    const request = store.getAll();
    request.onerror = () => reject(new Error(`Failed to read scenes: ${request.error}`));
    request.onsuccess = () => resolve(request.result);
  });
  
  console.log(`📋 Found ${scenes.length} scene(s)`);
  
  // Analyze and prepare migrations
  let migratedCount = 0;
  let skippedCount = 0;
  const toUpdate = [];
  
  for (const scene of scenes) {
    if (!scene.backgroundImages || scene.backgroundImages.length === 0) {
      skippedCount++;
      continue;
    }
    
    let needsMigration = false;
    
    // Check each background image
    for (const img of scene.backgroundImages) {
      if (!img.appearance && (img.opacity !== undefined || img.colorFilter !== undefined)) {
        needsMigration = true;
        break;
      }
    }
    
    if (!needsMigration) {
      console.log(`  ⏭️  Scene "${scene.name || scene.id}": already migrated`);
      skippedCount++;
      continue;
    }
    
    // Prepare migrated images
    const migratedImages = scene.backgroundImages.map(img => {
      if (img.appearance) return img; // Already migrated
      
      const colorFilter = img.colorFilter || {};
      
      return {
        id: img.id,
        imageId: img.imageId,
        position: img.position,
        size: img.size,
        zIndex: img.zIndex,
        appearance: {
          opacity: img.opacity ?? 1,
          blendMode: img.blendMode ?? 'source-over',
          brightness: colorFilter.brightness ?? 1,
          contrast: colorFilter.contrast ?? 1,
          saturation: colorFilter.saturation ?? 1,
          hue: colorFilter.hue ?? 0,
          blur: colorFilter.blur ?? 0,
          borderFade: img.borderFade ?? 0,
          mask: img.mask
        }
      };
    });
    
    console.log(`  🔧 Scene "${scene.name || scene.id}": ${migratedImages.length} image(s) to migrate`);
    console.log(`     Before:`, JSON.stringify(scene.backgroundImages[0], null, 2).substring(0, 200) + '...');
    console.log(`     After:`, JSON.stringify(migratedImages[0], null, 2).substring(0, 200) + '...');
    
    toUpdate.push({
      scene,
      migratedImages
    });
    migratedCount++;
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   To migrate: ${migratedCount} scene(s)`);
  console.log(`   Skipped: ${skippedCount} scene(s)`);
  
  if (dryRun) {
    console.log(`\n🔍 DRY RUN complete. No changes made.`);
    console.log(`   To apply changes, run: await migrateBackgroundImages(false)`);
    db.close();
    return { migratedCount, skippedCount, applied: false };
  }
  
  if (toUpdate.length === 0) {
    console.log(`\n✅ No migration needed.`);
    db.close();
    return { migratedCount: 0, skippedCount, applied: true };
  }
  
  // Create backup
  console.log(`\n💾 Creating backup...`);
  const backup = scenes.map(s => ({ ...s }));
  window._scenesBackup = backup;
  console.log(`   Backup saved to window._scenesBackup (${backup.length} scenes)`);
  
  // Apply migrations
  console.log(`\n⚡ Applying migrations...`);
  
  await new Promise((resolve, reject) => {
    const tx = db.transaction('scenes', 'readwrite');
    const store = tx.objectStore('scenes');
    
    for (const { scene, migratedImages } of toUpdate) {
      // Create updated scene - preserve ALL existing properties
      const updatedScene = {
        ...scene,
        backgroundImages: migratedImages
      };
      store.put(updatedScene);
    }
    
    tx.oncomplete = () => {
      console.log(`   ✅ All scenes updated successfully`);
      resolve();
    };
    tx.onerror = () => {
      console.error(`   ❌ Transaction failed:`, tx.error);
      reject(tx.error);
    };
  });
  
  db.close();
  
  console.log(`\n✅ Migration complete!`);
  console.log(`   Migrated: ${migratedCount} scene(s)`);
  console.log(`   Backup available at: window._scenesBackup`);
  console.log(`\n🔄 Please refresh the page to load the migrated data.`);
  
  return { migratedCount, skippedCount, applied: true };
}

// Restore function in case something goes wrong
async function restoreBackup() {
  if (!window._scenesBackup) {
    console.error('❌ No backup found. Cannot restore.');
    return;
  }
  
  const dbName = 'knogra-graph';
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  
  await new Promise((resolve, reject) => {
    const tx = db.transaction('scenes', 'readwrite');
    const store = tx.objectStore('scenes');
    
    for (const scene of window._scenesBackup) {
      store.put(scene);
    }
    
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  
  db.close();
  console.log('✅ Backup restored. Refresh the page.');
}

window.migrateBackgroundImages = migrateBackgroundImages;
window.restoreBackup = restoreBackup;

console.log('📦 Migration script loaded.');
console.log('');
console.log('Commands:');
console.log('  await migrateBackgroundImages()       - Preview changes (dry run)');
console.log('  await migrateBackgroundImages(false)  - Apply changes');
console.log('  await restoreBackup()                 - Restore from backup if needed');

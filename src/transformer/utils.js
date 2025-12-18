const private_char_map = require('./PrivateChars.js');
const path = require('path');
const fs = require('fs-extra');

const PUBLIC_IMAGES_DIR = path.resolve(__dirname, '../../public/images');

function publishImage(filePath, filename) {
    try {
        if (!fs.existsSync(PUBLIC_IMAGES_DIR)) {
            fs.ensureDirSync(PUBLIC_IMAGES_DIR);
        }
        const destPath = path.join(PUBLIC_IMAGES_DIR, filename);
        fs.copyFileSync(filePath, destPath);
        console.log(`Published image to ${destPath}`);
    } catch (err) {
        console.error(`Failed to publish image ${filename}:`, err);
    }
}

module.exports = {
    private_char_map,
    publishImage,
    validateDeepZipStructure
};

// twoLevelCheckOnly = false -> 3 Level Check  level 1 -> level 2 -> level 3
// twoLevelCheckOnly = true -> 2 Level Check skip level 1, level 2 -> level 3
async function validateDeepZipStructure(startDir, twoLevelCheckOnly = false) {
    // Helper: Get visible directories
    const getDirs = async (dir) => {
        const dirents = await fs.readdir(dir, { withFileTypes: true });
        return dirents
            .filter(d => d.isDirectory() && d.name !== '__MACOSX' && !d.name.startsWith('.'))
            .map(d => d.name);
    };

    let rootDir = null;
    if (!twoLevelCheckOnly) {
        // Level 1: Zip Root -> Level 1 Dir
        let dirs = await getDirs(startDir);
        if (dirs.length !== 1) {
            throw new Error(`Validation Level 1 Failed: ZIP root must contain exactly one directory (found ${dirs.length}: ${dirs.join(', ')}).`);
        }
        rootDir = path.join(startDir, dirs[0]);
    } else {
        rootDir = startDir;
    }

    // Level 2: Level 1 -> Level 2 Dir
    let dirs = await getDirs(rootDir);
    if (dirs.length !== 1) {
        throw new Error(`Validation Level 2 Failed: Directory '${path.basename(rootDir)}' must contain exactly one subdirectory.`);
    }
    const level2Dir = path.join(rootDir, dirs[0]);

    // Level 3: Level 2 -> Level 3 Dir
    dirs = await getDirs(level2Dir);
    if (dirs.length !== 1) {
        throw new Error(`Validation Level 3 Failed: Directory '${path.basename(level2Dir)}' must contain exactly one subdirectory.`);
    }
    const level3Dir = path.join(level2Dir, dirs[0]);

    // Check Content
    if (!fs.existsSync(path.join(level3Dir, 'content.xml'))) {
        throw new Error(`Validation Failed: '${path.basename(level3Dir)}' is missing 'content.xml'.`);
    }
    if (!fs.existsSync(path.join(level3Dir, 'metadata.xml'))) {
        throw new Error(`Validation Failed: '${path.basename(level3Dir)}' is missing 'metadata.xml'.`);
    }

    return level3Dir;
}

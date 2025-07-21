const fs = require('fs');
const path = require('path');
const glob = require('glob');

const rootDir = path.join(__dirname, '..');
const distDir = path.join(__dirname, '../dist');
// glob all img files in src/img
const imgFiles = glob.sync('src/**/img/**/*.png');

// list of files to copy
const files = [
  'src/testIDs.js',
  'src/testUtils.js',
  'package.json',
  '.yarnrc.yml',
  'yarn.lock',
  'tsconfig.json',
  ...imgFiles
];

console.log(files);

files.forEach(file => {
  const distFile = path.join(distDir, file);
  const srcFile = path.join(rootDir, file);
  // If directory doesn't exist, create it
  if (!fs.existsSync(path.dirname(distFile))) {
    fs.mkdirSync(path.dirname(distFile), {recursive: true});
  }
  fs.copyFileSync(srcFile, distFile);
});

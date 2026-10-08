const fs = require('fs');
let content = fs.readFileSync('src/components/ui.tsx', 'utf8');
const start = content.indexOf('export const theme = {');
const end = content.indexOf('} as const;');
if (start !== -1 && end !== -1) {
  content = content.substring(0, start) + 'import { theme as rawTheme } from "../theme";\nexport const theme = rawTheme;' + content.substring(end + '} as const;'.length);
  fs.writeFileSync('src/components/ui.tsx', content);
  console.log('Done');
} else {
  console.log('Not found');
}

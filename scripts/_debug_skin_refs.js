const fs = require('fs');
const json = JSON.parse(fs.readFileSync('assets/Spine/Main_Character.json', 'utf8'));
const removed = ['Fire_Wizard', 'Kasumi', 'Lance', 'Vlad'];

for (const [key, val] of Object.entries(json)) {
  const str = JSON.stringify(val);
  const has = removed.filter(s => str.includes(s));
  if (has.length === 0) continue;

  if (key === 'animations') {
    for (const [animName, animData] of Object.entries(val)) {
      for (const [section, sectionData] of Object.entries(animData)) {
        const secStr = JSON.stringify(sectionData);
        const secHas = removed.filter(s => secStr.includes(s));
        if (secHas.length > 0) {
          console.log('animations.' + animName + '.' + section);
          if (typeof sectionData === 'object' && sectionData !== null && !Array.isArray(sectionData)) {
            for (const k of Object.keys(sectionData)) {
              const kStr = k + JSON.stringify(sectionData[k]);
              const kHas = removed.filter(s => kStr.includes(s));
              if (kHas.length > 0) console.log('  key: "' + k + '" refs: ' + kHas.join(', '));
            }
          }
        }
      }
    }
  } else {
    console.log(key + ': references ' + has.join(', '));
  }
}

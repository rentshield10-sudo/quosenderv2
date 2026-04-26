import { db } from './packages/server/src/db/database';

const normalize = (val: string) => {
    if (!val) return '';
    return val.toLowerCase()
    .replace(/#|apt|apartment|floor|fl|ste|suite|floor|st|ave|rd|blvd|lane|ln|drive|dr|court|ct|street|avenue|road|boulevard/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const properties = db.prepare('SELECT * FROM properties').all() as any[];

console.log('--- TEST PARSING ---');

const testLines = [
    '18622792719 31 Linden Ave APT 2',
    '19738610809 31 Linden Ave APT 2',
    '18624474673 179 Ridgewood Ave Floor 1'
];

for (const line of testLines) {
    const digitMatches = line.match(/(\+?1?\s*\(?[2-9]\d{2}\)?\s*[-.]?\s*\d{3}\s*[-.]?\s*\d{4})/);
    let extractedPhone = '';
    if (digitMatches) {
        const digits = digitMatches[1].replace(/\D/g, '');
        extractedPhone = '+1' + digits.slice(digits.length - 10);
    }
    
    let lineForMatching = line;
    if (digitMatches) {
        lineForMatching = line.replace(digitMatches[1], ' ');
    }
    const normLine = normalize(lineForMatching);
    
    let matchedProp = null;
    for (const p of properties) {
        let hasAddress = false;
        const normName = normalize(p.name);
        if (normName && normName.length > 4 && normLine.includes(normName)) {
            matchedProp = p;
            break;
        }

        const normAddr = normalize(p.address);
        if (normAddr && normLine.includes(normAddr)) {
            hasAddress = true;
        } else {
            const addrTokens = normAddr.split(' ');
            if (addrTokens.length >= 2) {
                const coreTokens = addrTokens.slice(0, 2).join(' ');
                if (coreTokens.length > 4 && normLine.includes(coreTokens)) {
                    hasAddress = true;
                }
            }
            if (!hasAddress && addrTokens.length >= 2) {
                const lineTokens = new Set(normLine.split(' '));
                let matches = 0;
                for (const t of addrTokens.slice(0, 4)) {
                   if (t.length > 2 && lineTokens.has(t)) matches++;
                }
                if (matches >= 2) hasAddress = true;
            }
        }
        if (hasAddress) {
            matchedProp = p;
            break;
        }
    }
    
    console.log(`Input: "${line}"`);
    console.log(`Phone: ${extractedPhone}`);
    console.log(`Norm Line: "${normLine}"`);
    console.log(`Matched: ${matchedProp ? matchedProp.name : 'NONE'}`);
    console.log('------------------');
}

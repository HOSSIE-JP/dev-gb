import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function runtimeNotices() {
    const names = Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies);
    const seen = new Set();
    const sections = ['Third-party runtime notices\n\nThis file preserves notices; it is not a redistribution clearance. See docs/licensing.md, including the pinned WASM bootstrap issue.'];
    for (let i = 0; i < names.length; i++) {
        const name = names[i]; if (seen.has(name)) continue; seen.add(name);
        const directory = path.join(root, 'node_modules', name);
        const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
        const files = fs.readdirSync(directory).filter(p => /^(licen[cs]e|copying|notice)(\.|$)/i.test(p)).sort();
        if (!files.length) throw new Error(`Missing license text for runtime dependency ${name}`);
        sections.push(`${name} ${pkg.version} — ${pkg.license ?? 'see license text'}\n` + files.map(p => fs.readFileSync(path.join(directory, p), 'utf8')).join('\n'));
        names.push(...Object.keys(pkg.dependencies ?? {}));
    }
    for (const file of ['licenses/CC0-1.0.txt', 'licenses/SameBoy-LICENSE.txt'])
        sections.push(`${file}\n${fs.readFileSync(path.join(root, '..', file), 'utf8')}`);
    return sections.join('\n\n' + '='.repeat(72) + '\n\n') + '\n';
}
export function writeRuntimeNotices() {
    fs.mkdirSync(path.join(root, 'build'), { recursive: true });
    fs.writeFileSync(path.join(root, 'build/THIRD-PARTY-LICENSES.txt'), runtimeNotices());
    fs.copyFileSync(path.join(root, '../LICENSE'), path.join(root, 'build/LICENSE'));
}

import fs from 'node:fs';
import * as PE from 'pe-library';
import * as ResEdit from 'resedit';
export function brandExecutable(file, iconPath, version) {
    // Editing resources invalidates the upstream Authenticode signature. The
    // generated portable app is unsigned; retain Electron's license alongside it.
    const executable = PE.NtExecutable.from(fs.readFileSync(file), {ignoreCert:true});
    const resources = PE.NtExecutableResource.from(executable);
    const icon = ResEdit.Data.IconFile.from(fs.readFileSync(iconPath));
    const groups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);
    if (!groups.length) throw Error('Electron icon resource missing');
    for (const group of groups) ResEdit.Resource.IconGroupEntry.replaceIconsForResource(resources.entries, group.id, group.lang, icon.icons.map(i=>i.data));
    for (const info of ResEdit.Resource.VersionInfo.fromEntries(resources.entries)) {
        info.setFileVersion(...version.split('.').map(Number), 0, 1033);
        info.setProductVersion(...version.split('.').map(Number), 0, 1033);
        info.setStringValues({lang:1033,codepage:1200}, {FileDescription:'Caravan Editor', ProductName:'Caravan Editor', InternalName:'Caravan-Editor', OriginalFilename:'Caravan-Editor.exe'});
        info.outputToResourceEntries(resources.entries);
    }
    resources.outputResource(executable);
    const bytes=Buffer.from(executable.generate());
    // Reparse the actual PE output, including every embedded size.
    const check=PE.NtExecutableResource.from(PE.NtExecutable.from(bytes));
    for (const group of ResEdit.Resource.IconGroupEntry.fromEntries(check.entries)) {
        if (group.icons.length !== icon.icons.length) throw Error('Embedded icon sizes are incomplete');
    }
    fs.writeFileSync(file, bytes);
}

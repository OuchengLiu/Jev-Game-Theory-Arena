import {cp,mkdir,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url), out=new URL('dist/',root);
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
// Explicit public asset list: never upload Worker config, tests, credentials or local data.
for(const name of ['index.html','version.json','sw.js','assets','css','js','shared']) {
 await cp(new URL(name,root),new URL(name,out),{recursive:true});
}
console.log(`Pages assets ready: ${fileURLToPath(out)}`);

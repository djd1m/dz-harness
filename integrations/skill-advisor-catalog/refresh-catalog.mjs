/** Offline coverage/source check. Never fetch Git or approve prose in a visitor request. */
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {scanPackageInventory} from './catalog-inventory.mjs';
import {recordHash} from './catalog.mjs';
import {currentCatalog} from './cli.mjs';
import {approvedPresentation} from './answer.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const directory=resolve(root,'docs/proposals/skill-advisor-scenarios/full-catalog');
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.slice(2).join(' ')!=='--check')throw Error('Use --check; capture/curate/review a new generation offline before replacing data');
 const read=name=>JSON.parse(readFileSync(resolve(directory,name),'utf8'));
 const observed=await scanPackageInventory(root,read('publication.json'));
 if(recordHash(observed)!==recordHash(read('inventory.json')))throw Error('Catalog source inventory drift; capture and review a replacement generation');
 const catalog=currentCatalog();
 approvedPresentation(catalog,read('presentation.json'),read('presentation-reviews.json'));
 console.log(JSON.stringify({ok:true,revision:catalog.revision,inventoryDigest:catalog.inventoryDigest,...catalog.coverage}));
}

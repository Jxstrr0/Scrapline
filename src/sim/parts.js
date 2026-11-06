/* ---- parts.js: CLASSES (weight classes and their budgets) and PARTS (every slot's options in grams, millimetres and
   thalers), DEFAULT_CFG. Filled in by PR 1 (docs/SCRAPLINE-PLAN.md section 4a-4c). The five classes are named here now so every
   PR uses the same ids: ant 150 g, beetle 1.5 kg, hobby 5.5 kg, feather 14 kg, heavy 110 kg. ---- */
const CLASSES={
  ant:{id:"ant",name:"Antweight",limitG:150},
  beetle:{id:"beetle",name:"Beetleweight",limitG:1500},
  hobby:{id:"hobby",name:"Hobbyweight",limitG:5500},
  feather:{id:"feather",name:"Featherweight",limitG:14000},
  heavy:{id:"heavy",name:"Heavyweight",limitG:110000}
};
const PARTS={};
const DEFAULT_CFG={cls:"beetle"};

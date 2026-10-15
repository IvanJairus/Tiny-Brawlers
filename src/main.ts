import { boot } from './boot';

const stage = document.getElementById('stage');
const ui = document.getElementById('ui');
if (stage && ui) boot(stage, ui);

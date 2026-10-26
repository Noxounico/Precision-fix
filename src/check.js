import { readConfig } from './config.js';
import { loadState } from './state.js';
try {
  const config = readConfig();
  await loadState(config.stateFile);
  console.log('Configuração e estado válidos. Este comando não liga ao Discord nem envia mensagens.');
} catch (error) { console.error(error.message); process.exitCode = 1; }

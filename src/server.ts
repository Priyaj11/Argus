import { app } from './app.js';
import { startWorker } from './worker.js';
import { initDb } from './db.js';

initDb()
  .then(() => console.log('Database ready'))
  .catch((err) => console.log('Database init failed:', err.message));

startWorker();

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
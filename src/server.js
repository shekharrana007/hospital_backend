const app = require('./app');
const { initDb } = require('./db');
const config = require('./config');

async function start() {
  await initDb();

  app.listen(config.port, () => {
    console.log(
      `OPD Token Allocation Engine listening on http://localhost:${config.port}`
    );
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});



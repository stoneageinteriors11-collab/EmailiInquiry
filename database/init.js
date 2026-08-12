require("dotenv").config();
const { initDatabase, pool } = require("./db");

initDatabase()
  .then(async () => {
    console.log("Enquiry database tables are ready.");
    await pool.end();
  })
  .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
  });

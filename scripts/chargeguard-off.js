require("../src/env").loadEnv();
const { setPlug } = require("../src/wiz");

setPlug(false)
  .then(() => console.log("charger off"))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });

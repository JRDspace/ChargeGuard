require("../src/env").loadEnv();
const { getBattery } = require("../src/battery");
const { setPlug } = require("../src/wiz");

const low = Number(process.env.CHARGEGUARD_LOW) >= 5 ? Number(process.env.CHARGEGUARD_LOW) : 20;

// Runs on shutdown and sleep. Disconnecting the charger while the laptop is
// off is normally right, but at or below the low limit it would strand the
// machine: the battery self-drains, and once it is empty the laptop cannot
// boot to ever turn the plug back on. In that case leave the charger
// connected instead.
(async () => {
  let battery = null;
  try {
    battery = await getBattery();
  } catch (_err) {}
  if (battery && Number.isFinite(battery.percent) && battery.percent <= low) {
    await setPlug(true);
    console.log(`battery at ${battery.percent}% (<= ${low}%): charger left connected so the laptop can charge while off`);
  } else {
    await setPlug(false);
    console.log("charger off");
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

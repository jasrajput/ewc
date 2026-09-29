const { dailyClosing } = require("./closing");

console.log("Starting daily closing...");

dailyClosing()
.then(() => {
    console.log("DAILY CLOSING SUCCESS");
    process.exit(0);
})
.catch((error) => {
    console.error("DAILY CLOSING FAILED:", error);
    process.exit(1);
});
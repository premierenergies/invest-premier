import YahooFinance from "yahoo-finance2";
 
const yahooFinance = new YahooFinance();
 
async function getDailyData(symbol) {
  try {
    const data = await yahooFinance.quote(symbol);
 
    const volume = data.regularMarketVolume;
    const close  = data.regularMarketPrice;
    const valueTraded = volume * close;
 
    console.log(`Symbol: ${symbol}`);
    console.log(`Date:   ${new Date().toISOString().split("T")[0]}`);
    console.log(`Close Price: ₹${close.toLocaleString("en-IN")}`);
    console.log(`Volume      : ${volume.toLocaleString("en-IN")}`);
    console.log(`Value Traded: ₹${valueTraded.toLocaleString("en-IN")}`);
 
  } catch (err) {
    console.error("Error fetching data:", err);
  }
}
 
getDailyData("PREMIERENE.NS");
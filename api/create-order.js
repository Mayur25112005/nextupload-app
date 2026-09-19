module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const { amount } = req.body || {};
    if (!amount || isNaN(amount)) {
      res.status(400).json({ error: "Invalid amount" });
      return;
    }
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

    const r = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${auth}`,
      },
      body: JSON.stringify({
        amount: Math.round(Number(amount) * 100),
        currency: "INR",
        receipt: "nu_" + Date.now(),
      }),
    });
    const data = await r.json();
    if (data.error) {
      res.status(500).json({ error: data.error.description || "Could not create order" });
      return;
    }
    res.status(200).json({ orderId: data.id, amount: data.amount, keyId });
  } catch (err) {
    res.status(500).json({ error: "Something went wrong: " + (err && err.message ? err.message : String(err)) });
  }
};
